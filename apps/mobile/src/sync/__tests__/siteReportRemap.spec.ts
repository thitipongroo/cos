import { keptReportId, remapSiteReport, type SiteReportRemapStore } from '../siteReportRemap';

function fakeStore(existing: string[] = []): SiteReportRemapStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    hasReport: async (id) => existing.includes(id),
    moveReports: async (from, to) => void calls.push(`moveReports ${from}→${to}`),
    dropReports: async (id) => void calls.push(`dropReports ${id}`),
    moveUnuploadedPhotos: async (from, to) => void calls.push(`movePhotos ${from}→${to}`),
  };
}

describe('keptReportId', () => {
  it('reads report_id from the push answer, and nothing else', () => {
    expect(keptReportId({ report_id: 'k1' })).toBe('k1');
    expect(keptReportId(null)).toBeNull();
    expect(keptReportId({})).toBeNull();
    expect(keptReportId({ report_id: '' })).toBeNull();
    expect(keptReportId({ report_id: 42 })).toBeNull();
  });
});

describe('remapSiteReport — a save over an existing report adopts the kept id', () => {
  it('moves the local report and its not-yet-uploaded photos to the kept id', async () => {
    const store = fakeStore();
    await expect(remapSiteReport(store, 'client-1', { report_id: 'kept-1' })).resolves.toBe(
      'kept-1',
    );
    expect(store.calls).toEqual(['moveReports client-1→kept-1', 'movePhotos client-1→kept-1']);
  });

  it("drops the device's copy when delta sync already brought the server's row", async () => {
    const store = fakeStore(['kept-1']);
    await remapSiteReport(store, 'client-1', { report_id: 'kept-1' });
    expect(store.calls).toEqual(['dropReports client-1', 'movePhotos client-1→kept-1']);
  });

  it('does nothing when the server kept the device id, or named none', async () => {
    const store = fakeStore();
    await expect(remapSiteReport(store, 'client-1', { report_id: 'client-1' })).resolves.toBe(
      'client-1',
    );
    await remapSiteReport(store, 'client-1', null);
    await remapSiteReport(store, 'client-1', { blockers: 'x' }); // the local payload, no answer
    expect(store.calls).toEqual([]);
  });
});
