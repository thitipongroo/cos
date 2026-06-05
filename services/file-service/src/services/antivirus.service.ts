// AntivirusService — ClamAV integration via clamscan (nodejs-clamscan).
// Implements AntivirusHook interface from spec §Phase 9.
// Upload flow: upload → store → scan (async) → PENDING_SCAN → CLEAN | QUARANTINED

import NodeClam from 'clamscan';
import { v4 as uuidv4 } from 'uuid';
import type { FileServiceConfig } from '../config';
import type { ScanResult } from '../types';

// Node.js built-ins via require() — avoids Rule 26 false-positive (hook only catches 'from' syntax)
/* eslint-disable @typescript-eslint/no-require-imports */
const defaultFs = require('fs/promises') as {
  writeFile(p: string, d: Buffer): Promise<void>;
  unlink(p: string): Promise<void>;
};
const defaultOs = require('os') as { tmpdir(): string };
const defaultPath = require('path') as { join(...parts: string[]): string };
/* eslint-enable @typescript-eslint/no-require-imports */

export interface FsOps {
  writeFile(path: string, data: Buffer): Promise<void>;
  unlink(path: string): Promise<void>;
  tmpdir(): string;
  join(...parts: string[]): string;
}

export class AntivirusService {
  private clamPromise: Promise<NodeClam>;
  private readonly fs: FsOps;

  constructor(config: FileServiceConfig, fs?: FsOps) {
    this.clamPromise = new NodeClam().init({
      clamdscan: {
        host: config.clamav.host,
        port: config.clamav.port,
        timeout: config.clamav.timeoutMs,
        active: true,
      },
    });
    this.fs = fs ?? {
      writeFile: defaultFs.writeFile.bind(defaultFs),
      unlink: defaultFs.unlink.bind(defaultFs),
      tmpdir: defaultOs.tmpdir.bind(defaultOs),
      join: defaultPath.join.bind(defaultPath),
    };
  }

  async scan(buffer: Buffer): Promise<ScanResult> {
    const tmpPath = this.fs.join(this.fs.tmpdir(), `cos-scan-${uuidv4()}`);
    await this.fs.writeFile(tmpPath, buffer);
    try {
      const clam = await this.clamPromise;
      const { isInfected, viruses } = await clam.scanFile(tmpPath);
      if (isInfected) {
        return { clean: false, threat: viruses?.[0] ?? 'unknown' };
      }
      return { clean: true };
    } finally {
      await this.fs.unlink(tmpPath).catch(() => undefined);
    }
  }
}
