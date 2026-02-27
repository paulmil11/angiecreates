#!/usr/bin/env node
/**
 * Download all external images referenced in content collection markdown files
 * and rewrite the URLs to local paths.
 *
 * Usage: node scripts/download-images.mjs
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const POSTS_DIR = path.resolve('src/content/posts');
const IMAGES_DIR = path.resolve('public/images/posts');

// Ensure images directory exists
fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ── Download helper ─────────────────────────────────────────────────────────

function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { timeout: 30000 }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        return downloadFile(redirectUrl, destPath, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    }).on('error', reject).on('timeout', function () {
      this.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// ── Extract image URLs from markdown ────────────────────────────────────────

function extractImageUrls(content) {
  const urls = new Set();

  // Markdown images: ![alt](url)
  const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = mdRegex.exec(content)) !== null) {
    const url = match[1].trim();
    if (url.startsWith('http')) urls.add(url);
  }

  // HTML img tags: <img src="url"
  const htmlRegex = /src="(https?:\/\/[^"]+)"/g;
  while ((match = htmlRegex.exec(content)) !== null) {
    urls.add(match[1]);
  }

  return urls;
}

function extractFrontmatterImage(content) {
  const match = content.match(/^image:\s*"(https?:\/\/[^"]+)"/m);
  return match ? match[1] : null;
}

// ── Generate unique local filename ──────────────────────────────────────────

function getLocalFilename(url) {
  try {
    const parsed = new URL(url);
    let filename = path.basename(parsed.pathname);
    // Clean up query params from filename
    filename = filename.split('?')[0];
    // Ensure valid extension
    if (!filename.match(/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)$/i)) {
      filename += '.jpg';
    }
    return filename;
  } catch {
    return 'image-' + Date.now() + '.jpg';
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  console.log(`Scanning ${files.length} markdown files for images...\n`);

  // Collect all unique image URLs across all files
  const urlToLocal = new Map(); // url → local filename
  const fileUrlMap = new Map(); // filename → Set of urls found in it
  const usedFilenames = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');
    const urls = extractImageUrls(content);
    const fmImage = extractFrontmatterImage(content);
    if (fmImage) urls.add(fmImage);

    if (urls.size > 0) {
      fileUrlMap.set(file, urls);
      for (const url of urls) {
        if (!urlToLocal.has(url)) {
          let filename = getLocalFilename(url);
          // Handle duplicate filenames
          while (usedFilenames.has(filename)) {
            const ext = path.extname(filename);
            const base = path.basename(filename, ext);
            filename = `${base}-${Math.random().toString(36).slice(2, 6)}${ext}`;
          }
          usedFilenames.add(filename);
          urlToLocal.set(url, filename);
        }
      }
    }
  }

  console.log(`Found ${urlToLocal.size} unique image URLs across ${fileUrlMap.size} files.\n`);

  // Download all images
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const [url, filename] of urlToLocal) {
    const destPath = path.join(IMAGES_DIR, filename);

    if (fs.existsSync(destPath)) {
      skipped++;
      continue;
    }

    try {
      await downloadFile(url, destPath);
      downloaded++;
      process.stdout.write(`  Downloaded: ${filename}\n`);
    } catch (err) {
      failed++;
      failures.push({ url, error: err.message });
      process.stdout.write(`  FAILED: ${filename} — ${err.message}\n`);
    }
  }

  console.log(`\nDownloads: ${downloaded} new, ${skipped} skipped, ${failed} failed`);

  // Rewrite URLs in markdown files
  console.log('\nRewriting image URLs in markdown files...');
  let rewritten = 0;

  for (const [file, urls] of fileUrlMap) {
    const filePath = path.join(POSTS_DIR, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;

    for (const url of urls) {
      const localFilename = urlToLocal.get(url);
      if (localFilename) {
        const localPath = `/images/posts/${localFilename}`;
        // Only rewrite if we successfully downloaded the file
        if (fs.existsSync(path.join(IMAGES_DIR, localFilename))) {
          content = content.replaceAll(url, localPath);
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf-8');
      rewritten++;
    }
  }

  console.log(`Rewrote URLs in ${rewritten} files.`);

  if (failures.length > 0) {
    console.log('\n--- Failed downloads ---');
    for (const f of failures) {
      console.log(`  ${f.url} — ${f.error}`);
    }
  }
}

main().catch(console.error);
