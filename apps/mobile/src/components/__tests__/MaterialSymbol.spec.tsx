// The app's one Material Symbols call site wrapper.
//
// What matters here is not that a glyph renders — a font cannot be exercised in jest — but that the
// component keeps the two properties that make a SECOND icon font tolerable: it renders the ligature
// name through the registered family, and it stays out of the accessibility tree so a screen reader
// never reads "temp_preferences_custom" aloud.
//
// Every query passes `includeHiddenElements: true` BECAUSE of that second property: this library
// excludes accessibility-hidden nodes from `getByTestId` by default, so a component that is doing
// its job correctly is invisible to the ordinary query. That is the assertion, not a workaround.

import { render, cleanup } from '@testing-library/react-native';
import { MaterialSymbol, MATERIAL_SYMBOLS_FAMILY } from '../MaterialSymbol';

afterEach(cleanup);

describe('MaterialSymbol', () => {
  it('renders the glyph name as text — the ligature IS the mechanism', async () => {
    const { getByTestId } = await render(<MaterialSymbol name="tune" size={20} color="#fff" />);
    expect(getByTestId('symbol-tune', { includeHiddenElements: true })).toHaveTextContent('tune');
  });

  it('draws through the family app/_layout.tsx registers', async () => {
    // If these two ever disagree the glyph silently renders as its own name in the body font, which
    // looks like a missing translation rather than a missing font.
    const { getByTestId } = await render(<MaterialSymbol name="tune" size={20} color="#fff" />);
    const style = getByTestId('symbol-tune', { includeHiddenElements: true }).props.style as Record<
      string,
      unknown
    >[];
    expect(JSON.stringify(style)).toContain(MATERIAL_SYMBOLS_FAMILY);
  });

  it('is square: line height follows font size', async () => {
    // A glyph on a text baseline sits high in its row, with descender space beneath it.
    const { getByTestId } = await render(<MaterialSymbol name="tune" size={24} color="#fff" />);
    const style = JSON.stringify(
      getByTestId('symbol-tune', { includeHiddenElements: true }).props.style,
    );
    expect(style).toContain('"fontSize":24');
    expect(style).toContain('"lineHeight":24');
  });

  it('is hidden from assistive technology', async () => {
    const { getByTestId } = await render(<MaterialSymbol name="tune" size={20} color="#fff" />);
    expect(
      getByTestId('symbol-tune', { includeHiddenElements: true }).props.accessibilityElementsHidden,
    ).toBe(true);
    expect(
      getByTestId('symbol-tune', { includeHiddenElements: true }).props.importantForAccessibility,
    ).toBe('no');
  });

  it('takes a caller testID when one screen needs to find its own', async () => {
    const { getByTestId } = await render(
      <MaterialSymbol name="tune" size={20} color="#fff" testID="risk-heading-glyph" />,
    );
    expect(getByTestId('risk-heading-glyph', { includeHiddenElements: true })).toBeTruthy();
  });
});
