'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../../i18n';

interface PropertyAsset {
  id: string;
  name: string;
  type: string;
  icon: string;
  location: string;
  occupancy: number;
  revStatus: 'Target' | 'Variance' | 'Critical';
  waleYears: number;
  yieldPercent: number;
}

const SAMPLE_ASSETS: PropertyAsset[] = [
  {
    id: 'vanguard-tower',
    name: 'Vanguard Tower',
    type: 'Commercial Office',
    icon: 'apartment',
    location: 'London, UK',
    occupancy: 84.2,
    revStatus: 'Target',
    waleYears: 6.2,
    yieldPercent: 6.8,
  },
  {
    id: 'logipark-central',
    name: 'LogiPark Central',
    type: 'Logistics Hub',
    icon: 'warehouse',
    location: 'Chicago, IL',
    occupancy: 100.0,
    revStatus: 'Target',
    waleYears: 4.8,
    yieldPercent: 6.2,
  },
  {
    id: 'vanguard-tech-plant',
    name: 'Vanguard Tech-Plant',
    type: 'Light Industrial',
    icon: 'factory',
    location: 'Austin, TX',
    occupancy: 88.5,
    revStatus: 'Variance',
    waleYears: 3.2,
    yieldPercent: 5.9,
  },
  {
    id: 'arctic-cold-store',
    name: 'Arctic Cold Store',
    type: 'Cold Storage',
    icon: 'ac_unit',
    location: 'Seattle, WA',
    occupancy: 96.0,
    revStatus: 'Target',
    waleYears: 7.4,
    yieldPercent: 7.1,
  },
  {
    id: 'midwest-distribution',
    name: 'Midwest Distribution',
    type: 'Last Mile Logistics',
    icon: 'conveyor_belt',
    location: 'Columbus, OH',
    occupancy: 72.0,
    revStatus: 'Critical',
    waleYears: 2.1,
    yieldPercent: 4.5,
  },
];

/**
 * Real Estate & Property Leasing V3 - Portfolio Dashboard.
 * Implements Stitch Screen c10f4a8c3fcb47198320b2d396883029.
 */
export default function PropertyLeasingPortfolioPage() {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<'live' | 'historical' | 'projected'>('live');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAssets = SAMPLE_ASSETS.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.type.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header Bar */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500">apartment</span>
              {t('leasing.portfolioOverview')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/70 text-blue-400 border border-blue-800/40 font-mono">
              Industrial V3
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('leasing.portfolioSubtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-[#102034] p-1 rounded-lg border border-white/5">
            <button
              type="button"
              onClick={() => setViewMode('live')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'live' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('leasing.viewLive')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('historical')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'historical'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('leasing.viewHistorical')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('projected')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'projected'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('leasing.viewProjected')}
            </button>
          </div>

          <Link
            href="/leasing/wizard"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add_task</span>
            {t('leasing.newLeaseWizard')}
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Occupancy KPI */}
          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {t('leasing.portfolioOccupancy')}
              </span>
              <span className="material-symbols-outlined text-emerald-400 text-sm">
                trending_up
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">94.2%</span>
              <span className="text-xs font-bold text-emerald-400">+1.4%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Target: 92.0% • 42 Assets</p>
          </div>

          {/* NOI vs Budget KPI */}
          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5 border-l-4 border-l-cyan-500 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                {t('leasing.noiVsBudget')}
              </span>
              <span className="material-symbols-outlined text-cyan-400 text-sm">auto_awesome</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">฿434.0M</span>
              <span className="text-xs font-bold text-cyan-400">103.1%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Variance: +฿13.0M vs Q3 Benchmark</p>
          </div>

          {/* Delinquency KPI */}
          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {t('leasing.delinquencyRate')}
              </span>
              <span className="material-symbols-outlined text-amber-400 text-sm">warning</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">2.8%</span>
              <span className="text-xs font-bold text-emerald-400">-0.2%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Critical Alert Threshold: 3.5%</p>
          </div>
        </div>

        {/* Visualizations: Expiry Profile & Sector Exposure */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Expiry Profile Chart */}
          <div className="xl:col-span-2 p-5 rounded-xl bg-[#0F172A] border border-white/5">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400 text-[18px]">
                    event_repeat
                  </span>
                  {t('leasing.leaseExpiryProfile')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lease expiries scheduled by upcoming quarters
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> SQM
                  Expiring
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Active
                  Units
                </span>
              </div>
            </div>

            {/* Custom Bar Graph */}
            <div className="h-44 flex items-end justify-between gap-3 px-2 pt-4">
              {[
                { quarter: 'Q4 24', height: '40%', val: '12k m²' },
                { quarter: 'Q1 25', height: '65%', val: '24k m²' },
                { quarter: 'Q2 25', height: '52%', val: '18k m²' },
                { quarter: 'Q3 25', height: '28%', val: '9k m²' },
                { quarter: 'Q4 25', height: '78%', val: '31k m²' },
                { quarter: 'Q1 26', height: '90%', val: '38k m²' },
                { quarter: 'Q2 26', height: '45%', val: '15k m²' },
                { quarter: 'Q3 26', height: '35%', val: '11k m²' },
              ].map((item) => (
                <div key={item.quarter} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.val}
                  </span>
                  <div className="w-full bg-blue-950/40 rounded-t h-32 flex items-end">
                    <div
                      className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t transition-all group-hover:brightness-125"
                      style={{ height: item.height }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{item.quarter}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sector Exposure */}
          <div className="p-5 rounded-xl bg-[#0F172A] border border-white/5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-cyan-400 text-[18px]">
                  pie_chart
                </span>
                {t('leasing.sectorExposure')}
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Logistics / Last-Mile</span>
                    <span className="font-mono text-cyan-400">64%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '64%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Manufacturing & Tech-Plants</span>
                    <span className="font-mono text-cyan-400">22%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: '22%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Cold Storage Facilities</span>
                    <span className="font-mono text-cyan-400">14%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: '14%' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/30 flex gap-2.5 items-start">
              <span className="material-symbols-outlined text-cyan-400 text-[18px] shrink-0">
                info
              </span>
              <p className="text-[11px] text-cyan-200/90 leading-relaxed">
                Logistics exposure is up +4.2% YoY following the acquisition of the Northport Hub.
              </p>
            </div>
          </div>
        </div>

        {/* Property Performance Table */}
        <div className="rounded-xl border border-white/5 bg-[#0F172A] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex flex-wrap justify-between items-center gap-3 bg-[#111827]/40">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[18px]">
                  real_estate_agent
                </span>
                {t('leasing.propertyPerformance')}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                High-density asset metrics and lease terms
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder={t('leasing.searchAssets')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-[#1E293B] border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#102034]/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                <tr>
                  <th className="py-3 px-5">{t('leasing.colAssetName')}</th>
                  <th className="py-3 px-5">{t('leasing.colLocation')}</th>
                  <th className="py-3 px-5">{t('leasing.colOccupancy')}</th>
                  <th className="py-3 px-5">{t('leasing.colRevStatus')}</th>
                  <th className="py-3 px-5">{t('leasing.colWale')}</th>
                  <th className="py-3 px-5 text-right">{t('leasing.colYield')}</th>
                  <th className="py-3 px-5 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-5">
                      <Link
                        href={`/leasing/properties/${asset.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-950/60 border border-blue-800/40 flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <span className="material-symbols-outlined text-[18px]">
                            {asset.icon}
                          </span>
                        </div>
                        <div>
                          <div className="font-bold text-white group-hover:text-blue-400 transition-colors">
                            {asset.name}
                          </div>
                          <div className="text-[11px] text-slate-400">{asset.type}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-5 text-slate-300">{asset.location}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{asset.occupancy}%</span>
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              asset.occupancy >= 90
                                ? 'bg-emerald-500'
                                : asset.occupancy >= 80
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${asset.occupancy}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          asset.revStatus === 'Target'
                            ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/40'
                            : asset.revStatus === 'Variance'
                              ? 'bg-amber-950/70 text-amber-400 border border-amber-800/40'
                              : 'bg-rose-950/70 text-rose-400 border border-rose-800/40'
                        }`}
                      >
                        {asset.revStatus}
                      </span>
                    </td>
                    <td className="py-3 px-5 font-mono text-slate-300">{asset.waleYears} Yrs</td>
                    <td className="py-3 px-5 text-right font-mono font-bold text-cyan-400">
                      {asset.yieldPercent}%
                    </td>
                    <td className="py-3 px-5 text-right">
                      <Link
                        href={`/leasing/properties/${asset.id}`}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        {t('leasing.viewStackingPlan')}
                        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
