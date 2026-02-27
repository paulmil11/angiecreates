#!/usr/bin/env node
/**
 * Match podcast blog posts to Transistor.fm episodes and inject embed players.
 *
 * Matches by episode number in title (e.g., "#80", "EP80", "ep.80")
 *
 * Usage: node scripts/add-podcast-embeds.mjs
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
  // Match patterns: #90, EP90, ep.90, EP 90, #090, etc.
  const match = title.match(/(?:#|EP\.?\s?)(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ── Build Transistor embed HTML ─────────────────────────────────────────────

function buildEmbed(shareUrl) {
  return `<iframe src="${shareUrl}" width="100%" height="180" frameborder="0" scrolling="no" seamless="true" style="width:100%;height:180px;"></iframe>`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching Transistor RSS feed...');
  const rssXml = await fetchRSS(RSS_URL);
  const result = await parseStringPromise(rssXml);

  const items = result.rss.channel[0].item || [];
  console.log(`Found ${items.length} podcast episodes in RSS feed.\n`);

  // Build episode lookup by number
  const episodesByNumber = new Map();

  for (const item of items) {
    const title = item.title?.[0] || '';
    const guid = item.guid?.[0]?._ || item.guid?.[0] || '';
    const link = item.link?.[0] || '';
    const epNum = extractEpisodeNumber(title);

    // The share URL for embeds: use the link from RSS which should be the episode page
    // Transistor embed format: https://share.transistor.fm/e/{episode-id}
    // We can derive the share URL from the episode link
    let shareUrl = '';
    if (link.includes('transistor.fm')) {
      // Extract episode path and build share URL
      const urlParts = new URL(link);
      const episodePath = urlParts.pathname.replace(/^\//, '').replace('episodes/', '');
      shareUrl = `https://share.transistor.fm/e/${episodePath}`;
    }

    if (epNum !== null && shareUrl) {
      episodesByNumber.set(epNum, { title, shareUrl, guid });
    }
  }

  console.log(`Mapped ${episodesByNumber.size} episodes by number.\n`);

  // Scan posts for podcast content
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  let matched = 0;
  let alreadyHasEmbed = 0;

  for (const file of files) {
    const filePath = path.join(POSTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check if this is a podcast post
    const isPodcast = content.includes('"Podcast"') ||
                      content.includes('category: "Podcast"') ||
                      content.toLowerCase().includes('podcast');
    if (!isPodcast) continue;

    // Skip if already has a Transistor embed
    if (content.includes('transistor.fm')) {
      alreadyHasEmbed++;
      continue;
    }

    // Try to find episode number in title (from frontmatter)
    const titleMatch = content.match(/^title:\s*"(.+)"/m);
    const title = titleMatch ? titleMatch[1] : '';
    const epNum = extractEpisodeNumber(title);

    if (epNum !== null && episodesByNumber.has(epNum)) {
      const episode = episodesByNumber.get(epNum);
      const embed = buildEmbed(episode.shareUrl);

      // Insert embed right after the frontmatter (after the closing ---)
      const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
      if (fmEnd !== -1) {
        const before = content.substring(0, fmEnd + 3);
        const after = content.substring(fmEnd + 3);
        const newContent = `${before}\n\n${embed}\n${after}`;
        fs.writeFileSync(filePath, newContent, 'utf-8');
        console.log(`  ${file} → Episode #${epNum}`);
        matched++;
      }
    }
  }

  console.log(`\nMatched ${matched} posts to episodes. ${alreadyHasEmbed} already had embeds.`);
}

main().catch(console.error);
