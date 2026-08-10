import { insightAdvice } from '../insightAdvice';

describe('insightAdvice', () => {
  it('reads the executive summary’s recommendations as advice', () => {
    expect(
      insightAdvice({ executive_summary: 'x', recommendations: ['Expedite formwork.'] }),
    ).toEqual({ kind: 'recommendation', text: 'Expedite formwork.' });
  });

  it('reports a procurement risk item AS a risk, not as a recommendation', () => {
    // PROCUREMENT_SUMMARY has no recommendations field. Printing `risk_items[0]` under the word
    // "Recommendation" would frame a finding as a suggested course of action.
    expect(insightAdvice({ summary: 'x', risk_items: ['Concrete supply variance 12%'] })).toEqual({
      kind: 'risk',
      text: 'Concrete supply variance 12%',
    });
  });

  it('prefers what to DO over what is wrong when a report offers both', () => {
    expect(
      insightAdvice({ risk_flags: ['Behind schedule'], recommendations: ['Add a second crew'] }),
    ).toEqual({ kind: 'recommendation', text: 'Add a second crew' });
  });

  it('reads the other report types’ risk fields too', () => {
    expect(insightAdvice({ risk_factors: ['Heavy rain forecast'] })?.kind).toBe('risk');
    expect(insightAdvice({ key_issues: ['Scaffold missing guardrail'] })?.text).toBe(
      'Scaffold missing guardrail',
    );
  });

  it('shows only the first — a glance is not a full report', () => {
    expect(insightAdvice({ recommendations: ['One', 'Two', 'Three'] })?.text).toBe('One');
  });

  it('skips blank entries rather than printing an empty block', () => {
    expect(insightAdvice({ recommendations: ['', '   ', 'Real advice'] })?.text).toBe(
      'Real advice',
    );
  });

  it('trims, so the layout is not pushed around by the model’s whitespace', () => {
    expect(insightAdvice({ recommendations: ['  padded  '] })?.text).toBe('padded');
  });

  it('is null when the report carried no advice and no findings', () => {
    expect(insightAdvice({ summary: 'All quiet.' })).toBeNull();
    expect(insightAdvice({})).toBeNull();
  });

  it('ignores a field that is not an array of strings', () => {
    // The body is free-form per report type; a template change must not crash the panel.
    expect(insightAdvice({ recommendations: 'not an array' })).toBeNull();
    expect(insightAdvice({ recommendations: [42, null] })).toBeNull();
  });
});
