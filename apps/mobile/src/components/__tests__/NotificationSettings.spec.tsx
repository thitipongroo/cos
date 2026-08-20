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

  // FOR THE PRODUCT OWNER, recorded rather than decided. `channelOn` is "any type is on for this
  // channel", and it reads ALL types including the locked one — whose flag defaults to ON and which
  // the switch above never writes. So switching a channel off mutes every type it can and the
  // switch stays ON. That is arguably honest (safety mail still goes out on that channel) and
  // arguably broken (a control that does not move when pressed). This pins TODAY's behaviour so the
  // question is visible; it is not an endorsement of either reading.
  it('leaves the channel switch on afterwards, because safety cannot be muted', async () => {
    const { getByTestId } = await renderSection();

    await waitFor(() => expect(getByTestId('notification-channel-EMAIL')).toBeTruthy());
    await fireEvent(getByTestId('notification-channel-EMAIL'), 'valueChange', false);

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(getByTestId('notification-channel-EMAIL').props.value).toBe(true);
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

  // Quiet hours come from the stored row and are DISPLAYED only — the PATCH body is channel flags,
  // so there is no endpoint to edit them through yet.
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
});
