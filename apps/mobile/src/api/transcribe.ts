// Voice-note transcription client — supports §32.7 <VoiceNoteButton />.
//
// Flow (spec 26 §57 "voice transcription", File Service Phase 9, ai-gateway):
//   1. Upload the recorded .m4a audio to the File Service (multipart) → server file_id.
//      Audio MIME types were added to the File Service allowlist (spec 09 — voice notes, 25 MB).
//   2. POST /ai/transcribe { file_id, tenant_id, language } via the AI gateway → transcript.
//
// tenant_id is read from the authoritative `tenant_id` JWT claim (spec §5.4.1) — the transcribe
// endpoint meters usage per tenant and requires it explicitly in the request body.

// Expo SDK 54+ moved uploadAsync / FileSystemUploadType to the `expo-file-system/legacy` subpath
// (same as PhotoUploadQueue, ADR-046).
import * as FileSystem from 'expo-file-system/legacy';
import { useAuthStore } from '../store/authStore';
import { decodeJwtPayload } from '../lib/jwt';
import { apiClient } from './client';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';
const UPLOAD_URL = `${BASE_URL}/files/upload`;

interface UploadResponse {
  file_id?: string;
}

interface TranscribeResponse {
  file_id: string;
  transcript: string;
  language: string;
  duration_seconds: number;
  billed_minutes: number;
}

export class TranscribeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscribeError';
  }
}

/**
 * Upload a recorded audio clip and return its transcript.
 * @param localUri  file:// URI of the recorded .m4a (from expo-audio recorder.uri)
 * @param language  BCP-47 / ISO code for the spoken language (defaults to Thai, the app locale)
 */
export async function transcribeAudio(localUri: string, language = 'th'): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    throw new TranscribeError('Not authenticated — cannot transcribe voice note.');
  }

  const tenantId = decodeJwtPayload(token)['tenant_id'];
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new TranscribeError('No tenant_id in session token — cannot transcribe voice note.');
  }

  // 1) Upload the audio file to the File Service.
  const upload = await FileSystem.uploadAsync(UPLOAD_URL, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (upload.status < 200 || upload.status >= 300) {
    throw new TranscribeError(`Audio upload failed (HTTP ${upload.status}).`);
  }

  const uploadBody = JSON.parse(upload.body) as UploadResponse;
  const fileId = uploadBody.file_id;
  if (!fileId) {
    throw new TranscribeError('Audio upload returned no file_id.');
  }

  // 2) Ask the AI gateway to transcribe it.
  const { data } = await apiClient.post<TranscribeResponse>('/ai/transcribe', {
    file_id: fileId,
    tenant_id: tenantId,
    language,
  });

  return data.transcript;
}
