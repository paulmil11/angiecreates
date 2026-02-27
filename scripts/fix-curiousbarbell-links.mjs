import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsDir = path.join(__dirname, '..', 'src', 'content', 'posts');

const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

let totalChanges = 0;

for (const file of files) {
  const filePath = path.join(postsDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // 1. Replace curiousbarbell.com/subscribe/ links → mit886.substack.com
  content = content.replace(
    /https?:\/\/(www\.)?curiousbarbell\.com\/subscribe\/?/g,
    'https://mit886.substack.com/'
  );

  // 2. Replace curiousbarbell.com/courses/ links → remove (course no longer active)
  //    These are CTA lines like "⚡點此報名「做自己的健身教練」課程⚡"
  //    Replace the URL but keep the text
  content = content.replace(
    /https?:\/\/(www\.)?curiousbarbell\.com\/courses\/?/g,
    '/blog/'
  );

  // 3. Replace curiousbarbell.com/overseas/ links
  content = content.replace(
    /https?:\/\/(www\.)?curiousbarbell\.com\/overseas\/?/g,
    '/blog/'
  );

  // 4. Replace curiousbarbell.com/events/ links
  content = content.replace(
    /https?:\/\/(www\.)?curiousbarbell\.com\/events\/?/g,
    '/blog/'
  );

  // 5. Replace curiousbarbell.com/curious-barbell-podcast/ → /podcast/
  content = content.replace(
    /https?:\/\/(www\.)?curiousbarbell\.com\/curious-barbell-podcast\/?/g,
    '/podcast/'
  );

  // 6. Replace curiousbarbell.com/about → /english/
  content = content.replace(
    /https?:\/\/(www\.)?curiousbarbell\.com\/about\/?/g,
    '/english/'
  );

  // 7. Replace curiousbarbell.com/<slug>/ article links → /<slug>/
  //    This catches podcast episodes and other posts that now live on angiecreates.io
  content = content.replace(
    /https?:\/\/(www\.)?curiousbarbell\.com\/([\w-]+)\/?(?=[\s\)\]\"\'>]|$)/g,
    (match, www, slug) => `/${slug}/`
  );

  // 8. Replace standalone curiousbarbell.com (no path) → angiecreates.io
  content = content.replace(
    /(?<!\/)(?<!\w)curiousbarbell\.com(?!\/)/g,
    'angiecreates.io'
  );

  // 9. Replace email addresses: angie@curiousbarbell.com → angie@angiecreates.io
  content = content.replace(
    /angie@curiousbarbell\.com/g,
    'angie@angiecreates.io'
  );

  // 10. Replace mailto:angie@curiousbarll.com (typo in original) → mailto:angie@angiecreates.io
  content = content.replace(
    /mailto:angie@curiousbarll\.com/g,
    'mailto:angie@angiecreates.io'
  );

  // 11. Fix curiousbarbell@gmail.com mailto that points to old email
  content = content.replace(
    /mailto:angie@angiecreates\.io\)/g,
    'mailto:angie@angiecreates.io)'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    totalChanges++;
    console.log(`Updated: ${file}`);
  }
}

console.log(`\nDone. Updated ${totalChanges} files.`);
