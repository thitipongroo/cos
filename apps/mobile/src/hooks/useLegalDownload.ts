// The legal-document download and its receipt — one contract, both ends.
//
// The privacy policy and the terms of use are downloaded the same way (ADR-092): fetch the file,
// verify its digest, then push a receipt screen that states what arrived. Both screens had written
// that out, and both receipt screens had written out the read of the six params it sends. Two copies
// of a wire format is the shape that goes wrong quietly — a param renamed on one side reaches the
// other as `undefined`, which reads as an empty string rather than as an error.
//
// So the params are built and parsed here, next to each other, and neither screen names them.

import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { DownloadedDocument } from '../lib/legalDownload';

/** The receipt screens, which are the only routes these params are addressed to. */
export type LegalReceiptRoute =
  '/(auth)/privacy-policy-downloaded' | '/(auth)/terms-of-use-downloaded';

/** What arrived, as the receipt screen reads it. */
export interface LegalReceipt {
  fileName: string;
  version: string;
  sizeBytes: number;
  sha256: string;
  /** FALSE is passed through rather than suppressed — a reader handed the wrong file must be told. */
  verified: boolean;
  downloadedAt: string;
}

/**
 * Fetch the document, then show its receipt.
 *
 * A failure leaves the reader on the document with the button live again rather than pushing an
 * error screen: the thing they came to read is already in front of them and the retry is one tap.
 */
export function useLegalDownload(
  fetchDocument: (baseUrl: string) => Promise<DownloadedDocument>,
  receipt: LegalReceiptRoute,
  baseUrl: string,
): { downloading: boolean; download: () => Promise<void> } {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  const download = async (): Promise<void> => {
    setDownloading(true);
    try {
      const file = await fetchDocument(baseUrl);
      router.push({
        pathname: receipt,
        params: {
          fileName: file.fileName,
          version: file.version,
          sizeBytes: String(file.sizeBytes),
          sha256: file.sha256,
          verified: String(file.verified),
          downloadedAt: file.downloadedAt,
        },
      });
    } catch {
      // Deliberately silent beyond restoring the button — see the note above.
    } finally {
      setDownloading(false);
    }
  };

  return { downloading, download };
}

/** The other end of the same contract: what a receipt screen reads out of the route. */
export function useLegalReceipt(): LegalReceipt {
  const params = useLocalSearchParams<{
    fileName?: string;
    version?: string;
    sizeBytes?: string;
    sha256?: string;
    verified?: string;
    downloadedAt?: string;
  }>();

  return {
    fileName: params.fileName ?? '',
    version: params.version ?? '',
    sizeBytes: Number(params.sizeBytes ?? '0'),
    sha256: params.sha256 ?? '',
    verified: params.verified === 'true',
    downloadedAt: params.downloadedAt ?? '',
  };
}
