import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { SerwistProvider } from '@serwist/turbopack/react';
import { Providers } from './providers';

/**
 * Brand font: Inter Tight (§32.7), the variable build — one file, weights 100–900.
 *
 * `next/font/local` rather than importing `@fontsource-variable/inter-tight`'s stylesheet, because
 * it emits a `<link rel="preload">` for the file. Loaded through the stylesheet the font is only
 * discovered after the CSS parses, which under Lighthouse's simulated profile (562 ms request
 * latency, 1,638 Kbps) is an extra round trip on the critical path — and with `font-display: swap`
 * the LCP paragraph paints once in a fallback face and then repaints when the real font lands,
 * registering the later paint as LCP.
 *
 * `--font-inter-tight` is consumed by `fontFamily.sans` in tailwind.config.js.
 */
const interTight = localFont({
  src: '../../node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter-tight',
  fallback: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Construction OS',
  description: 'AI-native construction management platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Construction OS',
  },
};

// Next.js 14: themeColor/viewport belong in the `viewport` export, not `metadata`.
export const viewport: Viewport = {
  themeColor: '#1A202C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={interTight.variable}>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
