import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import compress from '@playform/compress';

export default defineConfig({
  site: 'https://angiecreates.io',
  integrations: [
    sitemap(),
    compress(),
  ],
});
