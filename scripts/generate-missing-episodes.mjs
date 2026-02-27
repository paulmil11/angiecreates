#!/usr/bin/env node
/**
 * Generate landing pages for podcast episodes that don't have blog posts.
 * Fetches RSS feed from Transistor.fm, compares with existing posts,
 * and creates markdown files for missing episodes.
 *
 * Usage: node scripts/generate-missing-episodes.mjs
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { parseStringPromise } from 'xml2js';

const POSTS_DIR = path.resolve('src/content/posts');
const RSS_URL = 'https://feeds.transistor.fm/angie-creates';

// ── Fetch RSS feed ──────────────────────────────────────────────────────────

function fetchRSS(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchRSS(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── Extract episode number from title ───────────────────────────────────────

function extractEpisodeNumber(title) {
  const match = title.match(/(?:#|EP\.?\s?)(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ── Format date ─────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatRawDate(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// ── Strip HTML to plain text ────────────────────────────────────────────────

function htmlToMarkdown(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Get description (truncated for frontmatter) ─────────────────────────────

function getDescription(item) {
  const summary = item['itunes:summary']?.[0] || '';
  const desc = item.description?.[0] || '';
  const text = htmlToMarkdown(summary || desc);
  // Truncate for frontmatter description
  if (text.length > 200) {
    return text.substring(0, 197) + '...';
  }
  return text;
}

// ── Get full body text ──────────────────────────────────────────────────────

function getBodyText(item) {
  const encoded = item['content:encoded']?.[0] || '';
  const desc = item.description?.[0] || '';
  const html = encoded || desc;
  const text = htmlToMarkdown(html);

  // Remove chapter timestamps if present (common in Transistor)
  // Keep the main description, trim excessive content
  const lines = text.split('\n').filter(l => l.trim());

  // Take first ~15 meaningful lines or 1500 chars
  let body = '';
  for (const line of lines) {
    if (body.length > 1500) break;
    body += line + '\n\n';
  }

  return body.trim();
}

// ── Build embed URL ─────────────────────────────────────────────────────────

function getEmbedUrl(item) {
  const link = item.link?.[0] || '';
  if (link.includes('transistor.fm')) {
    const urlParts = new URL(link);
    const episodePath = urlParts.pathname.replace(/^\//, '').replace('episodes/', '').replace(/^s\//, '');
    return `https://share.transistor.fm/e/${episodePath}`;
  }
  return '';
}

// ── Find existing episode numbers ───────────────────────────────────────────

function getExistingEpisodeNumbers() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const existing = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');
    const titleMatch = content.match(/^title:\s*"(.+)"/m);
    if (titleMatch) {
      const epNum = extractEpisodeNumber(titleMatch[1]);
      if (epNum !== null) existing.add(epNum);
    }

    // Also check filename for episode numbers
    const fileMatch = file.match(/(?:podcast-ep|ep-?|ep)(\d+)/i);
    if (fileMatch) existing.add(parseInt(fileMatch[1], 10));
  }

  return existing;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching Transistor RSS feed...');
  const rssXml = await fetchRSS(RSS_URL);
  const result = await parseStringPromise(rssXml);

  const items = result.rss.channel[0].item || [];
  console.log(`Found ${items.length} episodes in RSS feed.`);

  const existing = getExistingEpisodeNumbers();
  console.log(`Found ${existing.size} existing episode numbers in posts.\n`);

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const title = item.title?.[0] || '';
    const epNum = extractEpisodeNumber(title);

    if (epNum === null) {
      console.log(`  [skip] No episode number: "${title}"`);
      skipped++;
      continue;
    }

    if (existing.has(epNum)) {
      continue; // Already has a post
    }

    const embedUrl = getEmbedUrl(item);
    if (!embedUrl) {
      console.log(`  [skip] No embed URL for EP${epNum}: "${title}"`);
      skipped++;
      continue;
    }

    const pubDate = item.pubDate?.[0] || '';
    const description = getDescription(item);
    const bodyText = getBodyText(item);
    const duration = item['itunes:duration']?.[0] || '';

    // Escape quotes in title and description for YAML
    const safeTitle = title.replace(/"/g, '\\"');
    const safeDesc = description.replace(/"/g, '\\"');

    const slug = `podcast-ep${epNum}`;
    const filename = `${slug}.md`;
    const filePath = path.join(POSTS_DIR, filename);

    // Don't overwrite existing files
    if (fs.existsSync(filePath)) {
      console.log(`  [skip] File already exists: ${filename}`);
      continue;
    }

    const markdown = `---
title: "${safeTitle}"
description: "${safeDesc}"
date: "${formatDate(pubDate)}"
rawDate: "${formatRawDate(pubDate)}"
author: "Angie Wang"
image: "/images/podcast-cover.jpg"
categories:
  - "Podcast"
---

<iframe src="${embedUrl}" width="100%" height="180" frameborder="0" scrolling="no" seamless="true" style="width:100%;height:180px;"></iframe>

${bodyText}

**收聽本集 Podcast:** [Spotify](https://open.spotify.com/show/775CHBC6MeTytNmFHCwDU0) · [Apple Podcasts](https://podcasts.apple.com/tw/podcast/angie-creates/id1485860187) · [所有平台](https://angiecreates.transistor.fm)
`;

    fs.writeFileSync(filePath, markdown, 'utf-8');
    console.log(`  [create] ${filename} — EP${epNum}: ${title.substring(0, 60)}...`);
    created++;
  }

  console.log(`\nCreated ${created} new episode pages. Skipped ${skipped}.`);
}

main().catch(console.error);
