'use client';

import { useState } from 'react';
import { ImageWithFallback } from '../../../components/ui/ImageWithFallback';
import { SkeletonCard, LoadingSpinner, EmptyState } from '../../../components/ui/LoadingState';
import { VoiceInput } from '../../../components/ui/VoiceInput';
import { LocationDisplay } from '../../../components/ui/LocationDisplay';

/**
 * Dev/test-only preview harness. Mounts the ported components with the data-testid contract from
 * tests/e2e/specs/component-port.spec.ts so the same Playwright spec runs against apps/web (re-theme
 * regression catch). Only the deterministically-portable components are here — ImageWithFallback and
 * LoadingState. LocationDisplay/VoiceInput are not yet ported (blocked on Nominatim replacement +
 * i18n), so their testids are intentionally absent; run the spec filtered to those two components.
 */
export function PreviewClient() {
  const [fired, setFired] = useState(false);

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Interactive (click-driven) components go first so they sit above the fixed Next.js dev
          overlay, which otherwise intercepts pointer events on bottom-of-page elements. */}
      <section data-testid="web-location-display">
        <LocationDisplay />
      </section>

      <section data-testid="img-fallback">
        {/* Malformed data-URI (valid base64, not a decodable image) → onError → SVG fallback.
            Server-independent on purpose: a broken *path* is redirected to /login by the auth
            middleware under Next, which does not fire onError; a data-URI never hits the server. */}
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

      <section data-testid="web-voice-input">
        <VoiceInput />
      </section>
    </div>
  );
}
