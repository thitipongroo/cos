// Behaviour of the th/en switcher (§20.5 / §20.6.2).
//
// IT EXISTS BECAUSE OF WHERE IT SITS. The language control lives in profile.tsx, which is behind
// sign-in — so without this, a user has no way to change language BEFORE authenticating, on the one
// screen where they have to understand what they are being asked. The default is 'en' (PO decision
// 2026-07-26, overriding QM-3's th-TH), so on this platform the pre-auth reader who needs the switch
// is the Thai-speaking site worker, which is most of them.
//
// IT SHOWS THE CURRENT LOCALE AND IS NAMED FOR THE NEXT ONE, and that split is deliberate rather
// than sloppy: the flag and the code answer "what am I reading now", while the testID matches
// profile.tsx's `locale-<locale>` chips so the two controls are addressed the same way.
//
// The flags are local to this file rather than taken from lib/countries.ts FLAG_SVG, because that
// map is keyed by DIALLING country for the phone picker — a Union Jack is a language mark here, not
// a callable country, and sharing the map would tie the language control to the telephone plan.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider, useI18n } from '../../i18n';
import { useLocaleStore } from '../../store/localeStore';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { Text } from 'react-native';

/** Prints the active locale, so a switch can be observed rather than inferred from the mock. */
function ActiveLocale() {
  const { locale } = useI18n();
  return <Text testID="active-locale">{locale}</Text>;
}

function renderSwitcher() {
  return render(
    <I18nProvider>
      <LanguageSwitcher />
      <ActiveLocale />
    </I18nProvider>,
  );
}

describe('LanguageSwitcher', () => {
  // The store is a module-level zustand store, so a switch in one test is still in force in the
  // next — which is exactly what it should do in the app, and exactly what has to be undone here.
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
  });

  it('offers the other locale, named for where it goes', async () => {
    const { getByTestId } = await renderSwitcher();

    // The app starts on 'en' — DEFAULT_LOCALE, per the 2026-07-26 decision — so the control on
    // offer is the one to Thai.
    expect(getByTestId('locale-th')).toBeTruthy();
  });

  // The CODE is the current locale, not the next: it answers "what am I reading", which is the
  // question someone staring at a language they cannot read is actually asking.
  it('shows which language is being read right now', async () => {
    const { getByText } = await renderSwitcher();

    expect(getByText('EN')).toBeTruthy();
  });

  it('switches to the other locale when pressed', async () => {
    const { getByTestId } = await renderSwitcher();

    await fireEvent.press(getByTestId('locale-th'));

    await waitFor(() => expect(getByTestId('active-locale').props.children).toBe('th'));
  });

  // Once switched, the control offers the way BACK — a one-way switch on a pre-auth screen strands
  // whoever pressed it by accident in a language they cannot read, with sign-in still ahead of them.
  it('offers the way back once it has switched', async () => {
    const { getByTestId, getByText } = await renderSwitcher();

    await fireEvent.press(getByTestId('locale-th'));

    await waitFor(() => expect(getByTestId('locale-en')).toBeTruthy());
    expect(getByText('TH')).toBeTruthy();
  });

  it('switches back', async () => {
    const { getByTestId } = await renderSwitcher();

    await fireEvent.press(getByTestId('locale-th'));
    await waitFor(() => expect(getByTestId('locale-en')).toBeTruthy());

    await fireEvent.press(getByTestId('locale-en'));

    await waitFor(() => expect(getByTestId('active-locale').props.children).toBe('en'));
  });

  // A FLAG AND TWO LETTERS ARE NOT A NAME. A screen reader reading this control gets an image and
  // "EN", which says nothing about what pressing it does — the spoken label has to name the thing.
  it('is named for what it controls, not for the two letters on it', async () => {
    const { getByTestId } = await renderSwitcher();

    expect(getByTestId('locale-th').props.accessibilityRole).toBe('button');
    expect(getByTestId('locale-th').props.accessibilityLabel).toBe('Language');
  });
});
