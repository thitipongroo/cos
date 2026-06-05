// Type declaration for clamscan (nodejs-clamscan) — no @types package available.

declare module 'clamscan' {
  interface ClamDScanOptions {
    host?: string;
    port?: number;
    timeout?: number;
    active?: boolean;
  }

  interface ClamScanOptions {
    clamdscan?: ClamDScanOptions;
  }

  interface ScanFileResult {
    isInfected: boolean;
    viruses: string[];
  }

  class NodeClam {
    init(options?: ClamScanOptions): Promise<NodeClam>;
    scanFile(filePath: string): Promise<ScanFileResult>;
  }

  export = NodeClam;
}
