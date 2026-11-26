import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';

/**
 * Stage 2 ships both candidate faces; only the one the active direction uses is
 * fetched by the browser (fonts download on use). After the direction is chosen
 * the other is removed. Latin-ext subsets will be added with Yoruba/Hausa/Igbo.
 */
export const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
  preload: false,
});
export const geist = GeistSans; // exposes --font-geist-sans
