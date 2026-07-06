'use client';

// Web port of figma/mockup VoiceInput. Replaces the mockup's browser Web Speech API with the COS
// AI transcription service (in-tenant, spec 21.4 Layer A): records audio via MediaRecorder, uploads
// it to the File Service, then POSTs /ai/transcribe (Kong → ai-gateway). Re-themed to §32.7; all
// copy via i18n; Thai is the default language. Until STT_PROVIDER=faster_whisper is deployed the
// endpoint answers 503 and the component shows an "unavailable" message (graceful).
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ApiError, useApi, useUpload } from '../../lib/api/client';
import { useI18n } from '../../i18n';
import type { UploadedFileResult } from '../../lib/api/types';

interface TranscribeResult {
  file_id: string;
  transcript: string;
  language: string;
  duration_seconds: number;
  billed_minutes: number;
}

type Status = 'idle' | 'recording' | 'transcribing' | 'done';

interface VoiceInputProps {
  onTranscript?: (transcript: string) => void;
  language?: 'th' | 'en';
}

export function VoiceInput({ onTranscript, language = 'th' }: VoiceInputProps) {
  const { t } = useI18n();
  const { data: session } = useSession();
  const api = useApi();
  const upload = useUpload();

  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'th' | 'en'>(language);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setSupported(
      typeof MediaRecorder !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  const transcribe = async (blob: Blob) => {
    setStatus('transcribing');
    try {
      const form = new FormData();
      form.append('file', blob, 'voice-note.webm');
      const entityId =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
      const uploaded = await upload<UploadedFileResult>(
        `/files/upload?entity_type=voice_note&entity_id=${entityId}`,
        form,
      );
      const result = await api<TranscribeResult>('/ai/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          file_id: uploaded.file_id,
          tenant_id: session?.user?.tenantId,
          language: lang,
        }),
      });
      setTranscript(result.transcript);
      onTranscript?.(result.transcript);
      setStatus('done');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503 ? t('voice.unavailable') : t('voice.error'),
      );
      setStatus('idle');
    }
  };

  const startRecording = async () => {
    setError(null);
    setTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus('recording');
    } catch {
      setError(t('voice.micDenied'));
      setStatus('idle');
    }
  };

  const stopRecording = () => recorderRef.current?.stop();

  if (!supported) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-body text-cos-gray">
        {t('voice.notSupported')}
      </div>
    );
  }

  const recording = status === 'recording';
  const busy = status === 'transcribing';

  return (
    <div className="space-y-3" data-testid="voice-input">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={busy}
          className={`flex-1 rounded-lg px-4 py-2.5 text-body font-medium text-white disabled:opacity-50 ${
            recording ? 'bg-red-600 hover:bg-red-700' : 'bg-cos-blue hover:bg-blue-700'
          }`}
        >
          {recording ? t('voice.stop') : busy ? t('voice.transcribing') : t('voice.tapToSpeak')}
        </button>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as 'th' | 'en')}
          disabled={recording || busy}
          aria-label={t('voice.language')}
          className="rounded-md border border-gray-300 px-2 py-2 text-body"
        >
          <option value="th">ไทย</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="min-h-[72px] rounded-md border border-gray-200 bg-cos-white p-3 text-body text-cos-navy">
        {recording ? (
          <span className="text-red-600">{t('voice.recording')}</span>
        ) : transcript ? (
          transcript
        ) : (
          <span className="text-cos-gray">{t('voice.placeholder')}</span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-small text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
