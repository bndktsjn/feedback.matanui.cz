import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Feedback App',
    short_name: 'Feedback',
    description: 'Visual feedback and annotation tool for websites',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: process.env.NODE_ENV === 'production' ? '#16a34a' : '#ea580c',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
