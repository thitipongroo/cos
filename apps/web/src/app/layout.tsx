import type { Metadata, Viewport } from 'next';
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
