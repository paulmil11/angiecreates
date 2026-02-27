import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  const sorted = posts.sort(
    (a, b) => new Date(b.data.rawDate || b.data.date).getTime() - new Date(a.data.rawDate || a.data.date).getTime()
  );

  return rss({
    title: 'Angie Wang 安吉',
    description: '作家、創作者、Podcast主持人。寫關於跨文化生活、創作、與成為母親的故事。',
    site: context.site!,
    items: sorted.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.rawDate || post.data.date),
      link: `/${post.slug}/`,
      categories: post.data.categories,
    })),
  });
}
