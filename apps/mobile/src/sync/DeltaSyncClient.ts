// DeltaSyncClient — pulls server-side delta updates into local WatermelonDB.
// Endpoint: GET /api/v1/sync/delta?since=<ISO>&entity_types[]=<type>...
// Spec §Phase 10 — Delta Sync architecture.

import type { AxiosInstance } from 'axios';

export interface DeltaResponse {
  updated: Record<string, unknown>[];
  deleted: string[];
  server_timestamp: string;
}

export class DeltaSyncClient {
  constructor(
    private readonly client: AxiosInstance,
    private readonly getToken: () => string | null,
  ) {}

  async fetchDelta(since: string, entityTypes: string[]): Promise<DeltaResponse> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const params = new URLSearchParams({ since });
    for (const t of entityTypes) params.append('entity_types[]', t);

    const { data } = await this.client.get<DeltaResponse>(`/api/v1/sync/delta?${params}`, {
      headers,
    });
    return data;
  }
}
