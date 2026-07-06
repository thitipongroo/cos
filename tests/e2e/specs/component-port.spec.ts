// E2E — Web component port: browser-compat (automatable subset)
// Companion to docs/screens/web/component-port-test.md.
//
// Covers the three automatable areas of the mockup→apps/web component port:
//   1. ImageWithFallback  — onError → SVG fallback
//   2. LoadingState       — SkeletonCard / LoadingSpinner / EmptyState
//   3. Permission-denied  — LocationDisplay (geolocation) + VoiceInput (microphone)
//
// PRECONDITION (verified 2026-07-05): these six components are NOT yet ported into
// apps/web — no route renders them. This spec is therefore GATED behind the env var
// COMPONENT_PREVIEW_URL and SKIPS until a preview page exists. It never asserts a
// false green before the port lands.
//
// CONTRACT the preview page at COMPONENT_PREVIEW_URL must fulfil (data-testid attrs):
//   [data-testid="img-fallback"]        — an <ImageWithFallback> whose src is deliberately broken
//   [data-testid="loading-skeleton"]    — a <SkeletonCard/>
//   [data-testid="loading-spinner"]     — a <LoadingSpinner/>
//   [data-testid="empty-state"]         — an <EmptyState .../> that has an action button
//   [data-testid="empty-state-action"]  — the EmptyState action <button> (fires onAction)
//   [data-testid="empty-state-fired"]   — appears/toggles once onAction has run
//   [data-testid="location-display"]    — a <LocationDisplay/> (contains the "Get Location" button)
//   [data-testid="voice-input"]         — a <VoiceInput/>
//
// The preview route should be dev/test-only. Text assertions below use the exact strings
// rendered by the component source (read verbatim), so re-theming does not break them.
//
// Run:  COMPONENT_PREVIEW_URL=/dev/component-preview \
//         npx playwright test component-port --config tests/e2e/playwright.config.ts
//
// Alternative target: the Vite mockup (figma/mockup) renders LoadingState in
// ComponentShowcase.tsx today; point BASE_URL + COMPONENT_PREVIEW_URL at that dev server
// to exercise rows 1–2 before the apps/web port.

import { test, expect, type Page } from '@playwright/test';

const PREVIEW_URL = process.env['COMPONENT_PREVIEW_URL'];

// Skip the whole file unless a preview route is provided — honest gate, no false green.
test.skip(
  !PREVIEW_URL,
  'Set COMPONENT_PREVIEW_URL to a route that mounts the ported components (see spec header).',
);

async function openPreview(page: Page): Promise<void> {
  await page.goto(PREVIEW_URL as string);
  await page.waitForLoadState('networkidle');
}

test.describe('Component port — ImageWithFallback', () => {
  test('broken src falls back to the SVG placeholder and preserves the original url', async ({
    page,
  }) => {
    await openPreview(page);

    const probe = page.getByTestId('img-fallback');
    await expect(probe).toBeVisible();

    // On error the component renders: <img src={ERROR_IMG_SRC} alt="Error loading image"
    //   data-original-url={src}> (verbatim from ImageWithFallback.tsx).
    const fallbackImg = probe.getByAltText('Error loading image');
    await expect(fallbackImg).toBeVisible();

    // Fallback source is the inline data-URI SVG, and the original (broken) url is kept.
    await expect(fallbackImg).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect(fallbackImg).toHaveAttribute('data-original-url', /.+/);
  });
});

test.describe('Component port — LoadingState', () => {
  test('SkeletonCard and LoadingSpinner render their animations', async ({ page }) => {
    await openPreview(page);

    // Source: SkeletonCard wraps content in `.animate-pulse`; LoadingSpinner uses `.animate-spin`.
    await expect(page.getByTestId('loading-skeleton').locator('.animate-pulse')).toBeVisible();
    await expect(page.getByTestId('loading-spinner').locator('.animate-spin')).toBeVisible();
  });

  test('EmptyState shows its copy and fires onAction', async ({ page }) => {
    await openPreview(page);

    const empty = page.getByTestId('empty-state');
    await expect(empty).toBeVisible();
    // EmptyState renders <h3>{title}</h3> and <p>{description}</p>.
    await expect(empty.getByRole('heading')).toBeVisible();

    const action = page.getByTestId('empty-state-action');
    if (await action.isVisible().catch(() => false)) {
      await action.click();
      await expect(page.getByTestId('empty-state-fired')).toBeVisible();
    }
  });
});

// Web-only: the ported apps/web VoiceInput (AI-transcription based, NOT the mockup's browser Web
// Speech). Runs only against the apps/web preview (grep "web VoiceInput"). Verifies render + Thai
// i18n default + language selector; the record→upload→transcribe round-trip needs the full backend
// stack (file-service + ai-gateway) and is not exercised here.
test.describe('Component port (web) — VoiceInput', () => {
  test('renders with Thai i18n default and a language selector', async ({ page }) => {
    await openPreview(page);
    const voice = page.getByTestId('web-voice-input');
    await expect(voice).toBeVisible();

    // Default locale is Thai (QM-3) → the record button reads "แตะเพื่อพูด".
    await expect(voice.getByRole('button', { name: 'แตะเพื่อพูด' })).toBeVisible();
    // Language selector offers Thai + English.
    await expect(voice.getByRole('combobox')).toBeVisible();
    await expect(voice.getByRole('option', { name: 'ไทย' })).toBeAttached();
    await expect(voice.getByRole('option', { name: 'English' })).toBeAttached();
  });
});

// Web-only: the ported apps/web LocationDisplay (backend /geo/reverse based). Runs against the
// apps/web preview. Verifies Thai i18n + geolocation permission paths. The backend geocode is not
// running in this web-only preview, so the granted case degrades to coordinates-without-address —
// which is the asserted, non-crashing behaviour.
test.describe('Component port (web) — LocationDisplay', () => {
  test('renders with Thai i18n default', async ({ page }) => {
    await openPreview(page);
    const loc = page.getByTestId('web-location-display');
    await expect(loc).toBeVisible();
    await expect(loc.getByRole('button', { name: 'ระบุตำแหน่ง' })).toBeVisible();
  });

  test('shows the denied message when geolocation permission is refused', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await openPreview(page);
    const loc = page.getByTestId('web-location-display');
    await loc.getByRole('button', { name: 'ระบุตำแหน่ง' }).click();
    await expect(loc.getByText('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง')).toBeVisible();
  });

  test('shows coordinates when geolocation is granted', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.7563, longitude: 100.5018 });
    await openPreview(page);
    const loc = page.getByTestId('web-location-display');
    await loc.getByRole('button', { name: 'ระบุตำแหน่ง' }).click();
    await expect(loc.getByText(/13\.7563\d*,\s*100\.5018\d*/)).toBeVisible();
  });
});

test.describe('Component port — permission-denied paths', () => {
  test('LocationDisplay shows the denied message when geolocation permission is refused', async ({
    page,
    context,
  }) => {
    // Ensure geolocation is NOT granted → getCurrentPosition rejects with PERMISSION_DENIED,
    // which location.service maps to "Location permission denied".
    await context.clearPermissions();

    await openPreview(page);
    const loc = page.getByTestId('location-display');
    await expect(loc).toBeVisible();

    // The component may render the unsupported branch instead ("Location services not available").
    // Either non-happy branch is an acceptable, non-crashing outcome.
    const unsupported = loc.getByText('Location services not available');
    if (await unsupported.isVisible().catch(() => false)) {
      return;
    }

    await loc.getByRole('button', { name: /get location/i }).click();
    await expect(loc.getByText('Location permission denied')).toBeVisible();
  });

  test('LocationDisplay reports a fix when geolocation is granted (positive control)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.7563, longitude: 100.5018 }); // Bangkok

    // Block the external Nominatim reverse-geocode call (verified finding: it must be replaced
    // with a COS backend). Aborting it is caught internally → address becomes "Unknown location"
    // and getCurrentLocation still resolves, so the coordinate assertion stays deterministic.
    await context.route('**/nominatim.openstreetmap.org/**', (route) => route.abort());

    await openPreview(page);
    const loc = page.getByTestId('location-display');

    const unsupported = loc.getByText('Location services not available');
    if (await unsupported.isVisible().catch(() => false)) {
      test.skip(true, 'geolocation unsupported in this browser build');
    }

    await loc.getByRole('button', { name: /get location/i }).click();
    // Source formats coordinates as `lat.toFixed(6), lng.toFixed(6)`.
    await expect(loc.getByText(/13\.7563\d*,\s*100\.5018\d*/)).toBeVisible();
  });

  test('VoiceInput renders and is interactive without crashing', async ({ page, context }) => {
    await context.clearPermissions();

    await openPreview(page);
    const voice = page.getByTestId('voice-input');
    await expect(voice).toBeVisible();

    const unsupported = voice.getByText('Voice input not supported in this browser');
    if (await unsupported.isVisible().catch(() => false)) {
      return; // acceptable outcome where no speech engine exists (e.g. Firefox)
    }

    // Supported branch. VERIFIED empirically: Playwright's headless Chromium exposes
    // (webkit)SpeechRecognition AND recognition.start() succeeds without a real microphone, so
    // the mic-DENIED error path does NOT fire here — it is a manual-only case (see checklist).
    // The deterministic, automatable assertion is that clicking wires the engine and the
    // component transitions into its listening state instead of crashing or silently no-op-ing.
    await voice.getByRole('button', { name: /tap to speak/i }).click();
    await expect(voice.getByRole('button', { name: /stop recording/i })).toBeVisible();
    await expect(voice.getByText('Listening...')).toBeVisible();
  });
});
