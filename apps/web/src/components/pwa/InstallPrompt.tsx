'use client';

// InstallPrompt — handles beforeinstallprompt to offer PWA installation.
// Spec §Phase 10 Web App — Install prompt component.
// Shows only on tablet/laptop (not smartphone) per product owner decision.

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDeferredPrompt(null);
    setDismissed(true);
  };

  return (
    <div
      role="banner"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#2D3748',
        color: '#E2E8F0',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        zIndex: 9999,
        maxWidth: 480,
        width: 'calc(100vw - 48px)',
      }}
    >
      <span style={{ fontSize: 32 }}>🏗️</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, marginBottom: 2 }}>Install Construction OS</p>
        <p style={{ fontSize: 13, color: '#A0AEC0' }}>Add to your desktop for offline access</p>
      </div>
      <button
        onClick={handleInstall}
        style={{
          background: '#3182CE',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          color: '#A0AEC0',
          border: 'none',
          cursor: 'pointer',
          fontSize: 18,
          padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
