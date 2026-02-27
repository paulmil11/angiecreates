#!/usr/bin/env node
/**
 * Clean up podcast show notes in blog posts:
 * - Remove Angie/Curious Barbell boilerplate contact sections
 * - Remove RSS-sourced Angie promo (Follow Angie, support prompts, etc.)
 * - Remove standalone Angie boilerplate lines (anywhere in post)
 * - Convert bare URLs to inline markdown links (with bullets)
 * - Split jammed multi-URL lines into bullet lists
 * - Convert WordPress [URL](URL) to [Label](URL)
 * - Handle broken WordPress nested markdown
 * - Update email addresses
 * - Keep guest-specific links and resources
 *
 * Usage: node scripts/cleanup-podcast-notes.mjs
 */

import fs from 'fs';
import path from 'path';

const POSTS_DIR = path.resolve('src/content/posts');

// ── Known social platform labels (used for splitting jammed links) ──────────
const PLATFORM_LABELS = 'D\\s*Card|Tik[Tt]ok|IG|Instagram|FB|Facebook|Twitter|X|網站|Website|Email|E-?mail|LinkedIn|Youtube|Blog|Podcast|LINE|粉專|Newsletter|Substack|Linktree';

// ── Angie URL detection ─────────────────────────────────────────────────────
const ANGIE_URL_PATTERNS = [
  /angiewangcreates/i,
  /angieeecreates/i,
  /angiecreates\.(io|substack)/i,
  /mit886\.substack/i,
  /curiousbarbell\.com/i,
];

function isAngieUrl(url) {
  return ANGIE_URL_PATTERNS.some(re => re.test(url));
}

// ── Boilerplate section headers (with optional markdown heading/bold) ───────
const SECTION_HEADERS = [
  /^(#+\s+)?(\*\*)?Contacts?:?(\*\*)?\s*$/i,
  /^(#+\s+)?(\*\*)?Connect with us!?(\*\*)?\s*$/i,
  /^(#+\s+)?(\*\*)?瞭解更多關於好奇槓鈴/,
  /^(#+\s+)?(\*\*)?追蹤(聯絡)?好奇槓鈴/,
  /^(#+\s+)?(\*\*)?在其他.*平台/,
  /^(#+\s+)?(\*\*)?了解更多.*[：:]\s*(\*\*)?\s*$/,
  /^(#+\s+)?(\*\*)?了解更多\s*(\*\*)?\s*$/,
  /^(#+\s+)?(\*\*)?認識我們[！!]?\s*(\*\*)?\s*$/,
  // Angie-specific follow sections
  /^(#+\s+)?(\*\*)?Follow 安吉\s*(\*\*)?\s*$/,
  /^(#+\s+)?(\*\*)?Follow Angie:?\s*(\*\*)?\s*$/i,
  /^(#+\s+)?(\*\*)?Follow Us:?\s*(\*\*)?\s*$/i,
  /^(#+\s+)?(\*\*)?Follow Me!?\s*(\*\*)?\s*$/i,
];

const JUNK_LINES = [
  /^＊馬上訂閱好奇槓鈴/,
  /^-\s+Youtube:\s*$/,
  /^-\s+Youtube:\s+Google Podcast/,
  /^-\s+Google Podcast\s*$/,
  /^-\s+Overcast.*Castro.*Pocket Cast/,
  /^\[\]\(https:\/\/www\.facebook\.com\/dialog\/share/,
  /^\[\]\(https:\/\/twitter\.com\/intent\/tweet/,
  /^<這個 Podcast 已改名為 Angie Creates!?>\s*$/,
  /^\s*★ Support this podcast ★\s*$/,
  /^\s*\[★ Support this podcast ★\]/,
  /^💌\s*(訂閱我的電子報|Newsletter|電子報)/i,
  /^📚\s*點擊追蹤安吉/,
  /^(Twitter|Instagram|IG|Threads)\s+[@\[]?angieeecreates/i,
  /^Newsletter:?\s*(https:\/\/|[\[])/i,
  /^我的(IG|Threads|網站)\s/,
  /^Angie Creates Newsletter/i,
  /^Website\s+https?:\/\/(angiecreates\.io|www\.angiecreates\.io)/i,
];

function isBoilerplateSectionHeader(line) {
  return SECTION_HEADERS.some(re => re.test(line.trim()));
}

function isJunkLine(line) {
  return JUNK_LINES.some(re => re.test(line.trim()));
}

function isSectionContent(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('**收聽本集')) return false;
  if (trimmed === '' || trimmed.startsWith('-') || trimmed.startsWith('*')) return true;
  if (/^(Twitter|Instagram|Newsletter|IG|FB|Facebook|Website|E-?mail|Threads)[\s:@\[]/i.test(trimmed)) return true;
  if (/^(💌|📚|我的IG|我的Threads|我的網站|Angie Creates)/.test(trimmed)) return true;
  return false;
}

/**
 * Check if a line is Angie-specific boilerplate (standalone, outside sections).
 * This catches individual Angie links/text that appear anywhere in the post.
 */
function isAngieBoilerplateLine(line) {
  const trimmed = line.trim();
  const stripped = trimmed.replace(/^[-*]\s+/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  if (!stripped) return false;

  // Direct text patterns for Angie boilerplate
  if (/^(Facebook|IG|Instagram)\s+(&|搜尋|and|:).*Curious Barbell/i.test(stripped)) return true;
  if (/^Website:?\s*(angiecreates|https?:\/\/(www\.)?angiecreates)/i.test(stripped)) return true;
  if (/^E-?mail:?\s*\[?angiewangcreates/i.test(stripped)) return true;
  if (/^E-?mail:?\s*angiewangcreates/i.test(stripped)) return true;
  if (/^Contacts?:?\s*(Facebook|IG|搜尋)/i.test(stripped)) return true;
  if (/^(加入)?好奇槓鈴(IG|FB|Facebook|Email|Website|社團|$)/i.test(stripped)) return true;
  if (/^訂閱E-?mail.*mit886\.substack/i.test(stripped)) return true;

  // Markdown links to Angie URLs: - [label](angie-url)
  const singleLink = stripped.match(/^\[([^\]]*)\]\(([^)]+)\)\s*$/);
  if (singleLink && isAngieUrl(singleLink[2])) return true;

  // Lines where ALL URLs are Angie URLs and the line is link-like
  const urls = [...trimmed.matchAll(/https?:\/\/\S+/g)].map(m => m[0]);
  if (urls.length > 0) {
    const allAngie = urls.every(u => isAngieUrl(u));
    if (allAngie) {
      // All markdown links point to Angie URLs
      const mdLinks = [...trimmed.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)];
      if (mdLinks.length > 0 && mdLinks.every(m => isAngieUrl(m[2]))) return true;
      // Bare URL lines with all Angie URLs (short lines = link-like, not paragraphs)
      if (!mdLinks.length && trimmed.length < 200) return true;
    }
  }

  return false;
}

// ── Broken WordPress markdown handler ───────────────────────────────────────

/**
 * Handle lines with broken WordPress markdown that mix guest and Angie links.
 * Extract guest links and discard Angie boilerplate.
 * Returns null if not applicable, '' to remove line, or replacement text.
 */
function extractGuestLinksFromBrokenMarkdown(line) {
  const trimmed = line.trim();
  // Only handle lines with Angie boilerplate mixed in
  if (!/(好奇槓鈴|angiewangcreates|mit886\.substack)/.test(trimmed)) return null;
  if (!/\[.*?\]\(.*?\)/.test(trimmed)) return null;

  // Extract all markdown links
  const links = [...trimmed.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)];
  const guestLinks = links.filter(m => !isAngieUrl(m[2]) && m[1].trim());

  if (guestLinks.length === 0) return ''; // Remove line entirely
  return guestLinks.map(m => `- [${m[1]}](${m[2]})`).join('\n');
}

// ── Inline link conversion ──────────────────────────────────────────────────

/**
 * Split jammed multi-URL lines into bullet lists with inline links.
 */
function splitJammedLinks(line) {
  const trimmed = line.trim();
  const urlBoundary = `(?=(?:${PLATFORM_LABELS})\\s*[:：]|$)`;
  const pairRegex = new RegExp(
    `((?:${PLATFORM_LABELS})\\s*[:：]?)\\s*(https?:\\/\\/[^\\s]*?${urlBoundary})`,
    'gi'
  );

  const matches = [...trimmed.matchAll(pairRegex)];
  if (matches.length < 2) return null;

  return matches.map(m => {
    const label = m[1].replace(/[:：]+$/, '').trim();
    const url = m[2].trim();
    return `- [${label}](${url})`;
  }).join('\n');
}

/**
 * Convert WordPress [URL-as-text](URL) to [Label](URL).
 */
function convertWordPressLinks(line) {
  return line.replace(
    /^(\s*[-*]\s+)?(.+?)\s*\[((?:https?:\/\/|\/)[^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g,
    (match, bullet, label, urlText, url) => {
      const prefix = bullet || '';
      const cleanLabel = label.trim().replace(/[:：]$/, '').trim();
      if (cleanLabel) return `${prefix}[${cleanLabel}](${url})`;
      return match;
    }
  );
}

/**
 * Convert bare URL lines to inline markdown links with bullets.
 */
function convertBareUrls(line) {
  const trimmed = line.trim();
  if (/\[.*?\]\(.*?\)/.test(trimmed)) return line;
  if (/^(<iframe|!\[|#|---|\*\*收聽本集)/.test(trimmed)) return line;

  const urlMatches = [...trimmed.matchAll(/(https?:\/\/\S+)/g)];
  if (urlMatches.length === 0) return line;

  if (urlMatches.length === 1) {
    const url = urlMatches[0][0].replace(/[\s,]+$/, '');
    let beforeUrl = trimmed.substring(0, urlMatches[0].index).trim().replace(/[:：]+$/, '').trim();
    if (!beforeUrl || beforeUrl === '-' || beforeUrl === '*') return line;
    const hasBullet = /^[-*]\s+/.test(beforeUrl);
    if (hasBullet) beforeUrl = beforeUrl.replace(/^[-*]\s+/, '');
    return `- [${beforeUrl}](${url})`;
  }

  // Multiple URLs — try jammed link splitting first
  const jammed = splitJammedLinks(trimmed);
  if (jammed) return jammed;

  // Fallback: space-separated splitting
  const entries = [];
  let lastEnd = 0;
  for (const urlMatch of urlMatches) {
    const label = trimmed.substring(lastEnd, urlMatch.index).trim().replace(/[:：]+$/, '').trim().replace(/^[-*]\s+/, '');
    const url = urlMatch[0].replace(/[\s,]+$/, '');
    lastEnd = urlMatch.index + urlMatch[0].length;
    entries.push(label ? `- [${label}](${url})` : `- ${url}`);
  }
  return entries.length > 0 ? entries.join('\n') : line;
}

// ── Main cleanup ────────────────────────────────────────────────────────────

function cleanupPost(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return content;

  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  const lines = body.split('\n');
  const cleaned = [];
  let inBoilerplateSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for boilerplate section headers
    if (isBoilerplateSectionHeader(line)) {
      inBoilerplateSection = true;
      continue;
    }

    // In a boilerplate section — remove Angie lines, keep guest lines
    if (inBoilerplateSection) {
      if (line.trim() === '') continue;
      if (isSectionContent(line)) {
        if (isAngieBoilerplateLine(line)) continue;
        // Non-Angie content — keep it, stay in section mode
        // (more Angie lines may follow after guest lines)
      } else {
        inBoilerplateSection = false;
      }
    }

    // Remove standalone Angie boilerplate lines (outside sections too)
    if (isAngieBoilerplateLine(line)) continue;

    // Remove junk lines
    if (isJunkLine(line)) continue;

    // Handle broken WordPress markdown with mixed content
    const brokenFix = extractGuestLinksFromBrokenMarkdown(line);
    if (brokenFix !== null) {
      if (brokenFix) cleaned.push(brokenFix);
      continue;
    }

    let cleanedLine = line;

    // Remove junk share URL fragments
    cleanedLine = cleanedLine.replace(/\[\]\(https:\/\/www\.facebook\.com\/dialog\/share[^)]*\)/g, '');
    cleanedLine = cleanedLine.replace(/\[\]\(https:\/\/twitter\.com\/intent\/tweet[^)]*\)/g, '');

    // Strip trailing "Follow Angie:" or "Follow 安吉"
    cleanedLine = cleanedLine.replace(/Follow Angie:?\s*$/i, '');
    cleanedLine = cleanedLine.replace(/Follow 安吉\s*$/, '');

    // Strip inline Angie promo text
    cleanedLine = cleanedLine.replace(/＊馬上訂閱好奇槓鈴[^＊]*[＊.]*/g, '');

    // Convert WordPress [URL](URL) to [Label](URL)
    cleanedLine = convertWordPressLinks(cleanedLine);

    // Convert bare URLs to inline links with bullets
    cleanedLine = convertBareUrls(cleanedLine);

    // Re-check converted lines for Angie boilerplate
    if (cleanedLine.includes('\n')) {
      // Multi-line result from jammed link splitting — filter each line
      const sublines = cleanedLine.split('\n').filter(l => !isAngieBoilerplateLine(l));
      if (!sublines.some(l => l.trim())) continue;
      cleanedLine = sublines.join('\n');
    } else if (isAngieBoilerplateLine(cleanedLine)) {
      continue;
    }

    cleaned.push(cleanedLine);
  }

  while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') {
    cleaned.pop();
  }
  cleaned.push('');

  body = cleaned.join('\n');
  body = body.replace(/angie@angiecreates\.io/g, 'angiewangcreates@gmail.com');
  body = body.replace(/mailto:angie@angiecreates\.io/g, 'mailto:angiewangcreates@gmail.com');
  let updatedFrontmatter = frontmatter.replace(/angie@angiecreates\.io/g, 'angiewangcreates@gmail.com');

  return updatedFrontmatter + body;
}

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  let modified = 0;
  let emailUpdated = 0;

  for (const file of files) {
    const filePath = path.join(POSTS_DIR, file);
    const original = fs.readFileSync(filePath, 'utf-8');

    const isPodcast = original.includes('"Podcast"') || file.startsWith('podcast-ep') || file.startsWith('ep-') || file.startsWith('ep63');
    if (!isPodcast) {
      if (original.includes('angie@angiecreates.io')) {
        const updated = original.replace(/angie@angiecreates\.io/g, 'angiewangcreates@gmail.com')
          .replace(/mailto:angie@angiecreates\.io/g, 'mailto:angiewangcreates@gmail.com');
        fs.writeFileSync(filePath, updated, 'utf-8');
        console.log(`  [email] ${file}`);
        emailUpdated++;
      }
      continue;
    }

    const cleaned = cleanupPost(original);

    if (cleaned !== original) {
      fs.writeFileSync(filePath, cleaned, 'utf-8');
      const removedLines = original.split('\n').length - cleaned.split('\n').length;
      const hadEmail = original.includes('angie@angiecreates.io');
      console.log(`  [clean] ${file} (${removedLines > 0 ? `-${removedLines}` : removedLines} lines${hadEmail ? ', email updated' : ''})`);
      modified++;
      if (hadEmail) emailUpdated++;
    }
  }

  console.log(`\nModified ${modified} podcast posts. Updated email in ${emailUpdated} total files.`);
}

main();
