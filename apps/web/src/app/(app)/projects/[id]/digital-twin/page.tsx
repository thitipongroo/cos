'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '../../../../../i18n';

interface DivergenceCard {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'ai';
  actionStatus: string;
}

const SAMPLE_DIVERGENCES: DivergenceCard[] = [
  {
    id: 'div-1',
    code: 'DIV-882',
    title: 'Column C4 Misalignment',
    description: '12cm offset from structural BIM axial line.',
    severity: 'high',
    actionStatus: 'Action Required',
  },
  {
    id: 'div-2',
    code: 'DIV-901',
    title: 'HVAC Ducting Clearance',
    description: 'Ducting installed 50mm below design spec.',
    severity: 'medium',
    actionStatus: 'Review Pending',
  },
  {
    id: 'div-3',
    code: 'AI-004',
    title: 'Moisture Pattern Detected',
    description: 'Possible curing delay in Zone 4B slab.',
    severity: 'ai',
    actionStatus: 'Anomaly Detected',
  },
];

/**
 * Digital Twin & BIM Telemetry Mesh Viewer.
 * Implements Stitch Screen 7528023a9ccc433a95343981951da3c6.
 */
export default function DigitalTwinPage() {
  const { t } = useI18n();
  const params = useParams();
  const projectId = (params?.id as string) || 'alpha-london';

  const [activeDivergence, setActiveDivergence] = useState<string | null>(null);
  const [activeSensor, setActiveSensor] = useState<'hvac' | 'vib' | null>('hvac');
  const [zoomLevel, setZoomLevel] = useState(100);

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              {t('common.back')}
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500">view_in_ar</span>
              {t('digitalTwin.title')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/70 text-cyan-400 border border-cyan-800/40 font-mono">
              BIM 4D / IoT Telemetry
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time cyber-physical synchronization between field IoT sensors and As-Designed BIM
            geometry
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#102034] border border-white/5 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">Live Model Sync • 127/140 Sensors</span>
          </div>
        </div>
      </div>

      {/* Main View: 3D Canvas + Bottom Divergence Bar + Right Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: 3D Canvas & Divergence Bar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 3D BIM Simulated Viewport */}
          <div className="flex-1 relative bg-[#040C1A] overflow-hidden flex items-center justify-center">
            {/* Background 3D Grid & Shaders */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(circle, #06B6D4 1px, transparent 1px), radial-gradient(circle, #2563EB 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                backgroundPosition: '0 0, 20px 20px',
              }}
            />

            {/* Top HUD Indicators */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
              <div className="px-3 py-2 rounded-lg bg-[#0B1020]/80 backdrop-blur-md border border-white/10 flex items-center gap-2 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white font-bold">Synchronized: IFC4 Architecture</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-[#0B1020]/80 backdrop-blur-md border border-white/10 text-xs">
                <span className="text-slate-400 font-mono">Model LOD: 400 As-Built</span>
              </div>
            </div>

            {/* Simulated 3D Structure Model Representation */}
            <div
              className="relative transition-transform duration-300"
              style={{ transform: `scale(${zoomLevel / 100})` }}
            >
              {/* Isometric Framing Wireframe */}
              <div className="w-80 h-72 border-2 border-cyan-500/40 rounded-xl relative flex items-center justify-center bg-cyan-950/10 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
                <div className="absolute inset-4 border border-dashed border-blue-500/40 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-7xl text-cyan-400/20">
                    apartment
                  </span>
                </div>

                {/* Floating Sensor Marker 1: HVAC */}
                <button
                  type="button"
                  onClick={() => setActiveSensor('hvac')}
                  className={`absolute -top-3 left-10 p-2 rounded-lg bg-[#0B1020]/95 border text-left shadow-lg transform hover:scale-105 transition-all ${
                    activeSensor === 'hvac'
                      ? 'border-cyan-400 ring-2 ring-cyan-400/50'
                      : 'border-cyan-700/60'
                  }`}
                >
                  <p className="text-[9px] font-mono font-bold text-cyan-400 uppercase">
                    HVAC-RT-01
                  </p>
                  <p className="text-xs font-bold text-white font-mono">22.4°C • 54% RH</p>
                </button>

                {/* Floating Sensor Marker 2: Vibration */}
                <button
                  type="button"
                  onClick={() => setActiveSensor('vib')}
                  className={`absolute -bottom-3 right-8 p-2 rounded-lg bg-[#0B1020]/95 border text-left shadow-lg transform hover:scale-105 transition-all ${
                    activeSensor === 'vib'
                      ? 'border-amber-400 ring-2 ring-amber-400/50'
                      : 'border-amber-700/60'
                  }`}
                >
                  <p className="text-[9px] font-mono font-bold text-amber-400 uppercase">
                    VIB-BM-04
                  </p>
                  <p className="text-xs font-bold text-amber-300 font-mono">4.2 mm/s (Elevated)</p>
                </button>
              </div>
            </div>

            {/* BIM Controls HUD */}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(z + 15, 160))}
                className="w-9 h-9 rounded-lg bg-[#0B1020]/90 border border-white/10 hover:border-cyan-400 text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(z - 15, 60))}
                className="w-9 h-9 rounded-lg bg-[#0B1020]/90 border border-white/10 hover:border-cyan-400 text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">remove</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="w-9 h-9 rounded-lg bg-[#0B1020]/90 border border-white/10 hover:border-cyan-400 text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">center_focus_strong</span>
              </button>
            </div>
          </div>

          {/* Bottom Panel: Divergence Feed */}
          <div className="h-48 border-t border-white/5 bg-[#0B1020] flex flex-col p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-400 text-[18px]">compare</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Divergence & Clash Detection Feed
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Filtered: All Active (3)</span>
            </div>

            <div className="flex-1 overflow-x-auto flex gap-4 pb-1">
              {SAMPLE_DIVERGENCES.map((div) => (
                <button
                  key={div.id}
                  type="button"
                  onClick={() => setActiveDivergence(div.code)}
                  className={`min-w-[300px] max-w-[320px] p-3 rounded-xl border bg-slate-900/60 flex flex-col justify-between text-left transition-colors cursor-pointer ${
                    activeDivergence === div.code
                      ? 'border-cyan-400 bg-cyan-950/20'
                      : div.severity === 'high'
                        ? 'border-rose-500/50 hover:border-rose-400'
                        : div.severity === 'medium'
                          ? 'border-amber-500/50 hover:border-amber-400'
                          : 'border-cyan-500/50 hover:border-cyan-400'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          div.severity === 'high'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : div.severity === 'medium'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        }`}
                      >
                        {div.severity}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{div.code}</span>
                    </div>
                    <p className="text-xs font-bold text-white">{div.title}</p>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      {div.description}
                    </p>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5 w-full">
                    <span className="text-[10px] font-bold text-cyan-300">{div.actionStatus}</span>
                    <span className="material-symbols-outlined text-[14px] text-slate-400">
                      arrow_forward
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Twin State Inventory Sidebar */}
        <div className="w-80 border-l border-white/5 bg-[#0F172A] flex flex-col justify-between p-5 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[18px]">
                  inventory_2
                </span>
                Twin State Inventory
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">Live Asset Confidence Monitoring</p>
            </div>

            <div className="space-y-4">
              {/* Item 1 */}
              <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Load Bearing Beam-A1</span>
                  <span className="font-mono font-bold text-cyan-400">1.0</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-cyan-400 h-full rounded-full" style={{ width: '100%' }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Confidence: 100%</span>
                  <span className="text-emerald-400">Live IoT Link</span>
                </div>
              </div>

              {/* Item 2 */}
              <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Zone 3 Humidity Unit</span>
                  <span className="font-mono font-bold text-amber-400">0.7</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-amber-400 h-full rounded-full" style={{ width: '70%' }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Confidence: 70%</span>
                  <span>4m ago</span>
                </div>
              </div>

              {/* Item 3 */}
              <div className="p-3 rounded-lg bg-slate-900 border border-cyan-800/40 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Sub-grade Settlement</span>
                  <span className="font-mono font-bold text-cyan-400">0.85</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-cyan-400 h-full rounded-full" style={{ width: '85%' }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Confidence: 85%</span>
                  <span className="text-cyan-400">AI Inferred</span>
                </div>
              </div>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
              <div className="p-3 rounded-lg bg-slate-900 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Mean Conf.</span>
                <p className="font-mono font-bold text-lg text-white mt-1">0.92</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-900 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Latency</span>
                <p className="font-mono font-bold text-lg text-emerald-400 mt-1">42 ms</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <button
              type="button"
              className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export Twin State Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
