// Voice-command intent classification client (ADR-073). Posts a transcript to the AI gateway's
// /ai/intent endpoint; returns the parsed command for voiceCommand.actionForCommand to route.
//
// Throws when the gateway is unavailable (503 — no LLM key wired yet) or offline; the FAB catches and
// shows "voice command unavailable" rather than guessing an action (ห้ามเดา).

import { post } from './client';
import type { ParsedCommand, VoiceIntent } from '../lib/voiceCommand';

interface IntentApiResponse {
  intent: string;
  target: string | null;
  text: string | null;
  confidence: number | null;
}

export async function parseVoiceIntent(transcript: string): Promise<ParsedCommand> {
  const res = await post<IntentApiResponse>('/ai/intent', { transcript });
  return { intent: res.intent as VoiceIntent, target: res.target, text: res.text };
}
