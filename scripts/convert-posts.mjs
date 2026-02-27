#!/usr/bin/env node
/**
 * Convert extracted WordPress posts (extracted-posts.json) to Markdown
 * content collection files in src/content/posts/.
 *
 * Usage: node scripts/convert-posts.mjs
 */

import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';

// ── helpers ──────────────────────────────────────────────────────────────────

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8230;/g, '...')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"');
}

// ── Configure Turndown ──────────────────────────────────────────────────────

function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
  });

  // Strip WordPress comment markers (<!-- wp:xxx --> and <!-- /wp:xxx -->)
  td.addRule('wpComments', {
    filter: (node) => node.nodeType === 8,
    replacement: () => '',
  });

  // Keep iframes as raw HTML (YouTube, Substack, Transistor, etc.)
  td.addRule('iframes', {
    filter: 'iframe',
    replacement: (content, node) => {
      return '\n\n' + node.outerHTML + '\n\n';
    },
  });

  // Keep divs that wrap iframes (responsive embed wrappers)
  td.addRule('embedWrappers', {
    filter: (node) => {
      if (node.nodeName !== 'DIV') return false;
      return node.querySelector('iframe') !== null;
    },
    replacement: (content, node) => {
      return '\n\n' + node.outerHTML + '\n\n';
    },
  });

  // Keep HTML tables as raw HTML
  td.addRule('htmlTables', {
    filter: 'table',
    replacement: (content, node) => {
      return '\n\n' + node.outerHTML + '\n\n';
    },
  });

  // Handle <figure> with <img>
  td.addRule('figure', {
    filter: 'figure',
    replacement: (content, node) => {
      const img = node.querySelector('img');
      if (!img) return content;
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      const caption = node.querySelector('figcaption');
      const captionText = caption ? caption.textContent.trim() : '';
      if (captionText) {
        return `\n\n![${alt}](${src})\n*${captionText}*\n\n`;
      }
      return `\n\n![${alt}](${src})\n\n`;
    },
  });

  // Remove WordPress spacer blocks
  td.addRule('wpSpacer', {
    filter: (node) =>
      node.nodeName === 'DIV' &&
      node.classList &&
      node.classList.contains('wp-block-spacer'),
    replacement: () => '',
  });

  // Strip generateblocks wrapper divs but preserve inner content
  td.addRule('generateblocks', {
    filter: (node) => {
      if (node.nodeName !== 'DIV') return false;
      const cls = node.getAttribute('class') || '';
      return cls.includes('gb-container') || cls.includes('gb-grid') || cls.includes('generateblocks');
    },
    replacement: (content) => {
      return '\n\n' + content.trim() + '\n\n';
    },
  });

  // Clean img tags
  td.addRule('cleanImg', {
    filter: 'img',
    replacement: (content, node) => {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      return `![${alt}](${src})`;
    },
  });

  return td;
}

// ── Build Markdown ──────────────────────────────────────────────────────────

function buildMarkdown(meta, markdown) {
  const lines = ['---'];

  // Escape frontmatter values
  const escYaml = (s) => s.replace(/"/g, '\\"');

  lines.push(`title: "${escYaml(meta.title)}"`);
  if (meta.description) lines.push(`description: "${escYaml(meta.description)}"`);
  if (meta.date) lines.push(`date: "${meta.date}"`);
  if (meta.rawDate) lines.push(`rawDate: "${meta.rawDate}"`);
  lines.push(`author: "Angie Wang"`);
  if (meta.image) lines.push(`image: "${meta.image}"`);
  if (meta.categories && meta.categories.length) {
    lines.push(`categories:`);
    meta.categories.forEach((c) => lines.push(`  - "${escYaml(c)}"`));
  }
  if (meta.tags && meta.tags.length) {
    lines.push(`tags:`);
    meta.tags.forEach((t) => lines.push(`  - "${escYaml(t)}"`));
  }
  lines.push('---');
  lines.push('');
  lines.push(markdown.trim());
  lines.push('');
  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

const extractedPath = './extracted-posts.json';
if (!fs.existsSync(extractedPath)) {
  console.error('extracted-posts.json not found. Run import-wordpress.js first.');
  process.exit(1);
}

const posts = JSON.parse(fs.readFileSync(extractedPath, 'utf-8'));
const outDir = path.resolve('src/content/posts');
fs.mkdirSync(outDir, { recursive: true });

const td = createTurndown();
let converted = 0;
let failed = 0;

for (const post of posts) {
  try {
    // Clean WordPress block comments from raw HTML before Turndown
    let html = post.content
      .replace(/<!-- wp:[^\n]*?-->/g, '')
      .replace(/<!-- \/wp:[^\n]*?-->/g, '')
      .replace(/<p>\s*<\/p>/g, '')
      .trim();

    const markdown = td.turndown(html);

    const meta = {
      title: decodeEntities(post.title),
      description: post.excerpt ? decodeEntities(post.excerpt).substring(0, 200) : '',
      date: post.date,
      rawDate: post.rawDate,
      image: post.featuredImage || '',
      categories: post.categories,
      tags: post.tags,
    };

    const final = buildMarkdown(meta, markdown);
    const outFile = path.join(outDir, `${post.slug}.md`);
    fs.writeFileSync(outFile, final, 'utf-8');

    console.log(`  ${post.slug} (${markdown.length} chars)`);
    converted++;
  } catch (err) {
    console.error(`  FAILED: ${post.slug} — ${err.message}`);
    failed++;
  }
}

console.log(`\nDone. Converted: ${converted}, Failed: ${failed}`);
