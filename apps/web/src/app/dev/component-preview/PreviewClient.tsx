'use client';

import { useState } from 'react';
import { ImageWithFallback } from '../../../components/ui/ImageWithFallback';
import { LoadingState, EmptyState } from '../../../components/ui/LoadingState';
import { VoiceInput } from '../../../components/ui/VoiceInput';
import { LocationDisplay } from '../../../components/ui/LocationDisplay';

/**
 * Dev-only visual preview of the four components ported out of the Figma mockup. The page 404s in
 * production (see page.tsx); it exists so the ported components can be eyeballed in one place —
 * particularly the §32.7 re-theme and dark mode, which no unit test asserts.
 *
 * A Playwright spec (tests/e2e/specs/component-port.spec.ts) and a browser-compat checklist
 * (docs/screens/web/component-port-test.md) once drove this page. Both were deleted on 2026-07-18:
 * the spec skipped unless COMPONENT_PREVIEW_URL was set and this route 404s under a production
 * build, so it could only run against a local `next dev`; the checklist had gone 13 days with all
 * 21 boxes unticked. Recover either from git history if the port is ever revisited. The findings
 * worth keeping now live next to the code they describe — see the SSR note in ImageWithFallback and
 * the headless-microphone note in VoiceInput. The `data-testid`s below are kept as stable hooks.
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

      {/* <LoadingState /> — the §32.7 component (ADR-055). Each variant twice: determinate
          (progress given) and indeterminate (progress omitted), which are visually distinct states. */}
      <section data-testid="loading-state-widget">
        <LoadingState variant="widget" progress={65} label="Initializing site telemetry..." />
        <LoadingState variant="widget" label="Loading, no percentage" />
      </section>

      <section data-testid="loading-state-table">
        <LoadingState variant="table" />
      </section>

      <section data-testid="loading-state-ai">
        <LoadingState
          variant="ai"
          progress={82}
          label="Analyzing site reports for budget variance..."
        />
      </section>

      <section data-testid="loading-state-micro">
        <LoadingState variant="micro" progress={42} label="Syncing database..." />
        <LoadingState variant="micro" />
      </section>

      {/* `SkeletonCard` / `LoadingSpinner` used to be previewed here. Both were deleted on
          2026-08-17 (product-owner decision, reversing ADR-055 decision 8): they drew the SAME two
          mockup patterns <LoadingState /> already draws — the widget's plate-plus-two-bars card and
          the micro spinner — but off-token (`gray-200`, `rounded-xl`, a round plate where the mockup
          has a rounded square), so the app carried two implementations of one specified component.
          Their shapes live on as `variant="widget"` and `variant="micro"` in the sections above. */}

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
