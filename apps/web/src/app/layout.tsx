import type { Metadata } from 'next';
import { ServiceWorkerRegistration } from '../components/pwa/ServiceWorkerRegistration';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Construction OS',
  description: 'AI-native construction management platform',
  manifest: '/manifest.json',
  themeColor: '#1A202C',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Construction OS',
  },
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
