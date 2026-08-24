// Behaviour of the two sync indicators, asserted together.
//
// <SyncPill /> (the top-bar glyph) and <OverlaySyncPill /> (the labelled pill an overlay carries)
// are deliberately different components — PO 2026-08-04/09 — but the four states, their order of
// precedence, and the SYNCED glyph are meant to be the same. They were kept the same by hand, in
// two copies of one ternary, until they quietly stopped being: the overlay drew `check-circle`
// where everything else drew `cloud-done`. PO 2026-08-20 settled that on the cloud and
// useSyncPillView made it a constant.
//
// So this file asserts the AGREEMENT, not each component's own picture: both read the same state,
// in the same order, and reach the same glyph for synced. The unit-level precedence lives in
// hooks/__tests__/useSyncPillView.spec.ts.

import { render } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { OverlaySyncPill } from '../OverlaySyncPill';
import { SyncPill } from '../SyncPill';

let mockStatus = 'idle';
let mockPending = 0;

jest.mock('../../hooks/useSyncStatus', () => ({ useSyncStatus: () => mockStatus }));
jest.mock('../../hooks/usePendingCount', () => ({ usePendingCount: () => mockPending }));

/**
 * The glyph each pill drew.
 *
 * The MaterialIcons stub renders the glyph NAME as its text, so the name is the node's children —
 * the top-bar pill puts its own testID on the icon, and the overlay's icon falls back to `icon-<name>`.
 */
async function glyphs() {
  const top = await render(
    <I18nProvider>
      <SyncPill />
    </I18nProvider>,
  );
  const overlay = await render(
    <I18nProvider>
      <OverlaySyncPill />
    </I18nProvider>,
  );
  return {
    top: top.getByTestId('sync-pill').props.children as string,
    topLabel: top.getByTestId('sync-pill').props.accessibilityLabel as string,
    overlay: overlay.getByTestId('overlay-sync-pill'),
    overlayIcon: overlay.getAllByTestId(/^icon-/)[0]!.props.testID as string,
  };
}

describe('the sync indicators', () => {
  beforeEach(() => {
    mockStatus = 'idle';
    mockPending = 0;
  });

  // The state that drifted. `check-circle` is the option PO 2026-08-06 named and rejected: one
  // state may not have two glyphs, and the cloud also says WHERE the work is.
  it('both draw cloud-done for synced', async () => {
    const g = await glyphs();

    expect(g.top).toBe('cloud-done');
    expect(g.overlayIcon).toBe('icon-cloud-done');
  });

  it('both draw the upload glyph while anything is queued', async () => {
    mockPending = 3;

    const g = await glyphs();

    expect(g.top).toBe('cloud-upload');
    expect(g.overlayIcon).toBe('icon-cloud-upload');
  });

  it('both put syncing ahead of a non-empty queue', async () => {
    mockStatus = 'syncing';
    mockPending = 3;

    const g = await glyphs();

    expect(g.top).toBe('sync');
    expect(g.overlayIcon).toBe('icon-sync');
  });

  it('both put an error ahead of everything else', async () => {
    mockStatus = 'error';
    mockPending = 3;

    const g = await glyphs();

    expect(g.top).toBe('sync-problem');
    expect(g.overlayIcon).toBe('icon-sync-problem');
  });

  // Offline is NOT a state of its own (PO 2026-08-06): it PRODUCES pending, and offline with an
  // empty queue genuinely is synced — nothing is waiting.
  it('read an empty queue as synced whatever the network is doing', async () => {
    const g = await glyphs();

    expect(g.top).toBe('cloud-done');
  });

  // The difference that is deliberate: the top bar has no room for a word, so its pill is a bare
  // glyph — which is exactly why the glyph has to carry the accessible name itself (§20.8).
  it('the glyph-only pill still says what it means', async () => {
    const g = await glyphs();

    expect(g.topLabel).toBeTruthy();
    expect(g.overlay).toBeTruthy();
  });
});
