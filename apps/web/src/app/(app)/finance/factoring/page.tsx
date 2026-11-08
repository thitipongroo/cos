'use client';

import { useState } from 'react';
import { useI18n } from '../../../../i18n';
import { formatMoney } from '../../../../lib/format';

interface FactoringInvoice {
  id: string;
  invoiceNumber: string;
  subcontractor: string;
  project: string;
  amount: number;
  advanceRate: number; // e.g. 0.85
  feeRate: number; // e.g. 0.015
  dueDate: string;
  aiVerificationScore: number;
  status: 'ELIGIBLE' | 'FACTORING' | 'SETTLED';
}

interface SubcontractorPayout {
  id: string;
  vendorName: string;
  project: string;
  workPackage: string;
  progressPercent: number;
  claimedAmount: number;
  approvedAmount: number;
  status: 'PENDING' | 'VERIFIED' | 'RELEASED' | 'FLAGGED';
}

const SAMPLE_FACTORING_INVOICES: FactoringInvoice[] = [
  {
    id: 'fac-1',
    invoiceNumber: 'INV-2026-9042',
    subcontractor: 'Thai Obayashi Sub-Piling Ltd.',
    project: 'BKK-HUB-01',
    amount: 14500000,
    advanceRate: 0.85,
    feeRate: 0.015,
    dueDate: '2026-12-15',
    aiVerificationScore: 99.2,
    status: 'ELIGIBLE',
  },
  {
    id: 'fac-2',
    invoiceNumber: 'INV-2026-8819',
    subcontractor: 'Siam Concrete & Structural Precast',
    project: 'EEC-LOG-04',
    amount: 8750000,
    advanceRate: 0.9,
    feeRate: 0.014,
    dueDate: '2026-11-30',
    aiVerificationScore: 98.7,
    status: 'ELIGIBLE',
  },
  {
    id: 'fac-3',
    invoiceNumber: 'INV-2026-7731',
    subcontractor: 'Bangkok MEP Electrical Engineering',
    project: 'BKK-HUB-01',
    amount: 5200000,
    advanceRate: 0.85,
    feeRate: 0.015,
    dueDate: '2026-12-05',
    aiVerificationScore: 97.4,
    status: 'ELIGIBLE',
  },
  {
    id: 'fac-4',
    invoiceNumber: 'INV-2026-6649',
    subcontractor: 'Modernist Facade & Glass Tech',
    project: 'PRJ-RAYONG-02',
    amount: 12400000,
    advanceRate: 0.85,
    feeRate: 0.015,
    dueDate: '2026-12-28',
    aiVerificationScore: 99.8,
    status: 'ELIGIBLE',
  },
];

const SAMPLE_PAYOUTS: SubcontractorPayout[] = [
  {
    id: 'pay-1',
    vendorName: 'Apex Deep Foundation Partners',
    project: 'BKK-HUB-01',
    workPackage: 'Bored Piling (Phase 2)',
    progressPercent: 92,
    claimedAmount: 6400000,
    approvedAmount: 6400000,
    status: 'VERIFIED',
  },
  {
    id: 'pay-2',
    vendorName: 'Chao Phraya Steel Reinforcement',
    project: 'EEC-LOG-04',
    workPackage: 'Superstructure Framing',
    progressPercent: 78,
    claimedAmount: 4800000,
    approvedAmount: 4650000,
    status: 'PENDING',
  },
  {
    id: 'pay-3',
    vendorName: 'Thonglor Smart MEP Systems',
    project: 'PRJ-RAYONG-02',
    workPackage: 'HVAC Ducting & Electrical Main',
    progressPercent: 45,
    claimedAmount: 2100000,
    approvedAmount: 1800000,
    status: 'FLAGGED',
  },
];

/**
 * Invoice Factoring & Subcontractor Payouts Management.
 * Implements Stitch screens:
 * - Refined Invoice Factoring - Cash Flow Management (10486e8a55f84f44bc47cbad73aa6e36)
 * - Subcontractor Payout Management - Finance Officer (7f887adce05f4f0ea524d1b02d180801)
 */
export default function InvoiceFactoringPage() {
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<'factoring' | 'payouts'>('factoring');
  const [invoices, setInvoices] = useState(SAMPLE_FACTORING_INVOICES);
  const [payouts, setPayouts] = useState(SAMPLE_PAYOUTS);
  const [factoringModal, setFactoringModal] = useState<FactoringInvoice | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const handleFactorInvoice = (invoice: FactoringInvoice) => {
    setFactoringModal(invoice);
  };

  const handleConfirmFactoring = () => {
    if (!factoringModal) return;
    setInvoices((prev) =>
      prev.map((i) => (i.id === factoringModal.id ? { ...i, status: 'SETTLED' } : i)),
    );
    setStatusNotification(
      `Funding of ${formatMoney(locale, (factoringModal.amount * factoringModal.advanceRate).toString(), 'THB')} approved for ${factoringModal.invoiceNumber}`,
    );
    setFactoringModal(null);
    setTimeout(() => setStatusNotification(null), 4000);
  };

  const handleBatchReleasePayouts = () => {
    setPayouts((prev) =>
      prev.map((p) => (p.status === 'VERIFIED' ? { ...p, status: 'RELEASED' } : p)),
    );
    setStatusNotification('Batch payment released to verified subcontractors.');
    setTimeout(() => setStatusNotification(null), 4000);
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header Bar */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {t('finance.factoringTitle')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
              AI Credit Line: ฿150M Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('finance.factoringSubtitle')}</p>
        </div>

        {/* Tab & Action Controls */}
        <div className="flex items-center gap-3">
          <div className="flex bg-[#1E293B] p-1 rounded-lg border border-slate-700/50">
            <button
              type="button"
              onClick={() => setActiveTab('factoring')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                activeTab === 'factoring'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('finance.tabFactoring')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payouts')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                activeTab === 'payouts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('finance.tabPayouts')}
            </button>
          </div>

          {activeTab === 'factoring' ? (
            <button
              type="button"
              onClick={() => {
                setInvoices((prev) => prev.map((i) => ({ ...i, status: 'SETTLED' })));
                setStatusNotification(
                  'All AI-verified invoices queued for accelerated bank release.',
                );
                setTimeout(() => setStatusNotification(null), 4000);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              {t('finance.factorAllVerified')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBatchReleasePayouts}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              {t('finance.batchReleasePayouts')}
            </button>
          )}
        </div>
      </div>

      {/* Notification Toast */}
      {statusNotification && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {statusNotification}
        </div>
      )}

      {/* Bento KPI Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 pb-2">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('finance.kpiReceivables')}
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatMoney(locale, '40850000', 'THB')}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium mt-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">verified</span>
            100% Audit Cleared
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('finance.kpiLiquidityVelocity')}
          </span>
          <div className="text-2xl font-extrabold text-cyan-400 mt-1">+2.8x Speed</div>
          <span className="text-[11px] text-slate-400 mt-1">Avg. 4.2h vs 45 days normal</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('finance.kpiAcceleratedFunds')}
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatMoney(locale, '124500000', 'THB')}
          </div>
          <span className="text-[11px] text-blue-400 mt-1">Flat 1.5% discount fee</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('finance.kpiPayoutAccuracy')}
          </span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">98.9%</div>
          <span className="text-[11px] text-slate-400 mt-1">Cross-matched with site logs</span>
        </div>
      </div>

      {/* Main Content Table Section */}
      <div className="p-6 flex-1 overflow-auto">
        {activeTab === 'factoring' ? (
          <div className="rounded-xl border border-white/5 bg-[#0F172A] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/5 flex justify-between items-center bg-[#111827]/40">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500 text-[18px]">
                  account_balance
                </span>
                {t('finance.eligibleInvoices')}
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {invoices.filter((i) => i.status === 'ELIGIBLE').length} Invoices Available
              </span>
            </div>

            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#102034]/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                <tr>
                  <th className="py-3 px-4">{t('finance.colInvoiceNumber')}</th>
                  <th className="py-3 px-4">{t('finance.colSubcontractor')}</th>
                  <th className="py-3 px-4">{t('finance.colProject')}</th>
                  <th className="py-3 px-4">{t('pm.colAmount')}</th>
                  <th className="py-3 px-4">{t('finance.colAdvanceRate')}</th>
                  <th className="py-3 px-4">{t('finance.colNetAdvance')}</th>
                  <th className="py-3 px-4">{t('finance.colAiScore')}</th>
                  <th className="py-3 px-4 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.map((inv) => {
                  const netAdvance = inv.amount * inv.advanceRate * (1 - inv.feeRate);
                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        {inv.subcontractor}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {inv.project}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {formatMoney(locale, inv.amount.toString(), 'THB')}
                      </td>
                      <td className="py-3.5 px-4 text-blue-400 font-bold">
                        {inv.advanceRate * 100}%
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        {formatMoney(locale, netAdvance.toString(), 'THB')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-800/40">
                          <span className="material-symbols-outlined text-[12px]">verified</span>
                          {inv.aiVerificationScore}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {inv.status === 'ELIGIBLE' ? (
                          <button
                            type="button"
                            onClick={() => handleFactorInvoice(inv)}
                            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-sm"
                          >
                            {t('finance.actionFactor')}
                          </button>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/30">
                            {t('finance.statusSettled')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#0F172A] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/5 flex justify-between items-center bg-[#111827]/40">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500 text-[18px]">
                  engineering
                </span>
                {t('finance.subcontractorPayoutQueue')}
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {payouts.length} Milestones Pending Settlement
              </span>
            </div>

            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#102034]/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                <tr>
                  <th className="py-3 px-4">{t('finance.colVendor')}</th>
                  <th className="py-3 px-4">{t('finance.colWorkPackage')}</th>
                  <th className="py-3 px-4">{t('finance.colProject')}</th>
                  <th className="py-3 px-4">{t('finance.colProgress')}</th>
                  <th className="py-3 px-4">{t('finance.colClaimedAmount')}</th>
                  <th className="py-3 px-4">{t('finance.colApprovedAmount')}</th>
                  <th className="py-3 px-4">{t('table.status')}</th>
                  <th className="py-3 px-4 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white">{p.vendorName}</td>
                    <td className="py-3.5 px-4 text-slate-200">{p.workPackage}</td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {p.project}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              p.progressPercent > 80 ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${p.progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-slate-300">
                          {p.progressPercent}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {formatMoney(locale, p.claimedAmount.toString(), 'THB')}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-400">
                      {formatMoney(locale, p.approvedAmount.toString(), 'THB')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          p.status === 'RELEASED'
                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/40'
                            : p.status === 'VERIFIED'
                              ? 'bg-blue-950/70 text-blue-300 border-blue-800/40'
                              : p.status === 'FLAGGED'
                                ? 'bg-rose-950/70 text-rose-300 border-rose-800/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {p.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayouts((prev) =>
                              prev.map((item) =>
                                item.id === p.id ? { ...item, status: 'VERIFIED' } : item,
                              ),
                            );
                          }}
                          className="px-2.5 py-1 rounded bg-blue-600/80 hover:bg-blue-500 text-white font-semibold text-xs"
                        >
                          {t('finance.verify')}
                        </button>
                      )}
                      {p.status === 'VERIFIED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayouts((prev) =>
                              prev.map((item) =>
                                item.id === p.id ? { ...item, status: 'RELEASED' } : item,
                              ),
                            );
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                        >
                          {t('finance.release')}
                        </button>
                      )}
                      {p.status === 'RELEASED' && (
                        <span className="text-xs text-slate-500 font-mono">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Factoring Confirmation Modal */}
      {factoringModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#0F172A] border border-blue-600/40 shadow-2xl p-6 text-white space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold">{t('finance.confirmFactoringTitle')}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Invoice {factoringModal.invoiceNumber} • {factoringModal.subcontractor}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFactoringModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="rounded-xl bg-[#111827] border border-slate-800 p-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Invoice Face Value:</span>
                <span className="font-bold text-white">
                  {formatMoney(locale, factoringModal.amount.toString(), 'THB')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Advance Capital (85%):</span>
                <span className="font-bold text-cyan-400">
                  {formatMoney(
                    locale,
                    (factoringModal.amount * factoringModal.advanceRate).toString(),
                    'THB',
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fast Factoring Fee (1.5% flat):</span>
                <span className="font-bold text-amber-400">
                  -{' '}
                  {formatMoney(
                    locale,
                    (
                      factoringModal.amount *
                      factoringModal.advanceRate *
                      factoringModal.feeRate
                    ).toString(),
                    'THB',
                  )}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between text-sm">
                <span className="font-bold text-white">Net Immediate Liquidity Disbursed:</span>
                <span className="font-extrabold text-emerald-400">
                  {formatMoney(
                    locale,
                    (
                      factoringModal.amount *
                      factoringModal.advanceRate *
                      (1 - factoringModal.feeRate)
                    ).toString(),
                    'THB',
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFactoringModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmFactoring}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">bolt</span>
                {t('finance.approveDisbursement')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
