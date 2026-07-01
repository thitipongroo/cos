// Offline fallback page — shown when a navigation request fails offline.
// Serwist precaches this route at build time (see sw.ts defaultCache / precache manifest, ADR-047).

export default function OfflinePage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        backgroundColor: '#1A202C',
        color: '#E2E8F0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '64px', marginBottom: '24px' }}>📡</span>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>You are offline</h1>
      <p style={{ color: '#A0AEC0', lineHeight: 1.6, marginBottom: '24px', maxWidth: '360px' }}>
        No internet connection detected.
        <br />
        Previously cached data is still available.
        <br />
        Changes will sync automatically when you reconnect.
      </p>
    </main>
  );
}
