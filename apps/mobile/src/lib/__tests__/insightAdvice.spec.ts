import { insightAdvice, recommendationList } from '../insightAdvice';

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

  // ── recommendationList ────────────────────────────────────────────────────────────────────
  //
  // SEPARATE FROM `insightAdvice` on purpose, and the difference is the whole reason both exist.
  // That function returns ONE line because it feeds a dashboard panel, where a model returning six
  // recommendations has not thereby earned six lines of a manager's attention. The Report screen IS
  // the report: truncating there would hide advice the reader came to read.

  it('returns every recommendation the report carried, in order', () => {
    expect(
      recommendationList({ recommendations: ['Approve the night shift', 'Review the BOQ'] }),
    ).toEqual(['Approve the night shift', 'Review the BOQ']);
  });

  it('drops blanks and non-strings instead of rendering empty bullets', () => {
    expect(recommendationList({ recommendations: ['Real advice', '   ', 42, null] })).toEqual([
      'Real advice',
    ]);
  });

  it('trims, so a model that indented its list does not indent the screen', () => {
    expect(recommendationList({ recommendations: ['  Hold the disbursement  '] })).toEqual([
      'Hold the disbursement',
    ]);
  });

  it('is empty for every report type that carries no recommendations', () => {
    // Binding this to the wrong report renders an empty section rather than a list of RISK items
    // relabelled as advice — which is the failure `insightAdvice`'s own header is about.
    expect(recommendationList({ risk_items: ['Three vendors are late'] })).toEqual([]);
    expect(recommendationList({ recommendations: 'not an array' })).toEqual([]);
    expect(recommendationList({})).toEqual([]);
  });
});
