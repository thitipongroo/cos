# 053: react-native-gesture-handler for the mobile TaskCard swipe interaction

**Date:** 2026-07-07
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** mobile

---

## Context

§32.7 specifies a `<TaskCard />` core component that is **swipeable (swipe-right = done)**. The mobile
tasks screen (`apps/mobile/src/app/(app)/tasks.tsx`) implemented task completion via a detail view with
a numeric progress input — functional, but without the swipe-to-done gesture (gap G-M8). React Native
has no built-in swipe primitive; `react-native-gesture-handler` (RNGH) is the standard Expo-supported
library and ships `Swipeable`. It was present transitively (via Expo/react-native) but not a direct
dependency, and the app had no `GestureHandlerRootView` at the root (required for RNGH to work).

## Decision

Add **`react-native-gesture-handler`** (SDK-56 bundled version `~2.31.1`, from
`expo/bundledNativeModules.json`) as a direct mobile dependency, wrap the root layout in
`GestureHandlerRootView`, and build a `TaskCard` component using RNGH's `Swipeable`: swipe-right reveals
a "Done" action that completes the task; a tap still opens the progress-detail view. Used by the tasks
list.

## Rationale

- RNGH is the first-party, Expo-supported gesture library; `Swipeable` covers swipe-to-action without
  requiring direct Reanimated code. Version pinned from `bundledNativeModules.json`, not guessed.
- Keeping the tap→detail path preserves the accessible single-tap alternative to the swipe gesture
  (WCAG 2.5.7, §20.8) — swipe is an enhancement, not the only way to complete a task.

Alternatives rejected: hand-rolled `PanResponder` swipe (reinvents RNGH, more bug-prone); leaving
detail-only (does not satisfy the §32.7 TaskCard swipe spec).

## Consequences

### Positive

- §32.7 TaskCard swipe-to-done delivered; reusable swipeable card for future lists.

### Negative

- Promotes a transitive dep to a direct one; requires `GestureHandlerRootView` at the root (added) and a
  dev-client/EAS rebuild.

### Neutral

- Reanimated remains a transitive/peer dependency; no direct Reanimated code is introduced.

## References

- Spec §32.7 (`<TaskCard />`), §20.8 (WCAG 2.5.7 dragging alternative)
- ADR-046 (Expo 56), ADR-048 (Drizzle offline DB); gap G-M8
