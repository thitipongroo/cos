// Behaviour of <QuickActionCard /> — the field Home's one-tap tile.
//
// THE DEFAULT FOLLOWS THE USER'S THEME, and that is the bug this component already shipped once
// (2026-08-08). `variant` used to default to 'light', so the Site Worker Home rendered three white
// tiles on a dark page — the caller simply passed nothing, and nothing about the default said it was
// a choice. An explicit value still wins, because SiteEngineerHome passes 'dark' and must be
// unaffected by the fix. Both halves are asserted here: the regression was that the default was a
// decision in disguise.
//
// THE BADGE IS ABSENT AT ZERO, not a zero. These tiles sit four across on a Home screen, and a red
// dot on every one of them reading "0" is a screen that looks like it is shouting about nothing —
// after which the badge that does mean something is the one nobody sees.
//
// `icon` TAKES A STRING OR A NODE. The string callers predate the icon library and still work; a
// component that silently dropped them would blank the tiles they draw.

import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useThemeStore } from '../../store/themeStore';
import { QuickActionCard } from '../QuickActionCard';

function renderCard(props: Record<string, unknown> = {}) {
  const onPress = jest.fn();
  const utils = render(
    <QuickActionCard testID="tile" label="Report an issue" onPress={onPress} {...props} />,
  );
  return { onPress, utils };
}

/** Every backgroundColor in a tree — the surface is the only thing that says which theme it took. */
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

describe('QuickActionCard', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'dark' } as never);
  });

  it('draws its label and acts when it is tapped', async () => {
    const { onPress, utils } = renderCard();
    const { getByTestId, getByText } = await utils;

    expect(getByText('Report an issue')).toBeTruthy();

    await fireEvent.press(getByTestId('tile'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // The label IS the spoken name: the tile is an icon and two words, and a screen reader given
  // neither would announce "button" and nothing else.
  it('is named by its label', async () => {
    const { utils } = renderCard();
    const { getByTestId } = await utils;

    expect(getByTestId('tile').props.accessibilityRole).toBe('button');
    expect(getByTestId('tile').props.accessibilityLabel).toBe('Report an issue');
  });

  // ── THE DEFAULT THAT WAS A DECISION IN DISGUISE ──────────────────────────────────────────────

  // Three white tiles on a dark page. The caller passed nothing; the component chose light.
  it('follows the user theme when the caller names no variant', async () => {
    useThemeStore.setState({ mode: 'dark' } as never);
    const dark = colours((await renderCard().utils).toJSON());

    useThemeStore.setState({ mode: 'light' } as never);
    const light = colours((await renderCard().utils).toJSON());

    expect(dark).not.toEqual(light);
  });

  // SiteEngineerHome passes 'dark' explicitly and must be unaffected by the fix above.
  it('lets an explicit variant win over the theme', async () => {
    useThemeStore.setState({ mode: 'light' } as never);
    const forcedDark = colours((await renderCard({ variant: 'dark' }).utils).toJSON());

    useThemeStore.setState({ mode: 'dark' } as never);
    const themedDark = colours((await renderCard().utils).toJSON());

    expect(forcedDark).toEqual(themedDark);
  });

  it('lets an explicit light variant win on a dark page too', async () => {
    useThemeStore.setState({ mode: 'dark' } as never);
    const forcedLight = colours((await renderCard({ variant: 'light' }).utils).toJSON());

    useThemeStore.setState({ mode: 'light' } as never);
    const themedLight = colours((await renderCard().utils).toJSON());

    expect(forcedLight).toEqual(themedLight);
  });

  // ── THE BADGE ────────────────────────────────────────────────────────────────────────────────

  it('shows the count when there is something to count', async () => {
    const { utils } = renderCard({ badge: 3 });
    const { getByText } = await utils;

    expect(getByText('3')).toBeTruthy();
  });

  // A red dot reading "0" on every tile is a Home screen shouting about nothing.
  it('shows no badge at zero', async () => {
    const { utils } = renderCard({ badge: 0 });
    const { queryByText } = await utils;

    expect(queryByText('0')).toBeNull();
  });

  it('shows no badge when the caller counts nothing at all', async () => {
    const { utils } = renderCard();
    const { queryByText } = await utils;

    expect(queryByText('0')).toBeNull();
  });

  // A negative count is not a smaller badge — it is data that should never have arrived, and the
  // tile says nothing rather than printing "-1" beside an action.
  it('shows no badge on a count below zero', async () => {
    const { utils } = renderCard({ badge: -1 });
    const { queryByText } = await utils;

    expect(queryByText('-1')).toBeNull();
  });

  // ── THE TWO KINDS OF ICON ────────────────────────────────────────────────────────────────────

  // The string callers predate the icon library; dropping them would blank their tiles.
  it('draws an emoji icon', async () => {
    const { utils } = renderCard({ icon: '📋' });
    const { getByText } = await utils;

    expect(getByText('📋')).toBeTruthy();
  });

  it('draws a rendered icon node', async () => {
    const { utils } = renderCard({ icon: <Text testID="glyph">report</Text> });
    const { getByTestId } = await utils;

    expect(getByTestId('glyph')).toBeTruthy();
  });

  // A tile with no icon is still a tile: the label carries it, rather than the row collapsing.
  it('draws without an icon at all', async () => {
    const { utils } = renderCard();
    const { getByText } = await utils;

    expect(getByText('Report an issue')).toBeTruthy();
  });
});
