# @cos/ui-logic

Platform-agnostic **client** logic shared by the web (`apps/web`) and mobile (`apps/mobile`) apps.
Pure number/string helpers with **no runtime dependencies** — safe to import from React Native
(Metro), the browser, and Node. See [ADR-068](../../../docs/architecture/adr/068-cross-platform-ui-logic-package.md).

Only genuinely identical, dependency-free logic lives here. Platform-specific pieces (React Native
token palettes, Tailwind class names, flag assets, the country catalogue, region-vs-locale detection)
stay in each app's own `lib/`.

## Public API

### `loading-state` (§32.7 / ADR-055)

- `clampProgress(progress?: number): number | null` — clamp to 0–100; `null` when indeterminate.
- `isDeterminate(progress?: number): boolean`
- `formatPercent(progress?: number): string | null` — e.g. `"42%"`.
- `progressWidth(progress?: number): string | null` — bar fill width, e.g. `"42%"`.
- `accessibilityLabel(label?: string, progress?: number): string | null`

### `phone` (§20.6.1 Path A)

- `DEFAULT_COUNTRY_ISO2: 'th'`
- `toE164(dialCode: string, nationalNumber: string): string` — strips separators + leading trunk `0`.

## Dependencies

None (zero runtime dependencies — this is a hard constraint; see ADR-068).

## Configuration

None. Build emits `dist/` via `pnpm --filter @cos/ui-logic build` (required before Metro bundles the
mobile app, which consumes this package's `dist/` via a `file:` dependency).

## Usage

```ts
import { toE164, clampProgress } from '@cos/ui-logic';

toE164('+66', '081-234-5678'); // "+66812345678"
clampProgress(150); // 100
```

Consumers re-export these from their local `lib/loadingState.ts` / `lib/countries.ts`, so component
import paths are unchanged.
