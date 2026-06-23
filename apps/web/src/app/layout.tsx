import type { Metadata, Viewport } from 'next';
// Brand font: Inter Tight (§32.7) — weights 400 body / 500 labels / 600 headings / 700 wordmark.
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/600.css';
import '@fontsource/inter-tight/700.css';
import './globals.css';
import { ServiceWorkerRegistration } from '../components/pwa/ServiceWorkerRegistration';
import { Providers } from './providers';

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
    <html lang="th">
      <body>
        <ServiceWorkerRegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
