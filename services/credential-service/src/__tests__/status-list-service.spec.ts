// Unit tests — Status List 2021 lifecycle (CS-6). The SQL itself is covered by the integration suite;
// here the client is an in-memory stand-in so the allocate / flip / fail-closed logic is exercised
// without a database.
import { jest } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';
import {
  allocateStatusEntry,
  revokeStatusEntry,
  createDbStatusChecker,
  type StatusListSigner,
} from '../status-list-service.js';
import { buildDidKeySuite, verifyCredential } from '../vc-service.js';
import { generateEphemeralSignerKey } from '../key-manager.js';
import { createEmptyEncodedList, setRevoked, statusListUrl } from '../status-list.js';

const TENANT = 't1';
const DOMAIN = 'cred.cos.dev';

interface Row {
  status_list_id: string;
  encoded_list: string;
  capacity: number;
  next_index: number;
  version: number;
  status_list_credential: unknown;
}

/** Minimal in-memory `revocation_status_lists`, honouring the same conditions as the real SQL. */
function fakeStore(seed: Row[] = []) {
  const rows = new Map(seed.map((r) => [r.status_list_id, r]));
  const query = jest.fn(async (sql: unknown, params: unknown[] = []) => {
    const s = String(sql);
    if (s.includes('INSERT INTO credentials.revocation_status_lists')) {
      rows.set(params[0] as string, {
        status_list_id: params[0] as string,
        status_list_credential: JSON.parse(params[2] as string),
        encoded_list: params[3] as string,
        capacity: params[4] as number,
        next_index: 0,
        version: 1,
      });
      return { rows: [] };
    }
    if (s.includes('FROM credentials.revocation_status_lists')) {
      const found = [...rows.values()].filter((r) =>
        s.includes('status_list_id = $2')
          ? r.status_list_id === params[1]
          : r.next_index < r.capacity,
      );
      return { rows: found.slice(0, 1) };
    }
    if (s.includes('UPDATE credentials.revocation_status_lists')) {
      const row = rows.get(params[1] as string);
      if (!row) return { rows: [] };
      if (s.includes('next_index = next_index + 1')) {
        if (row.next_index >= row.capacity) return { rows: [] };
        row.next_index += 1;
        return { rows: [{ allocated_index: row.next_index - 1 }] };
      }
      row.encoded_list = params[2] as string;
      row.status_list_credential = JSON.parse(params[3] as string);
      row.version += 1;
      return { rows: [] };
    }
    return { rows: [] };
  });
  const client = { query } as unknown as PoolClient;
  const pool = { connect: jest.fn(async () => ({ query, release: jest.fn() })) } as unknown as Pool;
  return { rows, client, pool };
}

async function makeSigner(): Promise<StatusListSigner> {
  const { suite, did } = await buildDidKeySuite(await generateEphemeralSignerKey());
  return { did, suite };
}

describe('status-list-service (CS-6)', () => {
  it('provisions a signed list on first use, then allocates sequential indices from it', async () => {
    const store = fakeStore();
    const signer = await makeSigner();

    const first = await allocateStatusEntry(store.client, TENANT, DOMAIN, signer);
    expect(first.statusListIndex).toBe(0);
    expect(first.statusListCredentialUrl).toBe(statusListUrl(DOMAIN, TENANT, first.statusListId));
    expect(store.rows.size).toBe(1);

    // The published credential is a real, verifiable VC signed by the tenant issuer.
    const published = store.rows.get(first.statusListId)!.status_list_credential;
    expect(await verifyCredential(published)).toEqual({ verified: true, revoked: false });

    // Second issuance reuses the same list and never repeats an index.
    const second = await allocateStatusEntry(store.client, TENANT, DOMAIN, signer);
    expect(second.statusListId).toBe(first.statusListId);
    expect(second.statusListIndex).toBe(1);
    expect(store.rows.size).toBe(1);
  });

  it('provisions a fresh list once the current one is full', async () => {
    const store = fakeStore();
    const signer = await makeSigner();
    const first = await allocateStatusEntry(store.client, TENANT, DOMAIN, signer);
    // Fill it: `next_index < capacity` no longer holds, so the next issuance must start a new list.
    store.rows.get(first.statusListId)!.capacity = 1;

    const second = await allocateStatusEntry(store.client, TENANT, DOMAIN, signer);
    expect(second.statusListId).not.toBe(first.statusListId);
    expect(second.statusListIndex).toBe(0);
    expect(store.rows.size).toBe(2);
  });

  it('throws if a concurrent writer takes the last bit between the read and the claim', async () => {
    // The SELECT still sees free capacity, but by the time the conditional UPDATE runs another
    // transaction has consumed it — the UPDATE matches no row. Never silently reuse an index.
    const query = jest.fn(async (sql: unknown) =>
      String(sql).includes('FROM credentials.revocation_status_lists')
        ? {
            rows: [
              {
                status_list_id: 'sl-1',
                encoded_list: 'x',
                capacity: 1024,
                next_index: 1023,
                version: 1,
                status_list_credential: {},
              },
            ],
          }
        : { rows: [] },
    );
    await expect(
      allocateStatusEntry({ query } as unknown as PoolClient, TENANT, DOMAIN, await makeSigner()),
    ).rejects.toThrow(/exhausted/);
  });

  it('revokeStatusEntry flips the bit, re-signs and bumps the version', async () => {
    const store = fakeStore();
    const signer = await makeSigner();
    const entry = await allocateStatusEntry(store.client, TENANT, DOMAIN, signer);
    const before = store.rows.get(entry.statusListId)!;
    const encodedBefore = before.encoded_list;

    await revokeStatusEntry(store.client, {
      tenantId: TENANT,
      baseDomain: DOMAIN,
      statusListId: entry.statusListId,
      statusListIndex: entry.statusListIndex,
      signer,
    });

    const after = store.rows.get(entry.statusListId)!;
    expect(after.encoded_list).not.toBe(encodedBefore);
    expect(after.version).toBe(2);
    // The republished credential still verifies (re-signed, not hand-patched).
    expect((await verifyCredential(after.status_list_credential)).verified).toBe(true);
  });

  it('revokeStatusEntry throws when the list is missing', async () => {
    const store = fakeStore();
    await expect(
      revokeStatusEntry(store.client, {
        tenantId: TENANT,
        baseDomain: DOMAIN,
        statusListId: 'sl-missing',
        statusListIndex: 0,
        signer: await makeSigner(),
      }),
    ).rejects.toThrow(/not found/);
  });

  describe('createDbStatusChecker', () => {
    const entryFor = (url: string, index: string) => ({
      credential: {
        credentialStatus: {
          type: 'StatusList2021Entry',
          statusListCredential: url,
          statusListIndex: index,
        },
      },
    });

    it('reports a live index verified and a revoked index revoked', async () => {
      const encoded = await createEmptyEncodedList(1024);
      const store = fakeStore([
        {
          status_list_id: 'sl-1',
          encoded_list: await setRevoked(encoded, 5, true),
          capacity: 1024,
          next_index: 6,
          version: 2,
          status_list_credential: {},
        },
      ]);
      const check = createDbStatusChecker(store.pool, TENANT, DOMAIN);
      const url = statusListUrl(DOMAIN, TENANT, 'sl-1');
      expect(await check(entryFor(url, '5'))).toEqual({ verified: false, revoked: true });
      expect(await check(entryFor(url, '4'))).toEqual({ verified: true, revoked: false });
    });

    it('fails closed on a foreign, malformed or unknown status entry', async () => {
      const store = fakeStore();
      const check = createDbStatusChecker(store.pool, TENANT, DOMAIN);
      const ours = statusListUrl(DOMAIN, TENANT, 'sl-1');
      // not one of our URLs
      expect(await check(entryFor('https://evil.example/list', '1'))).toEqual({
        verified: false,
        revoked: false,
        error: 'UNRESOLVABLE_STATUS_LIST',
      });
      // non-numeric / negative index
      expect(await check(entryFor(ours, 'abc'))).toMatchObject({ verified: false });
      expect(await check(entryFor(ours, '-1'))).toMatchObject({ verified: false });
      // no credentialStatus at all
      expect(await check({ credential: {} })).toMatchObject({ verified: false });
      // well-formed, but the list is not in this tenant's store
      expect(await check(entryFor(ours, '3'))).toEqual({
        verified: false,
        revoked: false,
        error: 'STATUS_LIST_NOT_FOUND',
      });
    });
  });
});
