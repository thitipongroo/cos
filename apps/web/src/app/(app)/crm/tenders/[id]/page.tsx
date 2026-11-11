'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '../../../../../i18n';
import { fill } from '../../../../../i18n/fill';
import { formatMoney } from '../../../../../lib/format';

interface BidderAnalysis {
  rank: number;
  contractor: string;
  bidPrice: number;
  variancePercent: number; // relative to central price
  technicalScore: number;
  scheduleDays: number;
  isRecommended: boolean;
}

const SAMPLE_BIDDERS: BidderAnalysis[] = [
  {
    rank: 1,
    contractor: 'Thai Obayashi Sub-Piling Ltd.',
    bidPrice: 178200000,
    variancePercent: -3.67,
    technicalScore: 96.5,
    scheduleDays: 240,
    isRecommended: true,
  },
  {
    rank: 2,
    contractor: 'Siam Structural Precast & Engineering',
    bidPrice: 181500000,
    variancePercent: -1.89,
    technicalScore: 94.2,
    scheduleDays: 255,
    isRecommended: false,
  },
  {
    rank: 3,
    contractor: 'Bangkok Civil Infrastructure Consortium',
    bidPrice: 184000000,
    variancePercent: -0.54,
    technicalScore: 91.8,
    scheduleDays: 270,
    isRecommended: false,
  },
  {
    rank: 4,
    contractor: 'Eastern Seaboard Heavy Const.',
    bidPrice: 189500000,
    variancePercent: +2.43,
    technicalScore: 88.0,
    scheduleDays: 290,
    isRecommended: false,
  },
];

/**
 * Tender Package Detail & Contractor Bid Variance Analysis.
 * Implements Stitch Screens:
 * - Tender Package Detail - Structural Phase (0bef52a5fd51412aa861d72f8357e2b3)
 * - Contractor Bid Variance Analysis (57938216a11c4b5fb6b229da84e85e99)
 */
export default function TenderPackageDetailPage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const tenderId = params?.id as string;

  const [activeTab, setActiveTab] = useState<'bids' | 'boq'>('bids');
  const [bidders] = useState(SAMPLE_BIDDERS);
  const [selectedBidder, setSelectedBidder] = useState<BidderAnalysis | null>(null);
  const [awardNotice, setAwardNotice] = useState<string | null>(null);

  const centralPrice = 185000000;

  const handleSelectBidder = (b: BidderAnalysis) => {
    setSelectedBidder(b);
    setAwardNotice(
      fill(t('crm.tender.awardNotice'), {
        contractor: b.contractor,
        amount: formatMoney(locale, b.bidPrice.toString(), 'THB'),
      }),
    );
    setTimeout(() => setAwardNotice(null), 4000);
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Header Bar */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/crm/pipeline"
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              {t('common.back')}
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-white">
              {fill(t('crm.tender.title'), { id: tenderId || 'EGP-2026-8819' })}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800/40">
              {t('crm.tender.liveBadge')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {fill(t('crm.tender.subtitle'), {
              project: 'Bangkok Gateway Smart Logistics Terminal',
            })}
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-3">
          <div className="flex bg-[#1E293B] p-1 rounded-lg border border-slate-700/50">
            <button
              type="button"
              onClick={() => setActiveTab('bids')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                activeTab === 'bids'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('crm.bidVarianceAnalysis')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('boq')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                activeTab === 'boq'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('crm.technicalBoq')}
            </button>
          </div>
        </div>
      </div>

      {awardNotice && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {awardNotice}
        </div>
      )}

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 pb-2">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('crm.officialCentralPrice')}
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatMoney(locale, centralPrice.toString(), 'THB')}
          </div>
          <span className="text-[11px] text-slate-400 mt-1">{t('crm.tender.ceilingSource')}</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('crm.lowestBid')}
          </span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {formatMoney(locale, bidders[0].bidPrice.toString(), 'THB')}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium mt-1">
            {fill(t('crm.tender.belowCeiling'), { percent: '-3.67%' })}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('crm.activeBiddersCount')}
          </span>
          <div className="text-2xl font-extrabold text-cyan-400 mt-1">
            {fill(t('crm.tender.contractorsCount'), { count: bidders.length })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1">
            {fill(t('crm.tender.prequalified'), { percent: '100%' })}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('crm.submissionDeadline')}
          </span>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">
            {fill(t('crm.tender.daysLeft'), { days: 12 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1">
            {fill(t('crm.tender.closes'), { datetime: '2026-11-20 16:30 ICT' })}
          </span>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-6 flex-1 overflow-auto">
        {activeTab === 'bids' ? (
          <div className="rounded-xl border border-white/5 bg-[#0F172A] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/5 flex justify-between items-center bg-[#111827]/40">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500 text-[18px]">
                  analytics
                </span>
                {t('crm.contractorBidVarianceTable')}
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {fill(t('crm.tender.rankedBy'), { price: '70%', technical: '30%' })}
              </span>
            </div>

            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#102034]/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                <tr>
                  <th className="py-3 px-4">{t('crm.tender.rank')}</th>
                  <th className="py-3 px-4">{t('crm.contractorName')}</th>
                  <th className="py-3 px-4">{t('crm.bidPrice')}</th>
                  <th className="py-3 px-4">{t('crm.varianceFromCeiling')}</th>
                  <th className="py-3 px-4">{t('crm.technicalScore')}</th>
                  <th className="py-3 px-4">{t('crm.scheduleDays')}</th>
                  <th className="py-3 px-4 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bidders.map((b) => (
                  <tr
                    key={b.rank}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      b.isRecommended ? 'bg-emerald-950/10' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-white">#{b.rank}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-100 flex items-center gap-2">
                      {b.contractor}
                      {b.isRecommended && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-600 text-white">
                          {t('crm.tender.recommended')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {formatMoney(locale, b.bidPrice.toString(), 'THB')}
                    </td>
                    <td className="py-3.5 px-4 font-bold">
                      <span
                        className={b.variancePercent <= 0 ? 'text-emerald-400' : 'text-rose-400'}
                      >
                        {b.variancePercent > 0 ? '+' : ''}
                        {b.variancePercent}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-cyan-300 font-semibold">
                        {b.technicalScore} / 100
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-mono">
                      {fill(t('crm.tender.daysValue'), { days: b.scheduleDays })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSelectBidder(b)}
                        className={`px-3 py-1 rounded font-semibold text-xs transition-all shadow-sm ${
                          selectedBidder?.contractor === b.contractor
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {selectedBidder?.contractor === b.contractor
                          ? t('crm.tender.selected')
                          : t('crm.selectForAward')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[#0F172A] p-6 space-y-4">
            <h3 className="text-base font-bold text-white">{t('crm.tender.boqTitle')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="p-4 rounded-lg bg-[#111827] border border-slate-800 space-y-2">
                <h4 className="font-bold text-white">{t('crm.tender.specConcreteTitle')}</h4>
                <p>
                  {fill(t('crm.tender.specConcrete1'), { grade: 'C40/50', quantity: '48,000' })}
                </p>
                <p>{fill(t('crm.tender.specConcrete2'), { grade: 'SD50T', quantity: '6,200' })}</p>
                <p>
                  {fill(t('crm.tender.specConcrete3'), {
                    size: '15.2mm',
                    standard: 'ASTM A416',
                    quantity: '850',
                  })}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-[#111827] border border-slate-800 space-y-2">
                <h4 className="font-bold text-white">{t('crm.tender.specSubmittalTitle')}</h4>
                <p>{t('crm.tender.specSubmittal1')}</p>
                <p>{fill(t('crm.tender.specSubmittal2'), { days: 28 })}</p>
                <p>{t('crm.tender.specSubmittal3')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
