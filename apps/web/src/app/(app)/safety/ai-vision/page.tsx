'use client';

import { useState } from 'react';
import { useI18n } from '../../../../i18n';
import { fill } from '../../../../i18n/fill';

interface CameraFeed {
  id: string;
  name: string;
  zone: string;
  status: 'critical' | 'compliant' | 'warning';
  activeAlert?: string;
  confidence?: number;
  previewColor: string;
}

interface SafetyAlert {
  id: string;
  time: string;
  title: string;
  zone: string;
  confidence: number;
  severity: 'high' | 'medium' | 'low';
  details: string;
  acknowledged: boolean;
}

const INITIAL_FEEDS: CameraFeed[] = [
  {
    id: 'cam-04',
    name: 'CAM_04_FOUNDATION',
    zone: 'Zone 4 • Sub-grade',
    status: 'critical',
    activeAlert: 'NO HARD HAT DETECTED',
    confidence: 98,
    previewColor: '#991B1B',
  },
  {
    id: 'cam-12',
    name: 'CAM_12_STAGING',
    zone: 'Zone 12 • Crane Staging',
    status: 'compliant',
    previewColor: '#0E7490',
  },
  {
    id: 'cam-01',
    name: 'CAM_01_PERIMETER',
    zone: 'West Perimeter Fence',
    status: 'warning',
    activeAlert: 'UNAUTHORIZED ENTRY DETECTED',
    confidence: 74,
    previewColor: '#B45309',
  },
  {
    id: 'cam-09',
    name: 'CAM_09_SOUTH_GATE',
    zone: 'Main Gate Access',
    status: 'compliant',
    previewColor: '#065F46',
  },
  {
    id: 'cam-07',
    name: 'CAM_07_SCAFFOLD_B',
    zone: 'Tower Scaffold North',
    status: 'critical',
    activeAlert: 'HARNESS UNCLIPPED (HIGH RISK)',
    confidence: 92,
    previewColor: '#991B1B',
  },
];

const INITIAL_ALERTS: SafetyAlert[] = [
  {
    id: 'alt-1',
    time: '12:44:02',
    title: 'No Hard Hat Detected',
    zone: 'Zone 4 (Foundation)',
    confidence: 98,
    severity: 'high',
    details:
      'Immediate attention required. Person detected in concrete pour zone without head protection.',
    acknowledged: false,
  },
  {
    id: 'alt-2',
    time: '12:41:15',
    title: 'Unauthorized Zone Entry',
    zone: 'Perimeter West',
    confidence: 74,
    severity: 'medium',
    details: 'Object type: Human. Crossed active excavation laser boundary.',
    acknowledged: false,
  },
  {
    id: 'alt-3',
    time: '12:30:55',
    title: 'Optimization Advisory',
    zone: 'Staging Area B',
    confidence: 88,
    severity: 'low',
    details:
      'High worker density in Staging Area B may lead to safety bottlenecks. Recommend staggered breaks.',
    acknowledged: false,
  },
];

/**
 * Advanced Safety AI Vision & Dispatch Center.
 * Implements Stitch Screen 3281743e0d4f4609bef10b4ad6aeaf38.
 */
export default function SafetyAiVisionPage() {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<SafetyAlert[]>(INITIAL_ALERTS);
  const [siteScore] = useState(80);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState<string | null>(null);

  const handleAcknowledge = (alertId: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
  };

  const handleDispatchOfficer = () => {
    setDispatchFeedback(
      fill(t('safety.aiVision.dispatched'), { zones: 'Zone 4 & Tower Scaffold North' }),
    );
    setTimeout(() => {
      setDispatchFeedback(null);
    }, 4000);
  };

  const handleBroadcastAlert = () => {
    setIsBroadcasting(true);
    setTimeout(() => {
      setIsBroadcasting(false);
    }, 3000);
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-400">videocam</span>
              {t('safety.aiVisionTitle')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/70 text-cyan-400 border border-cyan-800/40 font-mono animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              {t('safety.aiVision.liveMonitoring')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('safety.aiVision.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDispatchOfficer}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-600/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">record_voice_over</span>
            {t('safety.dispatchOfficer')}
          </button>

          <button
            type="button"
            onClick={handleBroadcastAlert}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all ${
              isBroadcasting
                ? 'bg-rose-600 text-white animate-bounce'
                : 'bg-rose-700 hover:bg-rose-600 text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">volume_up</span>
            {isBroadcasting ? t('safety.aiVision.broadcasting') : t('safety.broadcastAlert')}
          </button>
        </div>
      </div>

      {dispatchFeedback && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-cyan-950/90 border border-cyan-500/50 text-cyan-200 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">campaign</span>
          {dispatchFeedback}
        </div>
      )}

      {/* Main Split: Camera Grid + Compliance Analytics Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Camera Video Grid */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {INITIAL_FEEDS.map((feed) => (
              <div
                key={feed.id}
                className={`relative rounded-xl overflow-hidden border bg-[#0B1020] h-52 flex flex-col justify-between p-3.5 transition-all group ${
                  feed.status === 'critical'
                    ? 'border-rose-600/80 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                    : feed.status === 'warning'
                      ? 'border-amber-500/80'
                      : 'border-white/10 hover:border-cyan-500/50'
                }`}
                style={{
                  background: `linear-gradient(135deg, rgba(15, 23, 42, 0.95), ${feed.previewColor}15)`,
                }}
              >
                {/* Header HUD */}
                <div className="flex justify-between items-center z-10">
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        feed.status === 'critical'
                          ? 'bg-rose-500 animate-ping'
                          : feed.status === 'warning'
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                      }`}
                    />
                    <span className="text-[11px] font-mono font-bold text-white">{feed.name}</span>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">{feed.zone}</span>
                </div>

                {/* AI Bounding Box Overlay Simulation */}
                {feed.activeAlert ? (
                  <div className="my-auto self-center p-3 rounded-lg border-2 border-dashed border-rose-500 bg-rose-950/40 text-center animate-pulse">
                    <div className="text-[11px] font-extrabold text-rose-300 flex items-center gap-1 justify-center">
                      <span className="material-symbols-outlined text-[16px]">warning</span>
                      {feed.activeAlert}
                    </div>
                    <span className="text-[10px] font-mono text-rose-400">
                      {fill(t('safety.aiVision.confidence'), { value: feed.confidence ?? '' })}
                    </span>
                  </div>
                ) : (
                  <div className="my-auto self-center text-center opacity-60">
                    <span className="material-symbols-outlined text-4xl text-cyan-400/40">
                      verified_user
                    </span>
                    <p className="text-[10px] font-mono text-cyan-300">
                      {fill(t('safety.aiVision.ppeCompliant'), { percent: '100%' })}
                    </p>
                  </div>
                )}

                {/* Footer HUD */}
                <div className="flex justify-between items-center z-10 text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-1 rounded">
                  <span>FPS: 30 • 1080p</span>
                  <span>RTSP • Edge AI</span>
                </div>
              </div>
            ))}

            {/* Connect New Feed Card */}
            <button
              type="button"
              className="rounded-xl border-2 border-dashed border-white/10 hover:border-cyan-500/50 hover:bg-cyan-950/10 p-6 flex flex-col items-center justify-center text-slate-400 hover:text-cyan-300 transition-colors h-52 group"
            >
              <span className="material-symbols-outlined text-3xl mb-2 group-hover:scale-110 transition-transform">
                add_circle
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">
                {t('safety.connectNewCamera')}
              </span>
              <span className="text-[11px] text-slate-500 mt-1">
                {t('safety.aiVision.streamTypes')}
              </span>
            </button>
          </div>

          {/* Control & Latency Bar */}
          <div className="p-4 rounded-xl bg-[#0F172A] border border-white/5 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold">
                  {t('safety.aiVision.activeCameras')}
                </span>
                <p className="font-mono font-bold text-white text-base">
                  {fill(t('safety.aiVision.feedsCount'), { active: 14, total: 20 })}
                </p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold">
                  {t('safety.aiVision.networkLatency')}
                </span>
                <p className="font-mono font-bold text-emerald-400 text-base">42 ms</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold">
                  {t('safety.aiVision.inferenceSpeed')}
                </span>
                <p className="font-mono font-bold text-cyan-400 text-base">
                  {fill(t('safety.aiVision.msPerFrame'), { value: '18.4' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">
                {fill(t('safety.aiVision.edgeCluster'), { node: 'Node-SG4-A' })}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Compliance Analytics Sidebar */}
        <div className="w-96 border-l border-white/5 bg-[#0B1020] flex flex-col overflow-y-auto">
          {/* Site Integrity Index */}
          <div className="p-5 border-b border-white/5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {t('safety.siteIntegrityIndex')}
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-5xl font-extrabold text-cyan-400 font-mono">{siteScore}</span>
              <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">trending_down</span>
                {fill(t('safety.aiVision.vs24h'), { change: '-4.2%' })}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
              <div className="bg-cyan-400 h-full rounded-full" style={{ width: `${siteScore}%` }} />
            </div>
          </div>

          {/* Multi-Feed PPE Analysis */}
          <div className="p-5 border-b border-white/5 space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
              {t('safety.aiVision.ppeTitle')}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] text-slate-400 uppercase">
                  {t('safety.aiVision.hardHats')}
                </span>
                <p className="font-mono text-base font-bold text-cyan-400">94%</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] text-slate-400 uppercase">
                  {t('safety.aiVision.hiVis')}
                </span>
                <p className="font-mono text-base font-bold text-cyan-400">88%</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] text-slate-400 uppercase">
                  {t('safety.aiVision.safetyBoots')}
                </span>
                <p className="font-mono text-base font-bold text-emerald-400">99%</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] text-slate-400 uppercase">
                  {t('safety.aiVision.eyeProtection')}
                </span>
                <p className="font-mono text-base font-bold text-amber-400">72%</p>
              </div>
            </div>
          </div>

          {/* Smart Alert Feed */}
          <div className="p-5 flex-1 space-y-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {t('safety.aiVision.alertFeed')}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800/40">
                {t('safety.aiVision.aiAdvisory')}
              </span>
            </div>

            <div className="space-y-3">
              {alerts.map((alt) => (
                <div
                  key={alt.id}
                  className={`p-3 rounded-lg border-l-4 text-xs transition-all ${
                    alt.acknowledged
                      ? 'bg-slate-900/40 border-l-slate-600 opacity-60'
                      : alt.severity === 'high'
                        ? 'bg-rose-950/20 border-l-rose-500 border border-white/5'
                        : alt.severity === 'medium'
                          ? 'bg-amber-950/20 border-l-amber-500 border border-white/5'
                          : 'bg-cyan-950/20 border-l-cyan-500 border border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-white">{alt.title}</span>
                    <span className="text-[10px] font-mono text-slate-400">{alt.time}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{alt.details}</p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">{alt.zone}</span>
                    {!alt.acknowledged && (
                      <button
                        type="button"
                        onClick={() => handleAcknowledge(alt.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold transition-colors"
                      >
                        {t('safety.acknowledge')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
