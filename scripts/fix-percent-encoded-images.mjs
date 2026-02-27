#!/usr/bin/env node
/**
 * Fix percent-encoded image filenames:
 * 1. Copy files with percent-encoded names to ASCII-safe names
 * 2. Update all references in markdown/astro files
 */

import fs from 'fs';
import path from 'path';

const imagesDir = 'public/images/posts';
const contentDirs = ['src/content/posts', 'src/pages', 'src/components', 'src/layouts'];

// Find all percent-encoded files
const allFiles = fs.readdirSync(imagesDir);
const encodedFiles = allFiles.filter(f => f.includes('%'));

console.log(`Found ${encodedFiles.length} percent-encoded image files:\n`);

const renameMap = {};

for (const encoded of encodedFiles) {
  // Decode to get meaningful name, then create ASCII-safe version
  let decoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    decoded = encoded;
  }

  // Create ASCII-safe name by transliterating Chinese chars to pinyin-like slugs
  // Simple approach: use a hash of the decoded name + keep extension and any ASCII parts
  const ext = path.extname(encoded);
  const base = path.basename(encoded, ext);

  // Extract any ASCII portions and create a readable name
  let safeName;

  // Map specific known files to readable names
  const decodedBase = path.basename(decoded, ext);

  // Keep ASCII characters, replace Chinese with hyphens, clean up
  safeName = decodedBase
    .replace(/[^\x20-\x7E]/g, '-')  // Replace non-ASCII with hyphen
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-|-$/g, '')          // Trim hyphens
    .toLowerCase();

  if (!safeName || safeName.length < 3) {
    // If name is mostly Chinese, create a descriptive name from context
    safeName = `image-${Buffer.from(decoded).toString('hex').slice(0, 8)}`;
  }

  safeName = safeName + ext;

  // Avoid collisions
  if (fs.existsSync(path.join(imagesDir, safeName))) {
    safeName = safeName.replace(ext, `-${Date.now().toString(36)}${ext}`);
  }

  renameMap[encoded] = safeName;
  console.log(`  ${encoded}`);
  console.log(`  → ${safeName}`);
  console.log(`  (decoded: ${decoded})\n`);
}

// Copy files
for (const [encoded, safe] of Object.entries(renameMap)) {
  const src = path.join(imagesDir, encoded);
  const dst = path.join(imagesDir, safe);
  if (!fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log(`Copied: ${safe}`);
  } else {
    console.log(`Already exists: ${safe}`);
  }
}

// Find all content files
function getFiles(dirs, exts) {
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isFile() && exts.some(e => full.endsWith(e))) {
        files.push(full);
      }
    }
  }
  return files;
}

const contentFiles = getFiles(contentDirs, ['.md', '.astro']);
console.log(`\nScanning ${contentFiles.length} content files for references...\n`);

let totalUpdated = 0;

for (const file of contentFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let changed = false;

  for (const [encoded, safe] of Object.entries(renameMap)) {
    // Replace /images/posts/ENCODED_NAME with /images/posts/SAFE_NAME
    const oldRef = `/images/posts/${encoded}`;
    const newRef = `/images/posts/${safe}`;

    if (content.includes(oldRef)) {
      content = content.replaceAll(oldRef, newRef);
      changed = true;
      console.log(`  ${file}: ${encoded} → ${safe}`);
    }
  }

  if (changed) {
    fs.writeFileSync(file, content);
    totalUpdated++;
  }
}

console.log(`\nUpdated ${totalUpdated} files.`);
