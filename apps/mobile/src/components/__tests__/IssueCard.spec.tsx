// Behaviour of one row of the Site Engineer's issue board.
//
// ONE STATE MAY NOT HAVE TWO GLYPHS. This card drew `check-circle` for SYNCED and was missed when
// the two sync pills were corrected on 2026-08-20 — the mockups draw a tick here and a cloud
// everywhere else, so a worker who learns the cloud on the top bar had to read this card's tick as
// something else. On a board about defects that is the wrong thing to leave ambiguous. ADR-085: the
// mockup is authoritative for STYLE, never for what a symbol means.
//
// A RESOLVED ISSUE IS NOT DIMMED, NOT STRUCK, AND NOT LESS TAPPABLE (PO 2026-08-12: "การ์ดทุกใบต้อง
// กดได้"). The card carried a strike-through AND a 0.7 opacity over the whole plate, and together
// they made resolved cards read as DISABLED — but the record of a fixed defect is exactly what an
// engineer opens. Its green strip and RESOLVED chip already say it is done.
//
// THE LOCATION SLOT HOLDS THE CATEGORY, NOT A PLACE (PO 2026-08-12). The drawing says "Sector B -
// Pier 4"; `site_ops.issues` has no floor, room, zone or area column, so there is no location to
// print. The slot carries `issue_type` — real, CHECK-constrained, varying per card, and the same
// classification the Phase 6 task-completion gate reads. Its glyph is `category`, deliberately, so
// it does not promise a place.
//
// AND THE TWO NULLABLE COLUMNS ARE NULLABLE FOR A REASON: `issue_type` and `created_at` only reach
// the device as of local DDL v6, so a row cached before that has neither — and a card with no
// timestamp shows NO age rather than an invented one.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { IssueCard } from '../IssueCard';

function issue(over: Record<string, unknown> = {}) {
  return {
    id: 'local-1',
    issueId: '9f8a1234-0000-4000-8000-abcdefabcdef',
    projectId: 'proj-1',
    reportId: null,
    title: 'Formwork misaligned on level 3',
    description: null,
    severity: 'CRITICAL',
    status: 'OPEN',
    issueType: 'DEFECT',
    createdAt: new Date().toISOString(),
    offlineSyncStatus: 'SYNCED',
    ...over,
  };
}

function renderCard({ issue: over, ...props }: Record<string, unknown> = {}) {
  // `issue` is pulled OUT of the spread: leaving it in put the partial override back on top of the
  // built row, so every field the test did not name went undefined — and the first version of this
  // helper did exactly that, which is why three tests could not find a card at all.
  return render(
    <I18nProvider>
      <IssueCard issue={issue(over as Record<string, unknown>) as never} {...props} />
    </I18nProvider>,
  );
}

describe('IssueCard', () => {
  it('renders the issue with its title', async () => {
    const { getByTestId, getByText } = await renderCard();

    expect(getByTestId('issue-item')).toBeTruthy();
    expect(getByText('Formwork misaligned on level 3')).toBeTruthy();
  });

  // ── THE SYNC MARK ────────────────────────────────────────────────────────────────────────────

  // The one glyph the whole app uses for SYNCED.
  it('marks a synced issue with the cloud, not a tick', async () => {
    const { getByText, queryByText } = await renderCard({ issue: { offlineSyncStatus: 'SYNCED' } });

    expect(getByText('cloud-done')).toBeTruthy();
    expect(queryByText('check-circle')).toBeNull();
  });

  it('marks work still on its way with the sync glyph', async () => {
    const { getByText } = await renderCard({ issue: { offlineSyncStatus: 'PENDING' } });

    expect(getByText('sync')).toBeTruthy();
  });

  // A conflict is not a slower sync — it is a decision waiting for someone, and it takes the danger
  // tone and its own glyph so it cannot be read as "still going".
  it('marks a conflict distinctly from work in flight', async () => {
    const { getByText, queryByText } = await renderCard({
      issue: { offlineSyncStatus: 'CONFLICT' },
    });

    expect(getByText('error-outline')).toBeTruthy();
    expect(queryByText('sync')).toBeNull();
  });

  // ── A FINISHED ISSUE ─────────────────────────────────────────────────────────────────────────

  it.each(['RESOLVED', 'CLOSED'])('keeps a %s issue as tappable as any other', async (status) => {
    const onPress = jest.fn();

    const { getByLabelText } = await renderCard({ issue: { status }, onPress });

    await fireEvent.press(getByLabelText('Formwork misaligned on level 3'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // A card with nothing to open must not LOOK pressable — the drawing's chevron is a promise, and
  // the board renders these cards in places where nothing is behind them.
  it('is not pressable when there is nothing to open', async () => {
    const { getByLabelText } = await renderCard();

    expect(
      getByLabelText('Formwork misaligned on level 3').props.accessibilityRole,
    ).toBeUndefined();
  });

  it('takes the button role only when something is behind it', async () => {
    const { getByLabelText } = await renderCard({ onPress: jest.fn() });

    expect(getByLabelText('Formwork misaligned on level 3').props.accessibilityRole).toBe('button');
  });

  // ── THE METADATA ROW ─────────────────────────────────────────────────────────────────────────

  // The status rides beside the severity, because a card that says CRITICAL without saying whether
  // it is still open says half of it — and the filter chips above the list sort on exactly that.
  it('states the severity and the status together', async () => {
    const { getByText } = await renderCard({
      issue: { severity: 'CRITICAL', status: 'IN_PROGRESS' },
    });

    // TRANSLATED, not the raw enum: `statusLabel` is what turns the column value into words, and a
    // test asserting the enum would pass on a card printing the database's vocabulary at a worker.
    expect(getByText('Critical')).toBeTruthy();
    expect(getByText('In progress')).toBeTruthy();
  });

  // The category, with the `category` glyph — never a place glyph, because there is no place.
  it('fills the drawing location slot with the category, under a glyph that promises no place', async () => {
    const { getByText, queryByText } = await renderCard({ issue: { issueType: 'REWORK' } });

    expect(getByText('category')).toBeTruthy();
    expect(queryByText('place')).toBeNull();
    expect(queryByText('location-on')).toBeNull();
  });

  // A row cached before DDL v6 has no `issue_type` — the slot is absent rather than showing a chip
  // with nothing in it.
  it('shows no category on a row cached before the column existed', async () => {
    const { queryByText } = await renderCard({ issue: { issueType: null } });

    expect(queryByText('category')).toBeNull();
  });

  // ── THE AGE ──────────────────────────────────────────────────────────────────────────────────

  it('prints how long the issue has been waiting', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const { getByText } = await renderCard({ issue: { createdAt: threeHoursAgo } });

    expect(getByText('history')).toBeTruthy();
    expect(getByText('3h ago')).toBeTruthy();
  });

  // No timestamp, no age — an invented one on a defect board would be a claim about how long
  // something has been wrong.
  it('shows no age on a row that carries no timestamp', async () => {
    const { queryByText } = await renderCard({ issue: { createdAt: null } });

    expect(queryByText('history')).toBeNull();
  });

  it('shows no age when the timestamp cannot be read', async () => {
    const { queryByText } = await renderCard({ issue: { createdAt: 'not-a-date' } });

    expect(queryByText('history')).toBeNull();
  });

  // ── THE PHOTO HEADER ─────────────────────────────────────────────────────────────────────────

  // An issue captured on THIS device stores its photo under the same client UUID that becomes the
  // issue id — so the thumbnail is this issue's own photo, read from the local file. Not a stock
  // image, and not a network fetch.
  it('shows the issue own captured photo when there is one', async () => {
    const { getByTestId } = await renderCard({ photoUri: 'file:///photos/local-1.jpg' });

    expect(getByTestId('issue-photo-local-1').props.source).toMatchObject({
      uri: 'file:///photos/local-1.jpg',
    });
  });

  // An issue that arrived from the server with no local capture simply has no header, which is
  // honest — a placeholder image would suggest a photo exists somewhere.
  it('shows no header on an issue with no local capture', async () => {
    const { queryByTestId } = await renderCard();

    expect(queryByTestId('issue-photo-local-1')).toBeNull();
  });

  // DECORATIVE, and marked so: the title beneath says what the issue is, and a photo of a defect has
  // no alternative text this app could truthfully write for it.
  it('hides the photo from a screen reader rather than describing it falsely', async () => {
    const { getByTestId } = await renderCard({ photoUri: 'file:///photos/local-1.jpg' });

    expect(getByTestId('issue-photo-local-1').props.accessible).toBe(false);
  });

  // ── THE ID ───────────────────────────────────────────────────────────────────────────────────

  // Shortened: the eyebrow is a reference someone reads out, and a full uuid is not one.
  it('shortens the server id rather than printing all of it', async () => {
    const { queryByText } = await renderCard();

    expect(queryByText('9f8a1234-0000-4000-8000-abcdefabcdef')).toBeNull();
  });
});
