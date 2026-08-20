// Behaviour of the task row.
//
// THE WHOLE CARD SAYS ONE THING (PO 2026-08-11). The accent strip, the badge and the progress bar
// take ONE colour, because they used to disagree — a red CRITICAL badge could sit above a yellow bar,
// which reads as two verdicts on one row. The rule is the badge's, so it holds wherever the badge
// changes, and these tests read all three from the same render rather than checking each alone.
//
// EVERY VALUE IS REAL. The drawing's HIGH/MEDIUM priority badge has no column behind it —
// `projects.tasks` has no priority, checked against the live schema — so the badge carries what the
// row can actually decide: its STATE on the dashboard, and how LATE it is on the task list.
//
// NO STRIKE-THROUGH, AND STILL PRESSABLE, WHEN A TASK IS DONE (PO 2026-08-12: "การ์ดไหนที่ complete
// ไม่ต้องขีด และยังสามารถกดได้เหมือนเดิม"). Struck text reads as cancelled or withdrawn, which a
// completed task is the opposite of. Only swipe-to-complete is withheld, because there is nothing
// left to complete.
//
// AND A CRITICAL CARD LOSES ITS ACTION (PO 2026-08-12). The drawing's blocked card carries the red
// warning panel INSTEAD of the button, not as well as it: a task two weeks past its date is not
// moved on by nudging a percentage, and offering that as the card's one button points the reader at
// the smallest thing they could do.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { TaskCard, shortTaskId } from '../TaskCard';

/** `planned_end` is a DATE; these are built relative to today so the bands are what they claim. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function task(over: Record<string, unknown> = {}) {
  return {
    id: 'local-1',
    taskId: '9f8a1234-0000-4000-8000-abcdefc48820',
    projectId: 'proj-1',
    taskName: 'Pour slab level 4',
    status: 'IN_PROGRESS',
    progressPercent: 40,
    assignedTo: null,
    workType: 'STRUCTURE',
    plannedStart: null,
    plannedEnd: null,
    plannedStartTime: null,
    plannedEndTime: null,
    offlineSyncStatus: 'SYNCED',
    ...over,
  };
}

function renderCard({ task: over, ...props }: Record<string, unknown> = {}) {
  const onPress = jest.fn();
  const onComplete = jest.fn();
  const utils = render(
    <I18nProvider>
      <TaskCard
        task={task(over as Record<string, unknown>) as never}
        onPress={onPress}
        onComplete={onComplete}
        {...props}
      />
    </I18nProvider>,
  );
  return { onPress, onComplete, utils };
}

/** Every backgroundColor in a tree, in order — the strip, the badge ground and the bar fill. */
function colours(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as { props?: { style?: unknown }; children?: unknown[] };
  const here = [n.props?.style]
    .flat(3)
    .map((s) => {
      const style = s as Record<string, unknown> | undefined;
      return style && typeof style['backgroundColor'] === 'string'
        ? (style['backgroundColor'] as string)
        : null;
    })
    .filter((c): c is string => c !== null);
  return [...here, ...(n.children ?? []).flatMap(colours)];
}

/** Every percentage width in a tree — the bar fill is the only one, and it is what gets clamped. */
function widths(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as { props?: { style?: unknown }; children?: unknown[] };
  const here = [n.props?.style]
    .flat(3)
    .map((s) => {
      const style = s as Record<string, unknown> | undefined;
      const w = style?.['width'];
      return typeof w === 'string' && w.endsWith('%') ? w : null;
    })
    .filter((w): w is string => w !== null);
  return [...here, ...(n.children ?? []).flatMap(widths)];
}

const CARD = 'task-9f8a1234-0000-4000-8000-abcdefc48820';

describe('TaskCard', () => {
  it('renders the task with its name', async () => {
    const { utils } = renderCard();
    const { getByTestId, getByText } = await utils;

    expect(getByTestId(CARD)).toBeTruthy();
    expect(getByText('Pour slab level 4')).toBeTruthy();
  });

  it('opens the task when tapped', async () => {
    const { onPress, utils } = renderCard();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId(CARD));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // ── THE ID EYEBROW ───────────────────────────────────────────────────────────────────────────

  // A REAL SUBSTRING, not a hash: a worker reads this off the card to find the row, so it has to
  // match back. The full 36-character uuid is not something any card shows or anyone reads aloud.
  it('shortens the id to something readable that still matches the row', () => {
    expect(shortTaskId('9f8a1234-0000-4000-8000-abcdefc48820')).toBe('EFC48820');
    expect('9f8a1234-0000-4000-8000-abcdefc48820'.toUpperCase()).toContain('EFC48820');
  });

  it('shows the shortened id, not the whole one', async () => {
    const { utils } = renderCard();
    const { queryByText } = await utils;

    expect(queryByText(/9f8a1234-0000/)).toBeNull();
  });

  // A task raised offline has no server id yet, so there is no reference to print — the eyebrow is
  // absent rather than showing an empty prefix.
  it('shows no reference on a task the server has not seen', async () => {
    const withId = await renderCard().utils;
    const prefix = withId.getByText(/EFC48820/).props.children as string;

    const { utils } = renderCard({ task: { taskId: '' } });
    const { getByTestId, queryByText } = await utils;

    // The eyebrow is ABSENT, not an empty prefix: "ID: #" with nothing after it reads as a reference
    // that failed to load rather than one that does not exist yet.
    expect(queryByText(prefix)).toBeNull();
    expect(queryByText(/ID/)).toBeNull();
    // And the card still identifies itself to the list, by the fallback testID.
    expect(getByTestId('task-item')).toBeTruthy();
  });

  // ── THE STATE BADGE ──────────────────────────────────────────────────────────────────────────

  it('wears the task state on the dashboard', async () => {
    const { utils } = renderCard({ badge: 'status' });
    const { getByText } = await utils;

    expect(getByText('In progress')).toBeTruthy();
  });

  // The drawing's priority badge has no column behind it, so it must not appear under any name.
  it.each(['HIGH', 'MEDIUM'])('never prints a %s priority it has no column for', async (word) => {
    const { utils } = renderCard({ badge: 'status' });
    const { queryByText } = await utils;

    expect(queryByText(word)).toBeNull();
  });

  // ── HOW LATE IT IS ───────────────────────────────────────────────────────────────────────────
  //
  // §15.4's four bands, on the task list only. The dashboard shows state instead — one component,
  // because everything else about the card is identical and two copies would drift.

  it.each([
    ['CRITICAL', 20],
    ['HIGH', 9],
    ['MEDIUM', 4],
    ['LOW', 2],
  ])('reads %s when the task is %s days past its date', async (band, late) => {
    const { utils } = renderCard({
      badge: 'severity',
      task: { plannedEnd: daysAgo(late as number) },
    });
    const { getByText } = await utils;

    expect(getByText(band as string)).toBeTruthy();
  });

  // Not late is not a band: a task inside its window shows its STATE, because there is nothing
  // overdue to report and a fifth "on time" band would be a badge that never changes.
  it('falls back to the state when the task is not late at all', async () => {
    const { utils } = renderCard({
      badge: 'severity',
      task: { plannedEnd: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) },
    });
    const { getByText } = await utils;

    expect(getByText('In progress')).toBeTruthy();
  });

  // A task with no planned end cannot be late. The card says nothing rather than assuming a date.
  it('reports no lateness on a task with no planned end', async () => {
    const { utils } = renderCard({ badge: 'severity', task: { plannedEnd: null } });
    const { queryByText } = await utils;

    expect(queryByText('CRITICAL')).toBeNull();
  });

  // A finished task is never late, however long ago its date was — the work is done.
  it.each(['COMPLETED', 'DONE'])('reports no lateness on a %s task', async (status) => {
    const { utils } = renderCard({
      badge: 'severity',
      task: { status, plannedEnd: daysAgo(90), progressPercent: 100 },
    });
    const { queryByText } = await utils;

    expect(queryByText('CRITICAL')).toBeNull();
  });

  // ── THE CRITICAL CARD ────────────────────────────────────────────────────────────────────────

  // The warning panel INSTEAD of the action, not as well as it.
  it('replaces the action with the warning when a task is critically late', async () => {
    const { utils } = renderCard({ badge: 'severity', task: { plannedEnd: daysAgo(20) } });
    const { getByText, queryByText } = await utils;

    expect(getByText('warning')).toBeTruthy();
    expect(queryByText('Update progress')).toBeNull();
  });

  // The panel is worded as the overdue FACT it is, never as an invented cause: the drawing names
  // "ขาดแคลนวัสดุ", which would be a per-task blocker field, and `projects.tasks` has no such column.
  it('names the lateness rather than a cause it cannot know', async () => {
    const { utils } = renderCard({ badge: 'severity', task: { plannedEnd: daysAgo(20) } });
    const { queryByText } = await utils;

    expect(queryByText(/material/i)).toBeNull();
    expect(queryByText(/blocked by/i)).toBeNull();
  });

  // Shown only where the badge reads CRITICAL, so it never fires on a card that looks calm — the
  // warning and the badge are two halves of one decision and must never disagree.
  it('shows no warning on a card whose badge reads a softer band', async () => {
    const { utils } = renderCard({ badge: 'severity', task: { plannedEnd: daysAgo(4) } });
    const { queryByText } = await utils;

    expect(queryByText('warning')).toBeNull();
  });

  // And none on the DASHBOARD, where the badge is not showing lateness at all.
  it('shows no warning where the badge is not about lateness', async () => {
    const { utils } = renderCard({ badge: 'status', task: { plannedEnd: daysAgo(20) } });
    const { queryByText } = await utils;

    expect(queryByText('warning')).toBeNull();
  });

  // ── A FINISHED TASK ──────────────────────────────────────────────────────────────────────────

  it('keeps a finished task pressable', async () => {
    const { onPress, utils } = renderCard({
      task: { status: 'COMPLETED', progressPercent: 100 },
    });
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId(CARD));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // The badge already reads "Completed"; an action beside it stated the same fact twice.
  it('offers no action on a finished task', async () => {
    const { utils } = renderCard({ task: { status: 'COMPLETED', progressPercent: 100 } });
    const { queryByText } = await utils;

    expect(queryByText('Update progress')).toBeNull();
  });

  // Progress alone finishes a task, not just the status word: a row at 100% is done whatever its
  // status column says, because the bar is what a foreman reads.
  it('treats a task at 100% as finished even without the status', async () => {
    const { utils } = renderCard({ task: { status: 'IN_PROGRESS', progressPercent: 100 } });
    const { queryByText } = await utils;

    expect(queryByText('Update progress')).toBeNull();
  });

  it('offers the action on a task still under way', async () => {
    const { utils } = renderCard();
    const { getByText } = await utils;

    expect(getByText('Update progress')).toBeTruthy();
  });

  // ── ONE COLOUR ACROSS THE CARD ───────────────────────────────────────────────────────────────

  // The strip, the badge ground and the bar fill are one statement. A red badge over a yellow bar is
  // two verdicts on one row.
  it('paints the strip and the bar in the badge colour on a critical card', async () => {
    const critical = colours(
      (await renderCard({ badge: 'severity', task: { plannedEnd: daysAgo(20) } }).utils).toJSON(),
    );
    const drifting = colours(
      (await renderCard({ badge: 'severity', task: { plannedEnd: daysAgo(4) } }).utils).toJSON(),
    );

    // THE ACCENT THE CRITICAL CARD USES IS NOT ON THE DRIFTING ONE, and it is on the critical card
    // TWICE — the strip and the bar fill. "Some colour appears twice" would be true of almost any
    // tree; what is asserted is that the one colour the band decides appears in both places.
    const bandColour = critical.find((c) => !drifting.includes(c));
    expect(bandColour).toBeDefined();
    expect(critical.filter((c) => c === bandColour)).toHaveLength(2);
  });

  // IN PROGRESS IS YELLOW, as the drawing has it (PO 2026-08-11) — and it earns the colour: a task
  // started and not finished is the one with something outstanding. It was the app's blue, which
  // made every running task look like a button. (Reported done once while the line still said
  // `p.primary`; nothing tested a colour, so nothing caught it — this is that test.)
  it('gives a started task a different accent from an untouched one', async () => {
    const started = colours((await renderCard({ task: { progressPercent: 40 } }).utils).toJSON());
    const untouched = colours(
      (await renderCard({ task: { status: 'NOT_STARTED', progressPercent: 0 } }).utils).toJSON(),
    );

    expect(started).not.toEqual(untouched);
  });

  it('gives a finished task a different accent again', async () => {
    const done = colours(
      (await renderCard({ task: { status: 'COMPLETED', progressPercent: 100 } }).utils).toJSON(),
    );
    const started = colours((await renderCard({ task: { progressPercent: 40 } }).utils).toJSON());

    expect(done).not.toEqual(started);
  });

  // ── THE PROGRESS FIGURE ──────────────────────────────────────────────────────────────────────

  it('prints the figure beside the bar it describes', async () => {
    const { utils } = renderCard({ task: { progressPercent: 40 } });
    const { getByText } = await utils;

    expect(getByText('40%')).toBeTruthy();
  });

  // Clamped to the track: `progress_percent` is Max-wins across devices and a server rounding could
  // hand over 101, which would draw a bar past its own frame. THE BAR is what is clamped, not the
  // label — asserting the label would have proved nothing, since it is never clamped at all.
  it.each([
    [140, '100%'],
    [-5, '0%'],
    [40, '40%'],
  ])('draws a bar of %s%% as %s of the track', async (percent, width) => {
    const { utils } = renderCard({ task: { progressPercent: percent } });
    const { toJSON } = await utils;

    expect(widths(toJSON())).toContain(width);
  });
});
