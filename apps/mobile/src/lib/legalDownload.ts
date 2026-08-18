// Downloading a legal document PDF — the Privacy Policy (ADR-091) and the Terms of Use (ADR-092) —
// and checking that what arrived is what the server said it sent.
//
// WHY THE DIGEST IS COMPUTED HERE AND NOT SHOWN AS DECORATION. Both download screens draw an
// SHA-256, and on the privacy inquiry SUBMIT screen an equivalent hash was dropped as meaningless —
// hashing a message the sender still holds proves nothing about what the server stored. This one is
// different and is kept for that reason: the server publishes the digest of the document BEFORE the
// transfer (`GET /privacy/policy/metadata`, `GET /terms/metadata`), the client computes it over the
// bytes that actually landed on disk, and a mismatch means the file is not the document the platform
// published. That is a real check with a real failure mode, not a number printed to look technical.
//
// It only works because each document is byte-stable: the service builds it once from static text
// with its PDF timestamps pinned to the effective date, so the same version always hashes the same.
//
// ONE implementation, two documents. This file was `policyDownload.ts` and served the policy alone
// until the terms gained a PDF of their own; the verification is the delicate part (see the digest
// note below) and a second copy of it for the second document would be a second place for it to go
// subtly wrong.
//
// Pure logic, no React — so the verification is unit-tested at the 100/100 gate rather than only
// exercised by tapping the screen.

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { apiClient } from '../api/client';

export interface LegalDocumentMetadata {
  version: string;
  effective_date: string;
  file_name: string;
  sha256: string;
  size_bytes: number;
  /** Both documents are English only — pdf-lib's standard fonts carry no Thai glyphs. */
  language: string;
}

export interface DownloadedDocument {
  uri: string;
  fileName: string;
  version: string;
  sizeBytes: number;
  sha256: string;
  /** True when the file's digest matches the one the server published beforehand. */
  verified: boolean;
  downloadedAt: string;
}

/** Where each document's two routes live, relative to the API base. */
interface DocumentRoutes {
  metadata: string;
  pdf: string;
}

const POLICY: DocumentRoutes = { metadata: '/privacy/policy/metadata', pdf: '/privacy/policy/pdf' };
const TERMS: DocumentRoutes = { metadata: '/terms/metadata', pdf: '/terms/pdf' };

/**
 * SHA-256 of the RAW BYTES a base64 string encodes, hex.
 *
 * `Crypto.digestStringAsync` would be the shorter call and it is WRONG here: it hashes the base64
 * TEXT, so its output could never equal the server's digest of the file, and `verified` would read
 * false on a perfectly good download — a check that always fails is worse than no check, because it
 * teaches the reader to ignore it. `Crypto.digest` takes a BufferSource, so the base64 is decoded
 * first and the bytes are what get hashed.
 *
 * `atob` rather than Buffer: Buffer is a Node global that React Native does not provide, and pulling
 * a polyfill in for one call would be a runtime dependency on every screen that imports this.
 */
async function sha256OfBase64(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Absolute URL of a document route, derived from the same base the API client uses. */
function documentUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

export function policyPdfUrl(baseUrl: string): string {
  return documentUrl(baseUrl, POLICY.pdf);
}

export function termsPdfUrl(baseUrl: string): string {
  return documentUrl(baseUrl, TERMS.pdf);
}

/**
 * Fetch the metadata, download the file, and verify the bytes against the published digest.
 *
 * The file is kept even when verification FAILS, and the flag is returned rather than thrown on. A
 * reader who was handed a wrong file is better served by a screen that says so — with the document
 * still on disk to inspect — than by an error that deletes the evidence.
 */
async function downloadDocument(
  baseUrl: string,
  routes: DocumentRoutes,
): Promise<DownloadedDocument> {
  const { data: meta } = await apiClient.get<LegalDocumentMetadata>(routes.metadata);
  const target = `${FileSystem.documentDirectory}${meta.file_name}`;

  await FileSystem.downloadAsync(documentUrl(baseUrl, routes.pdf), target);

  const base64 = await FileSystem.readAsStringAsync(target, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const sha256 = await sha256OfBase64(base64);

  const info = await FileSystem.getInfoAsync(target);
  // `size` is absent on a directory entry and on some platforms when the file is missing; the
  // server's figure is the fallback rather than 0, which would render as "0 B" on the screen.
  const sizeBytes = info.exists && 'size' in info ? info.size : meta.size_bytes;

  return {
    uri: target,
    fileName: meta.file_name,
    version: meta.version,
    sizeBytes,
    sha256,
    // Both sides are now the digest of the same thing: the server hashes the file it built, this
    // hashes the bytes that landed on disk. Case-insensitive because hex casing is a formatting
    // choice neither side should have to guess at.
    verified: sha256.toLowerCase() === meta.sha256.toLowerCase(),
    downloadedAt: new Date().toISOString(),
  };
}

export function downloadPolicy(baseUrl: string): Promise<DownloadedDocument> {
  return downloadDocument(baseUrl, POLICY);
}

export function downloadTerms(baseUrl: string): Promise<DownloadedDocument> {
  return downloadDocument(baseUrl, TERMS);
}
