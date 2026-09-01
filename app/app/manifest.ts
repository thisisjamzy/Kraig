import type { MetadataRoute } from 'next';
import { colors } from '@/src/styles/tokens/colors';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dreda',
    short_name: 'Dreda',
    description: 'Capture tasks and spending in two taps, synced straight back to Notion.',
    start_url: '/',
    display: 'standalone',
    background_color: colors.light.background,
    theme_color: colors.light.primary,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
