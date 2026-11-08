'use client';

import { useState } from 'react';
import { useI18n } from '../../../../i18n';
import { useCrmLeads, useCrmOpportunities } from '../../../../lib/api/queries';
import { formatMoney } from '../../../../lib/format';
import Link from 'next/link';

interface KanbanColumn {
  id: string;
  titleKey: string;
  dotColor: string;
}

interface PipelineCard {
  id: string;
  title: string;
  company: string | null;
  value: string | null;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'NEW', titleKey: 'crm.stageLead', dotColor: 'bg-cos-gray' },
  { id: 'QUALIFIED', titleKey: 'crm.stageQualified', dotColor: 'bg-cos-blue' },
  { id: 'PROPOSAL', titleKey: 'crm.stageProposal', dotColor: 'bg-cos-cyan' },
  { id: 'NEGOTIATION', titleKey: 'crm.stageNegotiation', dotColor: 'bg-amber-500' },
  { id: 'WON', titleKey: 'crm.stageWon', dotColor: 'bg-emerald-500' },
];

/**
 * CRM Pipeline & Tender Management — Kanban board derived from Stitch Screen 1c94f07098204e5fa7c930b8fc718a30.
 * Bridges live CRM leads/opportunities with the Stitch visual layout.
 */
export default function CrmPipelinePage() {
  const { t, locale } = useI18n();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showAiForecast, setShowAiForecast] = useState(false);

  const leadsQuery = useCrmLeads();
  const oppsQuery = useCrmOpportunities();

  const leads = leadsQuery.data ?? [];
  const opportunities = oppsQuery.data ?? [];

  // Group items by stage (Live data first, mapped to Kanban stages)
  const getItemsForStage = (stageId: string): PipelineCard[] => {
    if (stageId === 'NEW') {
      return leads
        .filter((l) => l.status === 'NEW' || !l.status)
        .map((l) => ({
          id: l.lead_id,
          title: l.contact_name ?? l.company ?? 'New Lead',
          company: l.company,
          value: null,
        }));
    }
    if (stageId === 'QUALIFIED') {
      return leads
        .filter((l) => l.status === 'QUALIFIED')
        .map((l) => ({
          id: l.lead_id,
          title: l.contact_name ?? l.company ?? 'Qualified Lead',
          company: l.company,
          value: null,
        }));
    }
    if (stageId === 'PROPOSAL') {
      return opportunities
        .filter((o) => o.status === 'OPEN' || !o.status)
        .map((o) => ({
          id: o.opportunity_id,
          title: o.title,
          company: null,
          value: o.value,
        }));
    }
    if (stageId === 'NEGOTIATION') {
      return opportunities
        .filter(
          (o) => (o.status as string) === 'NEGOTIATION' || (o.status as string) === 'UNDER_REVIEW',
        )
        .map((o) => ({
          id: o.opportunity_id,
          title: o.title,
          company: null,
          value: o.value,
        }));
    }
    if (stageId === 'WON') {
      return opportunities
        .filter((o) => o.status === 'WON')
        .map((o) => ({
          id: o.opportunity_id,
          title: o.title,
          company: null,
          value: o.value,
        }));
    }
    return [];
  };

  const totalValue = opportunities.reduce((sum, o) => {
    const val = parseFloat(o.value ?? '0');
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  return (
    <div className="flex flex-col h-full bg-[#020617] text-white">
      {/* Top Action Bar */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {t('crm.pipelineTitle')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
              {opportunities.length + leads.length} Active Deals
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t('crm.pipelineSubtitle')} • Total Pipeline:{' '}
            {formatMoney(locale, totalValue.toString(), 'THB')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-[#1E293B] p-1 rounded-lg border border-slate-700/50">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('crm.kanban')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('crm.listView')}
            </button>
          </div>

          {/* AI Forecast button */}
          <button
            type="button"
            onClick={() => setShowAiForecast(!showAiForecast)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/40 text-cyan-300 border border-cyan-700/40 hover:bg-cyan-900/30 transition-all shadow-[0_0_12px_rgba(6,182,212,0.15)]"
          >
            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
            {t('crm.aiForecast')}
          </button>

          <Link
            href="/crm/leads"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            {t('crm.createLead')}
          </Link>
        </div>
      </div>

      {/* AI Forecast Banner (Optional expand) */}
      {showAiForecast && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-cyan-950/20 border border-cyan-700/30 flex items-start justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-cyan-400 text-xl mt-0.5">insights</span>
            <div>
              <div className="text-sm font-semibold text-cyan-300">{t('crm.aiInsightsHeader')}</div>
              <p className="text-xs text-slate-300 mt-1">{t('crm.aiInsightsBody')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAiForecast(false)}
            className="text-slate-400 hover:text-white"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Kanban Board Container */}
      <div className="flex-1 overflow-x-auto p-6 flex gap-4 items-start">
        {COLUMNS.map((col) => {
          const items = getItemsForStage(col.id);
          return (
            <div
              key={col.id}
              className="w-[300px] shrink-0 flex flex-col max-h-[calc(100vh-180px)] rounded-xl bg-[#0F172A]/70 border border-slate-800/80 p-3"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                  <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider">
                    {t(col.titleKey)}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                  {items.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pt-3 pr-1">
                {items.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800/60 rounded-lg">
                    {t('crm.noDealsInStage')}
                  </div>
                ) : (
                  items.map((item, idx) => {
                    const title = item.title || `Deal #${idx + 1}`;
                    const val = item.value ? formatMoney(locale, item.value, 'THB') : '—';
                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-lg bg-[#111827] border border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer group shadow-sm"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                            {title}
                          </h4>
                        </div>
                        {item.company && (
                          <p className="text-xs text-slate-400 mt-0.5">{item.company}</p>
                        )}
                        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-medium">Value</span>
                          <span className="font-bold text-slate-200">{val}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Live Tenders Integration Panel (from Stitch drawing) */}
        <div className="w-[320px] shrink-0 flex flex-col rounded-xl bg-gradient-to-b from-[#0F172A] to-[#020617] border border-cyan-800/30 p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-400 text-base">gavel</span>
              <span className="font-bold text-xs text-cyan-300 uppercase tracking-wider">
                {t('crm.liveTenders')}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800/50">
              e-GP Sync
            </span>
          </div>

          <div className="space-y-3 pt-3">
            <div className="p-3 rounded-lg bg-[#0F172A] border border-slate-800">
              <div className="text-xs font-semibold text-slate-200">
                งานปรับปรุงทางหลวงพิเศษหมายเลข 7
              </div>
              <div className="text-[11px] text-slate-400 mt-1">กรมทางหลวง • ฿42.5M</div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-amber-400 font-medium">Bidding Closes in 4d</span>
                <span className="text-cyan-400 font-bold">ราคากลาง Match 98%</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0F172A] border border-slate-800">
              <div className="text-xs font-semibold text-slate-200">
                ก่อสร้างอาคารศูนย์นวัตกรรม มหาวิทยาลัย
              </div>
              <div className="text-[11px] text-slate-400 mt-1">สำนักงานบริหารการศึกษา • ฿78.0M</div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Preparation Phase</span>
                <span className="text-cyan-400 font-bold">Qualification: PASS</span>
              </div>
            </div>

            <Link
              href="/crm/opportunities"
              className="block w-full py-2 text-center text-xs font-semibold rounded bg-cyan-950/50 text-cyan-300 border border-cyan-700/30 hover:bg-cyan-900/30 transition-all"
            >
              {t('crm.viewAllTenders')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
