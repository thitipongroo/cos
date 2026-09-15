// The PUT body is validated at the API edge by the global ValidationPipe (whitelist + forbidNonWhitelisted,
// transform, no implicit conversion — backend/src/main.ts). These run the same class-transformer +
// class-validator pipeline with the same options, so each rule is proven on the wire shape.

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  PLATFORM_SETTINGS_BOUNDS,
  UpdatePlatformSettingsDto,
} from '../dto/update-platform-settings.dto';
import { defaultPlatformSettings } from '../platform-settings.types';

const JUSTIFICATION = 'Primary gateway moved to the new endpoint (ticket OPS-6001).';
const B = PLATFORM_SETTINGS_BOUNDS;

type Json = Record<string, unknown>;

/** Every failing property path, dotted — `settings.gateways.primary.url`. */
function paths(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const here = `${prefix}${e.property}`;
    return e.children && e.children.length > 0 ? paths(e.children, `${here}.`) : [here];
  });
}

async function errorsFor(body: unknown): Promise<string[]> {
  const dto = plainToInstance(UpdatePlatformSettingsDto, body);
  return paths(await validate(dto, { whitelist: true, forbidNonWhitelisted: true }));
}

/** Walk to the parent of a dotted path and apply `fn` to it with the last key. */
function atPath(obj: Json, path: string, fn: (parent: Json, key: string) => void): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  fn(
    keys.reduce((node, k) => node[k] as Json, obj),
    last,
  );
}

type Edit = [path: string, value: unknown] | [path: string];

/** A fully-populated valid body with the edits applied: `[path, value]` sets, `[path]` deletes. */
function body(...edits: Edit[]): Json {
  const settings = defaultPlatformSettings();
  settings.gateways = {
    primary: {
      name: 'Comptroller General e-GP',
      url: 'https://gw.example.com/api',
      protocol: 'REST',
    },
    secondary: { name: 'Mirror', url: 'https://mirror.internal/api', max_retries: 3 },
    auto_sync_cadence: 'Daily 04:00 Asia/Bangkok',
    failover_cache_ttl_hours: 24,
    auto_fallback_on_timeout: true,
  };
  settings.maintenance = {
    safety_non_suspension: true,
    shared_tiers_window: 'Sun 01:00-03:00',
    enterprise_mode: 'ZERO_DOWNTIME',
  };
  settings.broadcast = { lead_time_hours: 72, channels: ['IN_APP_BANNER', 'EMAIL_DIGEST'] };
  settings.limits = { shared_tenant_cap: 400, default_max_pool_conns: 20 };
  settings.tiers.ENTERPRISE = {
    db_strategy: 'DEDICATED',
    storage_quota_gb: 2000,
    api_monthly_quota: 5_000_000,
    token_limit_monthly: 10_000_000,
  };
  const b = JSON.parse(
    JSON.stringify({ version: 2, justification: JUSTIFICATION, settings }),
  ) as Json;
  for (const edit of edits) {
    atPath(b, edit[0], (parent, key) => {
      if (edit.length === 1) delete parent[key];
      else parent[key] = edit[1];
    });
  }
  return b;
}

describe('UpdatePlatformSettingsDto', () => {
  it('accepts a fully populated document', async () => {
    expect(await errorsFor(body())).toEqual([]);
  });

  it('accepts the all-null defaults at version 0 — "not set" is a valid saved state', async () => {
    expect(
      await errorsFor({
        version: 0,
        justification: JUSTIFICATION,
        settings: defaultPlatformSettings(),
      }),
    ).toEqual([]);
  });

  it('accepts every bound at its maximum', async () => {
    const b = body(
      ['settings.gateways.primary.name', 'n'.repeat(B.TEXT_MAX)],
      ['settings.gateways.secondary.max_retries', B.MAX_RETRIES],
      ['settings.gateways.failover_cache_ttl_hours', B.HOURS_MAX],
      ['settings.broadcast.lead_time_hours', B.HOURS_MAX],
      ['settings.limits.shared_tenant_cap', B.SHARED_TENANT_CAP_MAX],
      ['settings.limits.default_max_pool_conns', B.POOL_CONNS_MAX],
      ['settings.tiers.STARTER.storage_quota_gb', B.STORAGE_QUOTA_GB_MAX],
      ['settings.tiers.STARTER.api_monthly_quota', B.MONTHLY_QUOTA_MAX],
      ['settings.tiers.STARTER.token_limit_monthly', 0],
    );
    expect(await errorsFor(b)).toEqual([]);
  });

  it('stores blank text as null and trims the rest — "not set" has one encoding', async () => {
    const dto = plainToInstance(
      UpdatePlatformSettingsDto,
      body(
        ['settings.gateways.primary.name', '   '],
        ['settings.maintenance.shared_tiers_window', '  Sunday 01:00  '],
      ),
    );
    expect(paths(await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))).toEqual([]);
    expect(dto.settings.gateways.primary.name).toBeNull();
    expect(dto.settings.maintenance.shared_tiers_window).toBe('Sunday 01:00');
  });

  it('keeps the trimmed justification (the §6.7 rules come from AdminJustificationDto)', async () => {
    const dto = plainToInstance(
      UpdatePlatformSettingsDto,
      body(['justification', `  ${JUSTIFICATION}  `]),
    );
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.justification).toBe(JUSTIFICATION);
  });

  const gw = 'settings.gateways';

  it.each<[string, Edit, string]>([
    ['justification too short', ['justification', 'too short'], 'justification'],
    ['justification blank after trimming', ['justification', '            '], 'justification'],
    ['justification missing', ['justification'], 'justification'],
    ['version negative', ['version', -1], 'version'],
    ['version not an integer', ['version', 1.5], 'version'],
    ['version as a string (no implicit conversion)', ['version', '2'], 'version'],
    ['settings missing', ['settings'], 'settings'],
    ['a section null', ['settings.limits', null], 'settings.limits'],
    ['a section not an object', ['settings.maintenance', 'on'], 'settings.maintenance'],
    ['a tier missing', ['settings.tiers.PROFESSIONAL'], 'settings.tiers.PROFESSIONAL'],
    [
      'a field absent rather than null (a PUT is the whole document)',
      [`${gw}.primary.protocol`],
      `${gw}.primary.protocol`,
    ],
    ['an http URL', [`${gw}.primary.url`, 'http://gw.example.com'], `${gw}.primary.url`],
    [
      'a URL carrying credentials',
      [`${gw}.primary.url`, 'https://svc:secret@gw.example.com/api'],
      `${gw}.primary.url`,
    ],
    ['a URL without a scheme', [`${gw}.secondary.url`, 'gw.example.com'], `${gw}.secondary.url`],
    ['a non-URL', [`${gw}.secondary.url`, 'not a url'], `${gw}.secondary.url`],
    [
      'a URL over the length bound',
      [`${gw}.primary.url`, `https://gw.example.com/${'a'.repeat(B.URL_MAX)}`],
      `${gw}.primary.url`,
    ],
    [
      'text over the bound',
      ['settings.maintenance.enterprise_mode', 'x'.repeat(B.TEXT_MAX + 1)],
      'settings.maintenance.enterprise_mode',
    ],
    ['text not a string', [`${gw}.auto_sync_cadence`, 4], `${gw}.auto_sync_cadence`],
    ['a negative count', [`${gw}.secondary.max_retries`, -1], `${gw}.secondary.max_retries`],
    [
      'a fractional count',
      ['settings.tiers.STARTER.storage_quota_gb', 1.5],
      'settings.tiers.STARTER.storage_quota_gb',
    ],
    [
      'a count over its bound',
      [`${gw}.secondary.max_retries`, B.MAX_RETRIES + 1],
      `${gw}.secondary.max_retries`,
    ],
    [
      'a count as a string',
      ['settings.limits.shared_tenant_cap', '400'],
      'settings.limits.shared_tenant_cap',
    ],
    [
      'a flag as a string',
      ['settings.maintenance.safety_non_suspension', 'true'],
      'settings.maintenance.safety_non_suspension',
    ],
    ['channels null', ['settings.broadcast.channels', null], 'settings.broadcast.channels'],
    ['an unknown channel', ['settings.broadcast.channels', ['SMS']], 'settings.broadcast.channels'],
    [
      'a repeated channel',
      ['settings.broadcast.channels', ['EMAIL_DIGEST', 'EMAIL_DIGEST']],
      'settings.broadcast.channels',
    ],
    ['an unknown top-level key', ['extra', 1], 'extra'],
    ['an unknown key inside settings', ['settings.billing', {}], 'settings.billing'],
    ['an unknown key deep inside', [`${gw}.primary.api_key`, 'secret'], `${gw}.primary.api_key`],
    ['an unknown tier', ['settings.tiers.FREE', {}], 'settings.tiers.FREE'],
  ])('rejects %s', async (_label, edit, expected) => {
    expect(await errorsFor(body(edit))).toEqual([expected]);
  });
});
