// Dev/test-only preview harness. Mounts the automatable feature components with the
// data-testid contract from tests/e2e/specs/component-port.spec.ts so Playwright can
// exercise ImageWithFallback / LoadingState / permission-denied paths against the real
// mockup source (before the apps/web port). Not part of the shipped app.
import { useState } from 'react';
import { ImageWithFallback } from './components/figma/ImageWithFallback';
import { SkeletonCard, LoadingSpinner, EmptyState } from './components/mobile/LoadingState';
import { LocationDisplay } from './components/location/LocationDisplay';
import { VoiceInput } from './components/voice/VoiceInput';

export function ComponentPreview() {
  const [fired, setFired] = useState(false);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <section data-testid="img-fallback">
        {/* Malformed data-URI (valid base64, not a decodable image) → onError → SVG fallback.
            Server-independent so the same harness behaves identically under Vite and Next. */}
        <ImageWithFallback src="data:image/png;base64,AAAA" alt="probe" width={88} height={88} />
      </section>

      <section data-testid="loading-skeleton">
        <SkeletonCard />
      </section>

      <section data-testid="loading-spinner">
        <LoadingSpinner size="md" />
      </section>

      <section data-testid="empty-state">
        <EmptyState
          title="Nothing here yet"
          description="This is a preview empty state."
          actionLabel="Do action"
          onAction={() => setFired(true)}
        />
        <button data-testid="empty-state-action" onClick={() => setFired(true)}>
          trigger action
        </button>
        {fired && <div data-testid="empty-state-fired">action-fired</div>}
      </section>

      <section data-testid="location-display">
        <LocationDisplay />
      </section>

      <section data-testid="voice-input">
        <VoiceInput />
      </section>
    </div>
  );
}
