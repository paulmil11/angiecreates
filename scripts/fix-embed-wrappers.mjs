import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsDir = path.join(__dirname, '..', 'src', 'content', 'posts');

const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
let changed = 0;

for (const file of files) {
  const filePath = path.join(postsDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Convert YouTube embed wrappers to iframes
  content = content.replace(
    /<div class="wp-block-embed__wrapper">https?:\/\/(?:www\.)?youtube\.com\/embed\/([^<]+)<\/div>/g,
    (match, id) => `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`
  );

  content = content.replace(
    /<div class="wp-block-embed__wrapper">https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([^<&]+)[^<]*<\/div>/g,
    (match, id) => `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`
  );

  content = content.replace(
    /<div class="wp-block-embed__wrapper">https?:\/\/youtu\.be\/([^<]+)<\/div>/g,
    (match, id) => `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`
  );

  // Convert Instagram embed wrappers to links
  content = content.replace(
    /<div class="wp-block-embed__wrapper">(https?:\/\/(?:www\.)?instagram\.com\/[^<]+)<\/div>/g,
    (match, url) => `[Instagram 貼文](${url})`
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    changed++;
    console.log(`Fixed: ${file}`);
  }
}

console.log(`\nDone. Fixed ${changed} files.`);
