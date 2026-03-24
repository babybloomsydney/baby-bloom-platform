import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/nanny/',
          '/parent/',
          '/admin/',
          '/login',
          '/signup',
          '/forgot-password',
          '/reset-password',
          '/test',
        ],
      },
      {
        userAgent: 'GPTBot',
        disallow: '/',
      },
    ],
    sitemap: 'https://babybloomsydney.com.au/sitemap.xml',
  };
}
