'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '../../../../../i18n';
import { fill } from '../../../../../i18n/fill';

const STATUS_KEY: Record<UnitStatus, string> = {
  leased: 'leasing.statusLeased',
  reserved: 'leasing.statusReserved',
  available: 'leasing.statusAvailable',
  sold: 'leasing.statusSold',
};

type UnitStatus = 'leased' | 'reserved' | 'available' | 'sold';

interface UnitInfo {
  id: string;
  floor: string;
  name: string;
  sizeSqft: number;
  type: string;
  status: UnitStatus;
  tenantName?: string;
  expiryDate?: string;
  annualRent?: string;
}

const FLOOR_CONFIG = [
  { name: 'PH', floorNum: 12, unitCount: 4 },
  { name: '11F', floorNum: 11, unitCount: 8 },
  { name: '10F', floorNum: 10, unitCount: 8 },
  { name: '09F', floorNum: 9, unitCount: 10 },
  { name: '08F', floorNum: 8, unitCount: 10 },
  { name: '07F', floorNum: 7, unitCount: 10 },
  { name: '06F', floorNum: 6, unitCount: 12 },
  { name: '05F', floorNum: 5, unitCount: 12 },
  { name: '04F', floorNum: 4, unitCount: 12 },
  { name: '03F', floorNum: 3, unitCount: 12 },
  { name: '02F', floorNum: 2, unitCount: 14 },
  { name: 'GF', floorNum: 1, unitCount: 6 },
];

/**
 * Property Detail & Multi-Floor Stacking Plan.
 * Implements Stitch Screen bd0c4095abcc4a46a231ba97beb9adcf.
 */
export default function PropertyDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const propertyId = (params?.id as string) || 'vanguard-tower';

  const [selectedUnit, setSelectedUnit] = useState<UnitInfo | null>({
    id: '10-4',
    floor: '10F',
    name: 'Unit 10-4',
    sizeSqft: 4250,
    type: 'Commercial Office Space',
    status: 'leased',
    tenantName: 'Lumina Tech Group (APAC)',
    expiryDate: 'Dec 2026',
    annualRent: '฿6,850,000 / Yr',
  });

  const getUnitStatus = (floorNum: number, unitIdx: number): UnitStatus => {
    const key = floorNum * 10 + unitIdx;
    if (key % 7 === 0) return 'sold';
    if (key % 5 === 0) return 'reserved';
    if (key % 3 === 0) return 'available';
    return 'leased';
  };

  const handleSelectUnit = (floorName: string, floorNum: number, idx: number) => {
    const st = getUnitStatus(floorNum, idx);
    setSelectedUnit({
      id: `${floorName}-${idx + 1}`,
      floor: floorName,
      name: `Unit ${floorName}-${idx + 1}`,
      sizeSqft: 2500 + (idx % 4) * 600,
      type: floorNum >= 10 ? 'Executive Office Suite' : 'Grade-A Commercial Space',
      status: st,
      tenantName:
        st === 'leased'
          ? idx % 2 === 0
            ? 'Lumina Tech Group (APAC)'
            : 'Starlight Global Logistics'
          : undefined,
      expiryDate: st === 'leased' ? 'Dec 2026' : undefined,
      annualRent: st === 'leased' ? '฿6,850,000 / Yr' : undefined,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <nav className="flex items-center gap-2 text-xs uppercase text-slate-400 mb-1">
            <Link href="/leasing" className="hover:text-white transition-colors">
              {t('leasing.portfolioOverview')}
            </Link>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-blue-400 font-semibold">Vanguard Tower</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-500">apartment</span>
            {fill(t('leasing.property.stackingPlanTitle'), { property: 'Vanguard Tower' })}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/leasing"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            {t('common.back')}
          </Link>
          <Link
            href={`/leasing/wizard?property=${propertyId}`}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            {t('leasing.addLease')}
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Bento Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {t('leasing.totalOccupancy')}
            </p>
            <p className="text-2xl font-extrabold text-white mt-1">84.2%</p>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: '84.2%' }} />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {t('leasing.colWale')}
            </p>
            <p className="text-2xl font-extrabold text-white mt-1">
              {fill(t('leasing.portfolio.waleValue'), { years: 6.2 })}
            </p>
            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>{' '}
              {fill(t('leasing.property.yoyChange'), { change: '+0.4' })}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {t('leasing.unitsAvailable')}
            </p>
            <p className="text-2xl font-extrabold text-white mt-1">
              {fill(t('leasing.property.unitsCount'), { count: 12 })}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {fill(t('leasing.property.fromPerYear'), { amount: '฿1,500,000' })}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {t('leasing.syncStatus')}
            </p>
            <p className="text-2xl font-extrabold text-amber-400 mt-1">
              {t('leasing.property.liveSync')}
            </p>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {t('leasing.property.bimConnected')}
            </p>
          </div>
        </div>

        {/* Stacking Plan Visualization + Detail Panel */}
        <div className="bg-[#0F172A] rounded-xl border border-white/5 overflow-hidden flex flex-col lg:flex-row min-h-[580px]">
          {/* Main Visualizer */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[18px]">domain</span>
                {t('leasing.unitStackingPlan')}
              </h3>

              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                  <span className="text-slate-300">{t('leasing.statusLeased')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-amber-500 rounded-sm" />
                  <span className="text-slate-300">{t('leasing.statusReserved')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-white rounded-sm" />
                  <span className="text-slate-300">{t('leasing.statusAvailable')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-slate-600 rounded-sm" />
                  <span className="text-slate-300">{t('leasing.statusSold')}</span>
                </div>
              </div>
            </div>

            {/* Building Elevation Grid */}
            <div className="space-y-2.5">
              {FLOOR_CONFIG.map((floor) => (
                <div key={floor.name} className="flex items-center gap-3">
                  <div className="w-12 text-right">
                    <span className="text-xs font-mono font-bold text-slate-400">{floor.name}</span>
                  </div>
                  <div className="flex-1 grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                    {Array.from({ length: floor.unitCount }).map((_, i) => {
                      const st = getUnitStatus(floor.floorNum, i);
                      const unitKey = `${floor.name}-${i + 1}`;
                      const isSelected = selectedUnit?.id === unitKey;

                      return (
                        <button
                          key={unitKey}
                          type="button"
                          onClick={() => handleSelectUnit(floor.name, floor.floorNum, i)}
                          className={`h-9 rounded-sm flex items-center justify-center text-[10px] font-bold font-mono transition-all transform hover:scale-105 active:scale-95 ${
                            st === 'leased'
                              ? 'bg-emerald-600/90 text-white hover:bg-emerald-500'
                              : st === 'reserved'
                                ? 'bg-amber-500/90 text-black hover:bg-amber-400'
                                : st === 'available'
                                  ? 'bg-white text-slate-900 hover:bg-slate-200'
                                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          } ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-[#0F172A]' : ''}`}
                        >
                          {floor.name}.{i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Unit Detail Sidebar */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/5 bg-[#0B1020]/90 p-6 flex flex-col justify-between">
            {selectedUnit ? (
              <div className="space-y-6">
                <div>
                  <span className="text-[11px] font-mono text-cyan-400 uppercase font-semibold">
                    {fill(t('leasing.property.floorLabel'), { floor: selectedUnit.floor })}
                  </span>
                  <h4 className="text-xl font-bold text-white mt-0.5">
                    {fill(t('leasing.property.unitName'), { unit: selectedUnit.id })}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">{selectedUnit.type}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/60 border border-white/5">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {t('leasing.property.size')}
                    </span>
                    <p className="font-mono text-sm font-bold text-white mt-0.5">
                      {fill(t('leasing.property.sizeValue'), {
                        size: selectedUnit.sizeSqft.toLocaleString(),
                      })}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {t('leasing.property.status')}
                    </span>
                    <p className="font-mono text-xs font-bold text-emerald-400 uppercase mt-0.5">
                      {t(STATUS_KEY[selectedUnit.status])}
                    </p>
                  </div>
                </div>

                {selectedUnit.tenantName && (
                  <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40">
                    <p className="text-[11px] font-bold text-blue-300 uppercase tracking-wider mb-2">
                      {t('leasing.property.activeLease')}
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-600/30 flex items-center justify-center text-blue-400">
                        <span className="material-symbols-outlined text-[18px]">business</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{selectedUnit.tenantName}</p>
                        <p className="text-[11px] text-slate-400">
                          {fill(t('leasing.property.expires'), {
                            date: selectedUnit.expiryDate ?? '',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                    {t('leasing.property.historyTitle')}
                  </p>
                  <div className="space-y-3 relative pl-4 border-l border-white/10 text-xs">
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <p className="font-bold text-white">
                        {fill(t('leasing.property.historyRenewed'), { years: 3 })}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {fill(t('leasing.property.historyEntry'), {
                          date: 'Aug 2023',
                          amount: '฿6,850,000',
                        })}
                      </p>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-500" />
                      <p className="font-bold text-white">{t('leasing.property.historyInitial')}</p>
                      <p className="text-[11px] text-slate-400">
                        {fill(t('leasing.property.historyEntry'), {
                          date: 'Jan 2020',
                          amount: '฿6,200,000',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/leasing/wizard?property=${propertyId}&unit=${selectedUnit.id}`}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">draw</span>
                  {t('leasing.createOrRenewLease')}
                </Link>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2 text-slate-600">
                  touch_app
                </span>
                <p className="text-xs">{t('leasing.property.selectPrompt')}</p>
              </div>
            )}
          </div>
        </div>

        {/* AI Insight Box */}
        <div className="p-4 rounded-xl bg-[#0F172A] border-l-4 border-cyan-400 border border-white/5 flex items-center gap-3">
          <span className="material-symbols-outlined text-cyan-400 text-xl">auto_awesome</span>
          <div>
            <p className="text-xs font-bold text-cyan-400">
              {t('leasing.property.aiInsightTitle')}
            </p>
            <p className="text-xs text-slate-300 mt-0.5">
              {fill(t('leasing.property.aiInsight'), {
                floors: '9 & 10',
                rate: '15%',
                unit: '10.2',
                change: '+4%',
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
