'use client';

import { useState } from 'react';
import { useI18n } from '../../../../i18n';
import { formatMoney } from '../../../../lib/format';

interface WorkPackage {
  id: string;
  code: string;
  title: string;
  contractor: string;
  project: string;
  contractValue: number;
  progressPercent: number;
  billedAmount: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PENDING_APPROVAL';
  submittalsCount: { approved: number; total: number };
}

const SAMPLE_PACKAGES: WorkPackage[] = [
  {
    id: 'wp-101',
    code: 'WP-STR-01',
    title: 'Superstructure Reinforced Concrete Framing',
    contractor: 'Thai Obayashi Sub-Piling Ltd.',
    project: 'BKK-HUB-01',
    contractValue: 45000000,
    progressPercent: 68,
    billedAmount: 28900000,
    status: 'IN_PROGRESS',
    submittalsCount: { approved: 24, total: 26 },
  },
  {
    id: 'wp-102',
    code: 'WP-FAC-03',
    title: 'Curtain Wall Unitized Glazing & Weatherproofing',
    contractor: 'Modernist Facade & Glass Tech',
    project: 'PRJ-RAYONG-02',
    contractValue: 32000000,
    progressPercent: 42,
    billedAmount: 12800000,
    status: 'IN_PROGRESS',
    submittalsCount: { approved: 18, total: 22 },
  },
  {
    id: 'wp-103',
    code: 'WP-MEP-02',
    title: 'HVAC Chilled Water Piping & AHU Installation',
    contractor: 'Bangkok MEP Electrical Engineering',
    project: 'BKK-HUB-01',
    contractValue: 18500000,
    progressPercent: 95,
    billedAmount: 17575000,
    status: 'PENDING_APPROVAL',
    submittalsCount: { approved: 15, total: 15 },
  },
];

/**
 * Contractor Portal - Awarded Project Management.
 * Implements Stitch Screen 88ce6c022f1d4870afda2d6e4dc43c38.
 */
export default function ContractorPortalPage() {
  const { t, locale } = useI18n();
  const [packages, setPackages] = useState(SAMPLE_PACKAGES);
  const [claimModalPackage, setClaimModalPackage] = useState<WorkPackage | null>(null);
  const [claimAmount, setClaimAmount] = useState('2500000');
  const [claimNotes, setClaimNotes] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSubmitClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimModalPackage) return;
    setPackages((prev) =>
      prev.map((wp) =>
        wp.id === claimModalPackage.id
          ? {
              ...wp,
              billedAmount: wp.billedAmount + parseFloat(claimAmount || '0'),
              status: 'PENDING_APPROVAL',
            }
          : wp,
      ),
    );
    setToastMessage(
      `Progress claim for ${claimModalPackage.code} (${formatMoney(locale, claimAmount, 'THB')}) submitted successfully.`,
    );
    setClaimModalPackage(null);
    setClaimNotes('');
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {t('procurement.contractorPortalTitle')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/70 text-blue-400 border border-blue-800/40">
              Contractor Desk
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('procurement.contractorPortalSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded bg-[#1E293B] border border-slate-700/60 text-xs font-mono text-slate-300">
            Active Contracts: {packages.length}
          </span>
        </div>
      </div>

      {toastMessage && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {toastMessage}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 pb-2">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('procurement.totalContractValue')}
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatMoney(
              locale,
              packages.reduce((s, p) => s + p.contractValue, 0).toString(),
              'THB',
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-1">
            Across {packages.length} awarded packages
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('procurement.totalBilledToDate')}
          </span>
          <div className="text-2xl font-extrabold text-cyan-400 mt-1">
            {formatMoney(
              locale,
              packages.reduce((s, p) => s + p.billedAmount, 0).toString(),
              'THB',
            )}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium mt-1">
            61.4% Cumulative Progress
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('procurement.complianceClearance')}
          </span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">57 / 63</div>
          <span className="text-[11px] text-slate-400 mt-1">
            Approved shop drawings & test certs
          </span>
        </div>
      </div>

      {/* Main Work Packages Table */}
      <div className="p-6 flex-1 overflow-auto">
        <div className="rounded-xl border border-white/5 bg-[#0F172A] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5 flex justify-between items-center bg-[#111827]/40">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500 text-[18px]">
                construction
              </span>
              {t('procurement.awardedWorkPackages')}
            </h3>
          </div>

          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#102034]/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-semibold">
              <tr>
                <th className="py-3 px-4">{t('procurement.colPackageCode')}</th>
                <th className="py-3 px-4">{t('procurement.colPackageTitle')}</th>
                <th className="py-3 px-4">{t('procurement.colContractor')}</th>
                <th className="py-3 px-4">{t('procurement.colProject')}</th>
                <th className="py-3 px-4">{t('procurement.colContractValue')}</th>
                <th className="py-3 px-4">{t('procurement.colProgress')}</th>
                <th className="py-3 px-4">{t('table.status')}</th>
                <th className="py-3 px-4 text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {packages.map((wp) => (
                <tr key={wp.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-white">{wp.code}</td>
                  <td className="py-3.5 px-4 font-medium text-slate-100">{wp.title}</td>
                  <td className="py-3.5 px-4 text-slate-300">{wp.contractor}</td>
                  <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">{wp.project}</td>
                  <td className="py-3.5 px-4 font-semibold text-white">
                    {formatMoney(locale, wp.contractValue.toString(), 'THB')}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${wp.progressPercent}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-slate-300">
                        {wp.progressPercent}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        wp.status === 'COMPLETED'
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/40'
                          : wp.status === 'PENDING_APPROVAL'
                            ? 'bg-amber-950/70 text-amber-300 border-amber-800/40'
                            : 'bg-blue-950/70 text-blue-300 border-blue-800/40'
                      }`}
                    >
                      {wp.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setClaimModalPackage(wp)}
                      className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-sm"
                    >
                      {t('procurement.submitClaim')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Progress Claim Modal */}
      {claimModalPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSubmitClaim}
            className="w-full max-w-lg rounded-2xl bg-[#0F172A] border border-blue-600/40 shadow-2xl p-6 text-white space-y-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold">{t('procurement.submitProgressClaimTitle')}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {claimModalPackage.code} • {claimModalPackage.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClaimModalPackage(null)}
                className="text-slate-400 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="claim-amount-input" className="block text-slate-400 mb-1">
                  Claim Amount (THB)
                </label>
                <input
                  id="claim-amount-input"
                  type="number"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label htmlFor="claim-notes-textarea" className="block text-slate-400 mb-1">
                  Work Description & Milestones Cleared
                </label>
                <textarea
                  id="claim-notes-textarea"
                  rows={3}
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  placeholder="e.g. Completed level 4 concrete slab pouring and curing inspections."
                  className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-white"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClaimModalPackage(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md"
              >
                {t('procurement.confirmClaim')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
