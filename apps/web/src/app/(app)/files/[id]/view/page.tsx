'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '../../../../../lib/api/client';

/**
 * Full-page CAD drawing viewer (spec §Phase 9 — DWG/DXF PO decision, Phase A).
 * Open-source, free-licence: renders DXF client-side via dxf-viewer (MIT, three.js) from the
 * File Service signed URL. DWG remains store-and-serve until the LibreDWG converter (Phase B).
 */

type ViewState = 'loading' | 'ready' | 'error' | 'unsupported';

interface FileMeta {
  original_filename: string;
  mime_type: string;
}

export default function FileViewPage() {
  const params = useParams<{ id: string }>();
  const api = useApi();
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [filename, setFilename] = useState('');

  useEffect(() => {
    const fileId = params.id;
    if (!fileId) return;
    let destroyed = false;
    let viewer: { Destroy(): void } | null = null;

    void (async () => {
      try {
        const meta = await api<FileMeta>(`/files/${fileId}`);
        if (destroyed) return;
        setFilename(meta.original_filename);

        const isDxf =
          meta.mime_type === 'application/dxf' ||
          meta.original_filename.toLowerCase().endsWith('.dxf');
        if (!isDxf) {
          setState('unsupported');
          return;
        }

        const { url } = await api<{ url: string }>(`/files/${fileId}/url`);
        if (destroyed || !containerRef.current) return;

        // dxf-viewer is a browser-only WebGL module — load it lazily to keep it off the SSR path
        // and out of the main bundle. workerFactory omitted → parsing runs on the main thread.
        const { DxfViewer } = await import('dxf-viewer');
        const v = new DxfViewer(containerRef.current, { autoResize: true });
        await v.Load({ url });
        if (destroyed) {
          v.Destroy();
          return;
        }
        viewer = v;
        setState('ready');
      } catch {
        if (!destroyed) setState('error');
      }
    })();

    return () => {
      destroyed = true;
      viewer?.Destroy();
    };
  }, [api, params.id]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">{filename || 'Drawing viewer'}</h1>
        <p className="text-sm text-gray-400">DXF viewer</p>
      </div>
      <div className="relative h-[75vh] w-full overflow-hidden rounded border border-gray-200 bg-white">
        <div ref={containerRef} className="absolute inset-0" />
        {state !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-500">
            {state === 'loading' && 'Loading drawing…'}
            {state === 'error' && 'Could not load this drawing.'}
            {state === 'unsupported' &&
              'Preview is available for DXF files only — download the file to view it.'}
          </div>
        )}
      </div>
    </div>
  );
}
