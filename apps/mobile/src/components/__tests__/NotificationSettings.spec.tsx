// Behaviour of the per-role notification settings section.
//
// CRITICAL SAFETY CANNOT BE DISABLED (§19.6). `safety.incident.created.v1` is `locked`, so it draws
// a TICK rather than a switch — a control that does nothing when pressed reads as broken — and the
// bulk channel write skips it. That is the rule with the most weight here: it is the one
// notification a site cannot be talked out of receiving.
//
// AN UNSET FLAG DEFAULTS TO ON. The API returns a row only for a (event_type, channel) pair the
// user has an explicit setting for, so a missing row means "never touched". Reading that as off
// would quietly mute every notification for every account that has never opened this screen.
//
// A CHANNEL SWITCH WRITES ACROSS EVERY UNLOCKED TYPE this role configures, and a type switch writes
// across every channel. They are bulk controls, not single flags, which is why they persist a list.
//
// A REJECTED SAVE SURFACES AS A LINE, not by snapping the control back under the user's finger. The
// write is optimistic on purpose: the switch has already moved, and yanking it is worse than saying
// the save did not stick.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { notificationSectionsFor } from '../../lib/notificationTypes';
import { useAuthStore } from '../../store/authStore';
import { NotificationSettings } from '../NotificationSettings';

jest.mock('../../api/notifications', () => ({
  ...jest.requireActual('../../api/notifications'),
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../api/notifications') as {
  getNotificationPreferences: jest.Mock;
  updateNotificationPreferences: jest.Mock;
};

const ROLE = 'SITE_ENGINEER';

// Read from the same table the component reads, not restated here — a copy would pass while the
// component showed something else entirely.
const ALL_TYPES = notificationSectionsFor(ROLE as never).flatMap((s) => s.types);
const LOCKED = ALL_TYPES.filter((ty) => ty.locked).map((ty) => ty.eventType);
const UNLOCKED = ALL_TYPES.filter((ty) => !ty.locked).map((ty) => ty.eventType);

function row(eventType: string, channel: string, isEnabled: boolean) {
  return {
    event_type: eventType,
    channel,
    is_enabled: isEnabled,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '07:00:00',
  };
}

function renderSection() {
  return render(
    <I18nProvider>
      <NotificationSettings />
    </I18nProvider>,
  );
}

describe('NotificationSettings', () => {
  beforeEach(() => {
    api.getNotificationPreferences.mockReset();
    api.updateNotificationPreferences.mockReset();
    api.getNotificationPreferences.mockResolvedValue([]);
    api.updateNotificationPreferences.mockResolvedValue(undefined);
    useAuthStore.setState({ role: ROLE } as never);
  });

  it('renders a row per channel', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-IN_APP')).toBeTruthy());
    expect(getByTestId('notification-channel-EMAIL')).toBeTruthy();
    expect(getByTestId('notification-channel-LINE')).toBeTruthy();
  });

  // A user who has never opened this screen still gets their notifications.
  it('reads a stored flag that is absent as ON', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-IN_APP')).toBeTruthy());
    expect(getByTestId('notification-channel-IN_APP').props.value).toBe(true);
  });

  it('reads a stored OFF as off', async () => {
    api.getNotificationPreferences.mockResolvedValue(
      ALL_TYPES.map((ty) => row(ty.eventType, 'EMAIL', false)),
    );

    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-EMAIL')).toBeTruthy());
    expect(getByTestId('notification-channel-EMAIL').props.value).toBe(false);
  });

  // §19.6. A switch that refuses to move reads as broken, so the locked type is not given one.
  it('draws the critical safety type as a tick, not a switch', async () => {
    const { queryByTestId } = await renderSection();

    await waitFor(() => expect(queryByTestId('notification-channel-IN_APP')).toBeTruthy());
    expect(LOCKED.length).toBeGreaterThan(0);
    for (const locked of LOCKED) expect(queryByTestId(`notification-type-${locked}`)).toBeNull();
  });

  it('gives every other type a switch', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-IN_APP')).toBeTruthy());
    for (const type of UNLOCKED) expect(getByTestId(`notification-type-${type}`)).toBeTruthy();
  });

  // A BULK control — and it SKIPS the locked type, which is what keeps §19.6 true even when someone
  // switches a whole channel off.
  it('writes a channel across every unlocked type, and never the locked one', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-EMAIL')).toBeTruthy());
    await fireEvent(getByTestId('notification-channel-EMAIL'), 'valueChange', false);

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    const updates = api.updateNotificationPreferences.mock.calls[0][0] as {
      channel: string;
      event_type: string;
      is_enabled: boolean;
    }[];
    expect(updates.map((u) => u.event_type).sort()).toEqual([...UNLOCKED].sort());
    expect(updates.every((u) => u.channel === 'EMAIL')).toBe(true);
    expect(updates.every((u) => u.is_enabled === false)).toBe(true);
  });

  // ANSWERED BY THE PRODUCT OWNER, 2026-08-20: the switch reflects only what it can control.
  //
  // `channelOn` used to read ALL types including the locked §19.6 safety one — whose flag defaults to
  // ON and which `setChannel` never writes. So on the four roles that carry it (EXECUTIVE,
  // PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER) switching a channel off SAVED CORRECTLY and then
  // snapped the switch straight back on. The preference was right; the control was lying about the
  // outcome — and a control someone operates and watches revert is one they stop believing, which on
  // this screen means they stop believing the rest of it too.
  //
  // What still arrives on a channel reading "off" is the critical safety notification, which §19.6
  // says cannot be disabled. The screen does not hide that: the group row carries a padlock.
  it('turns the channel switch off, and leaves it off', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-EMAIL')).toBeTruthy());
    await fireEvent(getByTestId('notification-channel-EMAIL'), 'valueChange', false);

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(getByTestId('notification-channel-EMAIL').props.value).toBe(false);
  });

  // The locked type is UNAFFECTED — the switch neither writes it nor pretends to. §19.6 is a rule
  // about what the platform sends, not about what this control claims.
  it('never writes the locked safety type when a channel is switched off', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-EMAIL')).toBeTruthy());
    await fireEvent(getByTestId('notification-channel-EMAIL'), 'valueChange', false);

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    const written = api.updateNotificationPreferences.mock.calls[0][0] as Array<{
      event_type: string;
    }>;
    expect(written.map((u) => u.event_type)).not.toContain(LOCKED[0]);
  });

  // And it comes back ON when the channel is switched on again — the round trip is what proves the
  // switch is reading the same set it writes, rather than agreeing by accident in one direction.
  it('turns back on again', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-EMAIL')).toBeTruthy());
    await fireEvent(getByTestId('notification-channel-EMAIL'), 'valueChange', false);
    await waitFor(() => expect(getByTestId('notification-channel-EMAIL').props.value).toBe(false));

    await fireEvent(getByTestId('notification-channel-EMAIL'), 'valueChange', true);

    await waitFor(() => expect(getByTestId('notification-channel-EMAIL').props.value).toBe(true));
  });

  // The other bulk control: one type, every channel.
  it('writes a type across every channel', async () => {
    const type = UNLOCKED[0]!;

    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId(`notification-type-${type}`)).toBeTruthy());
    await fireEvent(getByTestId(`notification-type-${type}`), 'valueChange', false);

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    const updates = api.updateNotificationPreferences.mock.calls[0][0] as { channel: string }[];
    expect(updates.map((u) => u.channel).sort()).toEqual(['EMAIL', 'IN_APP', 'LINE']);
  });

  it('moves the switch straight away rather than waiting on the server', async () => {
    const type = UNLOCKED[0]!;
    let settle: () => void = () => undefined;
    api.updateNotificationPreferences.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );

    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId(`notification-type-${type}`)).toBeTruthy());
    await fireEvent(getByTestId(`notification-type-${type}`), 'valueChange', false);

    await waitFor(() => expect(getByTestId(`notification-type-${type}`).props.value).toBe(false));
    settle();
  });

  // A line, not a control snapping back under the finger.
  it('says the save did not stick rather than yanking the switch back', async () => {
    const type = UNLOCKED[0]!;
    api.updateNotificationPreferences.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId(`notification-type-${type}`)).toBeTruthy());
    await fireEvent(getByTestId(`notification-type-${type}`), 'valueChange', false);

    await waitFor(() => expect(getByTestId('notification-settings-error')).toBeTruthy());
    expect(getByTestId(`notification-type-${type}`).props.value).toBe(false);
  });

  it('reports a failure to load rather than showing everything as off', async () => {
    api.getNotificationPreferences.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-settings-error')).toBeTruthy());
  });

  // Quiet hours come from the stored row and, since 2026-09-13, are EDITABLE — see the block of
  // cases below for why that changed.
  it('shows the stored quiet-hours window, trimmed to HH:MM', async () => {
    api.getNotificationPreferences.mockResolvedValue([
      {
        ...row(UNLOCKED[0]!, 'IN_APP', true),
        quiet_hours_start: '21:30:00',
        quiet_hours_end: '06:15:00',
      },
    ]);

    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-quiet-start')).toBeTruthy());
    expect(String(getByTestId('notification-quiet-start').props.children)).toBe('21:30');
    expect(String(getByTestId('notification-quiet-end').props.children)).toBe('06:15');
  });
  // ── Quiet hours: editable since 2026-09-13 (Stitch 63c6dcca…) ────────────────────────────────
  //
  // They were read-only because `api/notifications.ts` said "quiet-hours EDITING has no endpoint
  // yet" — a claim that outlived the endpoint by long enough for two screens to copy it. The DTO
  // validates both edges as HH:MM and the repository writes them as `::time`.
  describe('quiet hours', () => {
    it('is ON when the stored window has width, and draws the two edges', async () => {
      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-toggle')).toBeTruthy());
      expect(getByTestId('notification-quiet-toggle').props.value).toBe(true);
      expect(getByTestId('notification-quiet-start')).toBeTruthy();
      expect(getByTestId('notification-quiet-end')).toBeTruthy();
    });

    // START === END IS THE OFF STATE, and it is the backend's own tested convention rather than a
    // meaning invented here: `isWithinQuietHours` returns false for every instant when the edges
    // meet, pinned by "empty window (start==end) is never quiet" in notification.service.spec.ts.
    it('is OFF when the stored window is empty, and then draws no edges at all', async () => {
      api.getNotificationPreferences.mockResolvedValue([
        {
          ...row(UNLOCKED[0]!, 'IN_APP', true),
          quiet_hours_start: '22:00:00',
          quiet_hours_end: '22:00:00',
        },
      ]);

      const { getByTestId, queryByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-toggle')).toBeTruthy());
      expect(getByTestId('notification-quiet-toggle').props.value).toBe(false);
      // Hidden rather than dimmed: a greyed 22:00 → 07:00 still reads as a window merely paused.
      expect(queryByTestId('notification-quiet-start')).toBeNull();
      expect(queryByTestId('notification-quiet-end')).toBeNull();
    });

    it('collapses the window onto its own start when switched off', async () => {
      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-toggle')).toBeTruthy());
      await fireEvent(getByTestId('notification-quiet-toggle'), 'valueChange', false);

      await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalled());
      const [, window] = api.updateNotificationPreferences.mock.calls.at(-1)!;
      expect(window).toEqual({ start: '22:00', end: '22:00' });
    });

    it('reopens on the stored start and the default end when switched back on', async () => {
      api.getNotificationPreferences.mockResolvedValue([
        {
          ...row(UNLOCKED[0]!, 'IN_APP', true),
          quiet_hours_start: '23:00:00',
          quiet_hours_end: '23:00:00',
        },
      ]);

      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-toggle')).toBeTruthy());
      await fireEvent(getByTestId('notification-quiet-toggle'), 'valueChange', true);

      // The START the user picked survives being switched off; only the END falls back.
      const [, window] = api.updateNotificationPreferences.mock.calls.at(-1)!;
      expect(window).toEqual({ start: '23:00', end: '07:00' });
    });

    it('steps an edge by a whole hour and saves it', async () => {
      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-start-inc')).toBeTruthy());
      await fireEvent.press(getByTestId('notification-quiet-start-inc'));

      await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalled());
      const [, window] = api.updateNotificationPreferences.mock.calls.at(-1)!;
      expect(window).toEqual({ start: '23:00', end: '07:00' });
      expect(String(getByTestId('notification-quiet-start').props.children)).toBe('23:00');
    });

    it('wraps an edge at midnight rather than running past 23:00', async () => {
      api.getNotificationPreferences.mockResolvedValue([
        {
          ...row(UNLOCKED[0]!, 'IN_APP', true),
          quiet_hours_start: '23:00:00',
          quiet_hours_end: '07:00:00',
        },
      ]);

      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-start-inc')).toBeTruthy());
      await fireEvent.press(getByTestId('notification-quiet-start-inc'));

      expect(String(getByTestId('notification-quiet-start').props.children)).toBe('00:00');
    });

    // EQUAL EDGES MEAN OFF, so a user stepping End back onto Start would silently disable the
    // feature they were in the middle of adjusting.
    it('refuses a step that would land one edge on the other', async () => {
      api.getNotificationPreferences.mockResolvedValue([
        {
          ...row(UNLOCKED[0]!, 'IN_APP', true),
          quiet_hours_start: '22:00:00',
          quiet_hours_end: '23:00:00',
        },
      ]);

      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-end-dec')).toBeTruthy());
      await fireEvent.press(getByTestId('notification-quiet-end-dec'));

      expect(String(getByTestId('notification-quiet-end').props.children)).toBe('23:00');
      expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
    });

    // THE WINDOW CANNOT BE WRITTEN ALONE. `updatePreferences` upserts the preference rows first and
    // then stamps the window across the rows the user owns, so a PATCH with an empty `preferences`
    // array writes nothing for anyone who has never touched a switch — `updateQuietHours` says so
    // itself ("0 when the user has no rows yet").
    it('sends the current flags alongside the window, never the window alone', async () => {
      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-start-inc')).toBeTruthy());
      await fireEvent.press(getByTestId('notification-quiet-start-inc'));

      await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalled());
      const [flags] = api.updateNotificationPreferences.mock.calls.at(-1)!;
      expect(flags.length).toBeGreaterThan(0);
      // §19.6 — the locked safety type is never written, and is never quieted either.
      for (const locked of LOCKED) {
        expect(flags.some((f: { event_type: string }) => f.event_type === locked)).toBe(false);
      }
    });

    it('reports a rejected window save rather than leaving the control looking saved', async () => {
      api.updateNotificationPreferences.mockRejectedValue(new Error('offline'));

      const { getByTestId } = await renderSection();

      await waitFor(() => expect(getByTestId('notification-quiet-start-inc')).toBeTruthy());
      await fireEvent.press(getByTestId('notification-quiet-start-inc'));

      await waitFor(() => expect(getByTestId('notification-settings-error')).toBeTruthy());
    });
  });
});
