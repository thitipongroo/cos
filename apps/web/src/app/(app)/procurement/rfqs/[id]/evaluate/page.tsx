'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '../../../../../../i18n';
import { formatMoney } from '../../../../../../lib/format';

interface VendorBid {
  vendorId: string;
  vendorName: string;
  totalPrice: number;
  unitPrice: number;
  leadTimeDays: number;
  qualityScore: number;
  esgRating: string;
  weightedScore: number;
  isRecommended: boolean;
}

const SAMPLE_BIDS: VendorBid[] = [
  {
    vendorId: 'v-cpac',
    vendorName: 'CPAC Modern Precast & Ready-Mix Co., Ltd.',
    totalPrice: 14200000,
    unitPrice: 2840,
    leadTimeDays: 7,
    qualityScore: 98.5,
    esgRating: 'Low-Carbon Green Label',
    weightedScore: 96.2,
    isRecommended: true,
  },
  {
    vendorId: 'v-siam',
    vendorName: 'Siam City Concrete Public Co., Ltd.',
    totalPrice: 14650000,
    unitPrice: 2930,
    leadTimeDays: 10,
    qualityScore: 95.0,
    esgRating: 'Standard SCG ISO 14001',
    weightedScore: 91.8,
    isRecommended: false,
  },
  {
    vendorId: 'v-tpi',
    vendorName: 'TPI Polene Construction Materials',
    totalPrice: 13900000,
    unitPrice: 2780,
    leadTimeDays: 14,
    qualityScore: 89.0,
    esgRating: 'Standard TIS 213-2552',
    weightedScore: 88.4,
    isRecommended: false,
  },
];

/**
 * RFQ Evaluation & Multi-Vendor Bid Comparison.
 * Implements Stitch Screen 98355a5a7db84d5eb81d8c8bca762481.
 */
export default function RfqEvaluationPage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const router = useRouter();
  const rfqId = params?.id as string;

  const [bids] = useState(SAMPLE_BIDS);
  const [awardedVendor, setAwardedVendor] = useState<string | null>(null);
  const [awardSuccess, setAwardSuccess] = useState<string | null>(null);

  const handleAwardPO = (bid: VendorBid) => {
    setAwardedVendor(bid.vendorId);
    setAwardSuccess(
      `Quotation from ${bid.vendorName} awarded! Purchase Order draft PO-2026-${rfqId || '9912'} generated for ${formatMoney(locale, bid.totalPrice.toString(), 'THB')}.`,
    );
    setTimeout(() => {
      router.push('/procurement/orders');
    }, 2500);
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/procurement/rfqs"
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              {t('common.back')}
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-white">
              RFQ Evaluation: #{rfqId || 'RFQ-2026-0491'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/70 text-cyan-400 border border-cyan-800/40">
              Evaluation in Progress
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ready-Mix Concrete Grade C35/45 & Precast Beam Elements • 5,000 cu.m.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded bg-[#1E293B] border border-slate-700/60 text-xs font-mono text-slate-300">
            Quotations Received: {bids.length}
          </span>
        </div>
      </div>

      {awardSuccess && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {awardSuccess}
        </div>
      )}

      {/* Evaluation Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 pb-2">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('procurement.budgetCeiling')}
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatMoney(locale, '15000000', 'THB')}
          </div>
          <span className="text-[11px] text-slate-400 mt-1">Target Unit: ฿3,000 / cu.m.</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('procurement.bestCommercialBid')}
          </span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {formatMoney(locale, bids[2].totalPrice.toString(), 'THB')}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium mt-1">
            -7.3% Below Budget Cap
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('procurement.aiRecommendation')}
          </span>
          <div className="text-xl font-bold text-cyan-400 mt-1 line-clamp-1">
            CPAC Modern Precast
          </div>
          <span className="text-[11px] text-slate-400 mt-1">Top Score (96.2/100 Composite)</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('procurement.scoringWeights')}
          </span>
          <div className="text-xs font-mono text-slate-300 mt-2 space-y-0.5">
            <div>Price: 40% • Lead Time: 25%</div>
            <div>Quality: 20% • ESG: 15%</div>
          </div>
        </div>
      </div>

      {/* Multi-Vendor Comparison Table */}
      <div className="p-6 flex-1 overflow-auto">
        <div className="rounded-xl border border-white/5 bg-[#0F172A] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5 flex justify-between items-center bg-[#111827]/40">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500 text-[18px]">balance</span>
              {t('procurement.comparativeEvaluationMatrix')}
            </h3>
          </div>

          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#102034]/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-semibold">
              <tr>
                <th className="py-3 px-4">{t('procurement.colVendor')}</th>
                <th className="py-3 px-4">{t('procurement.colTotalPrice')}</th>
                <th className="py-3 px-4">{t('procurement.colUnitPrice')}</th>
                <th className="py-3 px-4">{t('procurement.colLeadTime')}</th>
                <th className="py-3 px-4">{t('procurement.colQualityScore')}</th>
                <th className="py-3 px-4">{t('procurement.colEsgRating')}</th>
                <th className="py-3 px-4">{t('procurement.colWeightedScore')}</th>
                <th className="py-3 px-4 text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bids.map((b) => (
                <tr
                  key={b.vendorId}
                  className={`hover:bg-white/[0.02] transition-colors ${
                    b.isRecommended ? 'bg-cyan-950/20' : ''
                  }`}
                >
                  <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                    {b.vendorName}
                    {b.isRecommended && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-600 text-white">
                        AI Recommended
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-white">
                    {formatMoney(locale, b.totalPrice.toString(), 'THB')}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">฿{b.unitPrice} / cu.m.</td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">{b.leadTimeDays} days</td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-cyan-300 font-semibold">{b.qualityScore}%</span>
                  </td>
                  <td className="py-3.5 px-4 text-emerald-400 font-medium text-[11px]">
                    {b.esgRating}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-blue-950/70 text-blue-300 border border-blue-800/40 font-mono">
                      {b.weightedScore} / 100
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleAwardPO(b)}
                      disabled={awardedVendor !== null}
                      className={`px-3 py-1 rounded font-bold text-xs transition-all shadow-sm ${
                        awardedVendor === b.vendorId
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'
                      }`}
                    >
                      {awardedVendor === b.vendorId ? 'PO Created' : t('procurement.awardPo')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
