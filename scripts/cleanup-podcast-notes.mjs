#!/usr/bin/env node
/**
 * Clean up podcast show notes in blog posts:
 * - Remove Angie/Curious Barbell boilerplate contact sections
 * - Remove RSS-sourced Angie promo (Follow Angie, support prompts, etc.)
 * - Convert bare URLs to inline markdown links (with bullets)
 * - Split jammed multi-URL lines into bullet lists
 * - Convert WordPress [URL](URL) to [Label](URL)
 * - Update email addresses
 * - Keep guest-specific links and resources
 *
 * Usage: node scripts/cleanup-podcast-notes.mjs
 */

import fs from 'fs';
import path from 'path';

const POSTS_DIR = path.resolve('src/content/posts');

// ── Known social platform labels (used for splitting jammed links) ──────────
const PLATFORM_LABELS = 'D\\s*Card|Tik[Tt]ok|IG|Instagram|FB|Facebook|Twitter|X|網站|Website|Email|E-?mail|LinkedIn|Youtube|Blog|Podcast|LINE|粉專';

// ── Boilerplate section removal ─────────────────────────────────────────────

const SECTION_HEADERS = [
  /^Contacts:\s*$/i,
  /^Contact:\s*$/i,
  /^\*\*Connect with us!?\*\*\s*$/i,
  /^Connect with us!?\s*$/i,
  /^瞭解更多關於好奇槓鈴/,
  /^追蹤聯絡好奇槓鈴/,
  /^追蹤好奇槓鈴/,
  /^在其他.*平台/,
  /^了解更多：\s*$/,
  // Angie-specific follow sections
  /^Follow 安吉\s*$/,
  /^Follow Angie:?\s*$/i,
  /^Follow Us:?\s*$/i,
  /^Follow Me!?\s*$/i,
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

// ── Inline link conversion ──────────────────────────────────────────────────

/**
 * Split jammed multi-URL lines into bullet lists with inline links.
 * Uses lookahead at known platform label boundaries to properly delimit URLs.
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
  let skipSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isBoilerplateSectionHeader(line)) {
      skipSection = true;
      continue;
    }

    if (skipSection) {
      if (isSectionContent(line)) continue;
      else skipSection = false;
    }

    if (isJunkLine(line)) continue;

    let cleanedLine = line;

    // Remove junk share URL fragments
    cleanedLine = cleanedLine.replace(/\[\]\(https:\/\/www\.facebook\.com\/dialog\/share[^)]*\)/g, '');
    cleanedLine = cleanedLine.replace(/\[\]\(https:\/\/twitter\.com\/intent\/tweet[^)]*\)/g, '');

    // Strip trailing "Follow Angie:" or "Follow 安吉"
    cleanedLine = cleanedLine.replace(/Follow Angie:?\s*$/i, '');
    cleanedLine = cleanedLine.replace(/Follow 安吉\s*$/, '');

    // Convert WordPress [URL](URL) to [Label](URL)
    cleanedLine = convertWordPressLinks(cleanedLine);

    // Convert bare URLs to inline links with bullets
    cleanedLine = convertBareUrls(cleanedLine);

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
