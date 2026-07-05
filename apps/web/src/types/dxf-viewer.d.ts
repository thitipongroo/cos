// Minimal typings for dxf-viewer (MIT) — the package ships no TypeScript declarations.
// Only the surface the DXF viewer page uses is declared.
declare module 'dxf-viewer' {
  export interface DxfViewerLoadParams {
    url: string;
    fonts?: unknown;
    progressCbk?: ((phase: string, size: number, total: number) => void) | null;
    workerFactory?: (() => Worker) | null;
  }

  export class DxfViewer {
    constructor(domContainer: HTMLElement, options?: Record<string, unknown> | null);
    Load(params: DxfViewerLoadParams): Promise<void>;
    Destroy(): void;
  }
}
