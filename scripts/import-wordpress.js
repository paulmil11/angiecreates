import { readFileSync, writeFileSync } from 'fs';
import { parseStringPromise } from 'xml2js';

const xmlPath = './angiewang.WordPress.2026-02-27.xml';

async function importPosts() {
  const xml = readFileSync(xmlPath, 'utf-8');
  const result = await parseStringPromise(xml);

  const items = result.rss.channel[0].item;

  // Build attachment lookup (post_id → attachment_url) for featured images
  const attachments = {};
  for (const item of items) {
    const postType = item['wp:post_type']?.[0];
    if (postType === 'attachment') {
      const postId = item['wp:post_id']?.[0];
      const url = item['wp:attachment_url']?.[0];
      if (postId && url) {
        attachments[postId] = url;
      }
    }
  }
  console.log(`Found ${Object.keys(attachments).length} attachments`);

  // Filter to only published posts
  const posts = items.filter(item => {
    const postType = item['wp:post_type']?.[0];
    const status = item['wp:status']?.[0];
    return postType === 'post' && status === 'publish';
  });

  console.log(`Found ${posts.length} published posts`);

  const postsData = [];

  for (const post of posts) {
    const title = post.title[0] || '';
    const slug = post['wp:post_name']?.[0] || '';
    const rawDate = post['wp:post_date']?.[0] || '';
    const content = post['content:encoded']?.[0] || '';
    const excerpt = post['excerpt:encoded']?.[0] || '';

    // Get categories
    const categories = (post.category || [])
      .filter(c => c.$?.domain === 'category')
      .map(c => c._)
      .filter(Boolean);

    // Get tags
    const tags = (post.category || [])
      .filter(c => c.$?.domain === 'post_tag')
      .map(c => c._)
      .filter(Boolean);

    // Get featured image via _thumbnail_id
    let featuredImage = null;
    const postmeta = post['wp:postmeta'] || [];
    for (const meta of postmeta) {
      if (meta['wp:meta_key']?.[0] === '_thumbnail_id') {
        const thumbnailId = meta['wp:meta_value']?.[0];
        if (thumbnailId && attachments[thumbnailId]) {
          featuredImage = attachments[thumbnailId];
        }
      }
    }

    // Format date nicely
    const dateObj = new Date(rawDate);
    const date = dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const postData = {
      title,
      slug,
      date,
      rawDate,
      content,
      excerpt: excerpt.trim(),
      categories,
      tags,
      featuredImage,
    };

    postsData.push(postData);
    console.log(`  ${slug} — ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`);
  }

  writeFileSync('./extracted-posts.json', JSON.stringify(postsData, null, 2));
  console.log(`\nWrote ${postsData.length} posts to extracted-posts.json`);
}

importPosts().catch(console.error);
