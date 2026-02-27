#!/usr/bin/env node
/**
 * Clean up categories in all blog posts:
 * - Simplify bilingual category names to Chinese-only
 * - Remove "Uncategorized" and "Email" and "Unpublished"
 * - Merge duplicates
 * - Lowercase "podcast" → "Podcast"
 */

import fs from 'fs';
import path from 'path';

const POSTS_DIR = path.resolve('src/content/posts');

const CATEGORY_MAP = {
  // Bilingual → Chinese-only
  '健身訓練＆運動醫學職涯與創業 Fitness and Sport Medicine Careers': '健身與運動醫學',
  '女性創業與健身 Female Entrepreneurship and Training': '女性創業與健身',
  '運動健身訓練知識 Sports Science': '運動科學',
  '海外留學工作 Overseas Research and Careers': '海外留學',
  'Training Note 訓練筆記': '訓練筆記',
  '運動訓練與傷害防護Athletic Training and Sports Injuries': '運動傷害防護',
  '閱讀＆Podcast 推薦 Book and Podcast Recommendation': '閱讀推薦',
  '數位遊牧 Digital Nomad': '數位遊牧',
  '冥想 Meditation': '冥想',
  '肌力與體能訓練 Strength &amp; Conditioning': '肌力與體能訓練',
  '肌力與體能訓練 Strength & Conditioning': '肌力與體能訓練',

  // Merge duplicates
  '海外留學工作': '海外留學',
  'podcast': 'Podcast',

  // Remove junk categories (map to null)
  'Uncategorized': null,
  'Email': null,
  'Unpublished': null,

  // English → Chinese where it makes sense
  'Creativity': '創作',
  'Advice': '人生人蔘',
  '《臺灣製造》': '臺灣製造',
  '做自己的健身教練課程': '做自己的健身教練',
};

const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
let modified = 0;

for (const file of files) {
  const filePath = path.join(POSTS_DIR, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;

  for (const [oldCat, newCat] of Object.entries(CATEGORY_MAP)) {
    const escaped = oldCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(  - ")${escaped}(")`,'g');

    if (newCat === null) {
      // Remove the line entirely
      const lineRegex = new RegExp(`\\n  - "${escaped}"`, 'g');
      if (lineRegex.test(content)) {
        content = content.replace(lineRegex, '');
        changed = true;
      }
    } else if (content.includes(`  - "${oldCat}"`)) {
      content = content.replace(regex, `$1${newCat}$2`);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8');
    modified++;
  }
}

console.log(`Modified ${modified} files.`);

// Show remaining categories
const allCats = new Map();
for (const file of files) {
  const filePath = path.join(POSTS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const catMatches = content.matchAll(/  - "([^"]+)"/g);
  for (const m of catMatches) {
    allCats.set(m[1], (allCats.get(m[1]) || 0) + 1);
  }
}

console.log('\nRemaining categories:');
const sorted = [...allCats.entries()].sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sorted) {
  console.log(`  ${count}x  ${cat}`);
}
