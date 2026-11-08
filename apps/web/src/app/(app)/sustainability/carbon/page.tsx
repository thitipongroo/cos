'use client';

import { useState } from 'react';
import { useI18n } from '../../../../i18n';

interface CarbonProject {
  id: string;
  name: string;
  vintage: string;
  pricePerTonUsd: number;
  availableTons: number;
  trustScore: number;
  status: 'Verified' | 'Auditing' | 'AI Recommended';
  description: string;
  registry: string;
}

const SAMPLE_PROJECTS: CarbonProject[] = [
  {
    id: 'proj-1',
    name: 'Green Cement & Hydrogen Kiln Conversion',
    vintage: '2025',
    pricePerTonUsd: 42.5,
    availableTons: 2400,
    trustScore: 98.2,
    status: 'Verified',
    description:
      'Upgrading traditional clinker kilns to green hydrogen-based thermal processes across 4 manufacturing sites.',
    registry: 'Gold Standard',
  },
  {
    id: 'proj-2',
    name: 'Solar Pavement & Micro-Grid Logistics Array',
    vintage: '2024',
    pricePerTonUsd: 31.15,
    availableTons: 14800,
    trustScore: 84.5,
    status: 'Auditing',
    description:
      'Photovoltaic integration into commercial logistics center parking infrastructures and heavy vehicle charging.',
    registry: 'Verra VCS',
  },
  {
    id: 'proj-3',
    name: 'Bio-Structural Engineered Timber Sequestration',
    vintage: '2026',
    pricePerTonUsd: 38.9,
    availableTons: 8900,
    trustScore: 99.4,
    status: 'AI Recommended',
    description:
      'High-efficiency carbon sequestration through mass timber production engineered specifically for high-rise urban construction.',
    registry: 'Verra / Puro.earth',
  },
];

/**
 * Carbon Credit Marketplace & Sustainability ESG Hub.
 * Implements Stitch Screen 476ac399aeed4675afdef9aa6b17a173.
 */
export default function CarbonMarketplacePage() {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'marketplace' | 'wallet' | 'analytics'>('marketplace');
  const [tradeQuantity, setTradeQuantity] = useState('500');
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecuteTrade = () => {
    setIsExecuting(true);
    setTimeout(() => {
      setIsExecuting(false);
      setTradeSuccess(
        `Successfully executed order for ${tradeQuantity} tCO2e of certified Carbon Offsets! Transaction settled on Verra registry ledger.`,
      );
      setTimeout(() => {
        setTradeSuccess(null);
      }, 5000);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400">
                energy_savings_leaf
              </span>
              {t('carbon.marketplaceTitle')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800/40 font-mono">
              ESG Level 4 Certified
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Verified carbon removal credits, embodied carbon offsets, and registry-backed green
            certification
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-[#102034] p-1 rounded-lg border border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'marketplace'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Marketplace
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'wallet'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My Carbon Wallet
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ESG Analytics
            </button>
          </div>
        </div>
      </div>

      {tradeSuccess && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {tradeSuccess}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Bento Grid: Portfolio + Pricing Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Portfolio Overview */}
          <div className="lg:col-span-4 p-5 rounded-xl bg-[#0F172A] border border-white/5 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Carbon Offset Portfolio
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white font-mono">12,450</span>
                <span className="text-sm font-bold text-slate-400">tCO2e</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Active Credits</span>
                <p className="text-lg font-bold text-emerald-400 font-mono">8,200 t</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase">Pending Registry Sync</span>
                <p className="text-lg font-bold text-amber-400 font-mono">4,250 t</p>
              </div>
            </div>
          </div>

          {/* Pricing Trend */}
          <div className="lg:col-span-8 p-5 rounded-xl bg-[#0F172A] border border-white/5 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  COS Carbon Index Pricing (6M)
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-cyan-400 font-mono">$34.12</span>
                  <span className="text-xs font-bold text-emerald-400 font-mono">+12.4% (YTD)</span>
                </div>
              </div>
              <div className="flex gap-1 text-[11px] bg-slate-900 p-1 rounded border border-white/5">
                <span className="px-2 py-0.5 rounded text-slate-400">1M</span>
                <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold">6M</span>
                <span className="px-2 py-0.5 rounded text-slate-400">1Y</span>
              </div>
            </div>

            {/* Custom Bar Graph */}
            <div className="h-28 flex items-end justify-between gap-2 mt-4 px-2">
              {[
                { m: 'May', h: '40%' },
                { m: 'Jun', h: '55%' },
                { m: 'Jul', h: '48%' },
                { m: 'Aug', h: '70%' },
                { m: 'Sep', h: '65%' },
                { m: 'Oct', h: '88%' },
                { m: 'Nov', h: '94%' },
              ].map((item) => (
                <div key={item.m} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full bg-slate-800 rounded-t h-20 flex items-end">
                    <div
                      className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t"
                      style={{ height: item.h }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{item.m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Marketplace Grid: Trade Sidebar + Project Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Trade Assistant */}
          <div className="lg:col-span-1 space-y-4">
            <div className="p-5 rounded-xl bg-[#0F172A] border border-cyan-500/40 border-l-4 border-l-cyan-400 space-y-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-400">auto_awesome</span>
                <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
                  Trade Assistant
                </h3>
              </div>
              <p className="text-xs text-slate-300">
                Market analysis indicates high demand for timber sequestration credits in Q4.
              </p>

              <div className="space-y-3 pt-2">
                <div>
                  <span className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Action Type
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setTradeAction('buy')}
                      className={`py-1 rounded text-xs font-bold transition-colors ${
                        tradeAction === 'buy' ? 'bg-blue-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setTradeAction('sell')}
                      className={`py-1 rounded text-xs font-bold transition-colors ${
                        tradeAction === 'sell' ? 'bg-blue-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      Sell
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="trade-quantity-input"
                    className="block text-[11px] font-bold text-slate-400 uppercase mb-1"
                  >
                    Quantity (tCO2e)
                  </label>
                  <input
                    id="trade-quantity-input"
                    type="number"
                    value={tradeQuantity}
                    onChange={(e) => setTradeQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleExecuteTrade}
                  disabled={isExecuting}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                  {isExecuting ? 'Processing...' : 'Execute Trade'}
                </button>
              </div>
            </div>

            {/* Impact Partner Badge */}
            <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5 text-center space-y-2">
              <span className="material-symbols-outlined text-4xl text-cyan-400">verified</span>
              <p className="text-sm font-bold text-white">Level 4 Partner</p>
              <p className="text-[11px] text-slate-400">
                Achieved via 24% reduction in site emissions across Tier 1 projects.
              </p>
            </div>
          </div>

          {/* Right: Project Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {SAMPLE_PROJECTS.map((proj) => (
              <div
                key={proj.id}
                className="p-5 rounded-xl bg-[#0F172A] border border-white/5 hover:border-cyan-500/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        proj.status === 'Verified'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : proj.status === 'Auditing'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                      }`}
                    >
                      {proj.status}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      Vintage: {proj.vintage}
                    </span>
                  </div>

                  <h4 className="text-base font-bold text-white mt-1">{proj.name}</h4>
                  <p className="text-xs text-slate-300 mt-2 line-clamp-2 leading-relaxed">
                    {proj.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase">Unit Price</span>
                      <p className="font-mono font-bold text-cyan-400 text-sm">
                        ${proj.pricePerTonUsd.toFixed(2)} / tCO2e
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase">Available Volume</span>
                      <p className="font-mono font-bold text-white text-sm">
                        {proj.availableTons.toLocaleString()} t
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTradeQuantity(Math.min(proj.availableTons, 1000).toString());
                      handleExecuteTrade();
                    }}
                    className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span>
                    Add to Offset Portfolio
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
