// Behaviour of the transparency kit — the pieces the eleven transparency screens are built from.
//
// This portal exists to tell a data subject the truth about what the product does with their data,
// so the kit's own rules are about not overstating:
//
//   <StatusPill />      says LIVE or PLANNED. A planned capability drawn as live would be the
//                       portal itself making the claim it exists to prevent.
//   <DisabledAction />  announces as a DISABLED button. The mockups draw controls that have nothing
//                       behind them yet; rendering one as a live button is a tap that does nothing,
//                       which reads as the app being broken rather than the feature being unbuilt.
//   <DangerLink />      is a real Pressable with a real destination — the mockup drew it as a button
//                       with nothing behind it, and that is the exact failure above.
//
// Nineteen components in this file opened with the same two lines until 2026-08-20, when they became
// `useKitStyles()`. That is why several of them are exercised here at once: one hook now stands
// between every one of them and its palette.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import {
  DangerLink,
  DisabledAction,
  FieldRow,
  InfoCard,
  NavCard,
  StatusPill,
} from '../TransparencyKit';

function renderKit(ui: React.JSX.Element) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('TransparencyKit', () => {
  describe('StatusPill', () => {
    it('says a live capability is live', async () => {
      const { getByTestId } = await renderKit(
        <StatusPill status="live" label="LIVE" testID="pill" />,
      );

      expect(getByTestId('pill')).toBeTruthy();
    });

    // A planned capability drawn as live is the portal making the claim it exists to prevent.
    it('draws a planned capability differently from a live one', async () => {
      const live = await renderKit(<StatusPill status="live" label="LIVE" testID="pill" />);
      const planned = await renderKit(
        <StatusPill status="planned" label="PLANNED" testID="pill" />,
      );

      expect(JSON.stringify(live.getByTestId('pill').props.style)).not.toBe(
        JSON.stringify(planned.getByTestId('pill').props.style),
      );
    });

    it('reads out as text, not as a control', async () => {
      const { getByTestId } = await renderKit(
        <StatusPill status="live" label="LIVE" testID="pill" />,
      );

      expect(getByTestId('pill').props.accessibilityRole).toBe('text');
    });
  });

  describe('DisabledAction', () => {
    // A control that looks tappable and does nothing reads as the app being broken rather than the
    // feature being unbuilt — so it announces as disabled, and says why in its label.
    it('announces as a disabled button', async () => {
      const { getByTestId } = await renderKit(
        <DisabledAction
          icon="download"
          label="Download my data"
          comingSoon="Coming soon"
          testID="action"
        />,
      );

      expect(getByTestId('action').props.accessibilityRole).toBe('button');
      expect(getByTestId('action').props.accessibilityState.disabled).toBe(true);
    });

    it('says in its spoken label that it is not built yet', async () => {
      const { getByTestId } = await renderKit(
        <DisabledAction
          icon="download"
          label="Download my data"
          comingSoon="Coming soon"
          testID="action"
        />,
      );

      expect(getByTestId('action').props.accessibilityLabel).toContain('Download my data');
      expect(getByTestId('action').props.accessibilityLabel).toContain('Coming soon');
    });
  });

  describe('NavCard', () => {
    it('opens the category it names', async () => {
      const onPress = jest.fn();

      const { getByTestId } = await renderKit(
        <NavCard
          icon="location-on"
          title="Location"
          body="Where the app reads your position"
          onPress={onPress}
          testID="nav"
        />,
      );

      await fireEvent.press(getByTestId('nav'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('carries a status pill when the caller gives it one', async () => {
      const { getByText } = await renderKit(
        <NavCard
          icon="location-on"
          title="Location"
          body="Where the app reads your position"
          onPress={jest.fn()}
          status="planned"
          statusLabel="PLANNED"
          testID="nav"
        />,
      );

      expect(getByText('PLANNED')).toBeTruthy();
    });
  });

  describe('InfoCard and FieldRow', () => {
    it('shows the title and body it was given', async () => {
      const { getByText } = await renderKit(
        <InfoCard icon="info" title="Retention" body="Kept for seven years" testID="card" />,
      );

      expect(getByText('Retention')).toBeTruthy();
      expect(getByText('Kept for seven years')).toBeTruthy();
    });

    it('shows a field, its value and its note', async () => {
      const { getByText } = await renderKit(
        <FieldRow label="Install ID" value="dev-1111" note="Rotates on reinstall" testID="row" />,
      );

      expect(getByText('Install ID')).toBeTruthy();
      expect(getByText('dev-1111')).toBeTruthy();
      expect(getByText('Rotates on reinstall')).toBeTruthy();
    });
  });

  describe('DangerLink', () => {
    // A REAL destination — the mockup drew a button with nothing behind it, which is the failure
    // this portal exists to avoid.
    it('is a real control with a real destination', async () => {
      const onPress = jest.fn();

      const { getByTestId } = await renderKit(
        <DangerLink label="Request data deletion" onPress={onPress} testID="danger" />,
      );

      expect(getByTestId('danger').props.accessibilityRole).toBe('button');
      await fireEvent.press(getByTestId('danger'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('renders without an icon when none is given', async () => {
      const { getByText } = await renderKit(
        <DangerLink label="Request data deletion" onPress={jest.fn()} testID="danger" />,
      );

      expect(getByText('Request data deletion')).toBeTruthy();
    });
  });
});
