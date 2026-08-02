---
title: 'Screen reader checklist — manual accessibility pass'
last_updated: 2026-08-03
---

# Screen reader checklist

## Why this exists

Automated scanning finds roughly a third of WCAG failures. The three gates the project runs —
`eslint-plugin-jsx-a11y`, the Lighthouse accessibility category, and axe via Playwright — all check
the same kind of thing: whether the markup _has_ a name, a role, a contrast ratio. None of them can
tell you whether the name is **useful**, whether focus lands somewhere **sensible**, or whether an
error is announced **at the moment it matters**. Those are what this pass is for.

Run it before any release that changes a form, a dialog, or a navigation structure. Nothing here is
automatable; if an item ever becomes automatable, move it into `tests/e2e/specs/a11y.spec.ts` and
delete it from this file.

## Scope — the five critical flows

Spec §20.8 makes the pass mandatory on exactly these, and makes it a shipping gate: _"a screen
cannot ship if it fails automated a11y lint or lacks the screen-reader pass for a critical flow."_

| #   | Flow            | Web                                   | Mobile (`apps/mobile`)                |
| --- | --------------- | ------------------------------------- | ------------------------------------- |
| 1   | Login           | `/login`, `/login/otp`, `/post-login` | `app/(auth)/`                         |
| 2   | Daily report    | `/site/reports/new`                   | `app/(app)/report.tsx`, `reports.tsx` |
| 3   | Issue           | `/site/issues`, `/site/issues/new`    | `app/(app)/issues.tsx`                |
| 4   | Safety incident | `/safety/incidents`                   | `app/(app)/incidents.tsx`             |
| 5   | Sync status     | offline indicator in the shell        | `app/(app)/sync-queue.tsx`            |

Sections A–E below apply to each flow on web; section F to each flow on mobile.

## Tools

| Platform | Screen reader     | How to start                                         |
| -------- | ----------------- | ---------------------------------------------------- |
| Web      | VoiceOver (macOS) | `Cmd+F5`; navigate with `Ctrl+Opt+←/→`               |
| Web      | NVDA (Windows)    | `Ctrl+Alt+N`; navigate with arrows, `Insert+F7` list |
| iOS      | VoiceOver         | Settings → Accessibility → VoiceOver                 |
| Android  | TalkBack          | Settings → Accessibility → TalkBack                  |

Test with **one desktop and one mobile** reader per pass. NVDA and VoiceOver disagree often enough
that passing only on macOS is not evidence the Windows site users have a working experience.

## A. Every page

- [ ] The page title announced on load identifies the page, not just "Construction OS".
- [ ] There is exactly one `<h1>`, and heading levels descend without skipping.
- [ ] `Insert+F7` (NVDA) / rotor (VoiceOver) lists landmarks: navigation, main, contentinfo.
- [ ] A "skip to main content" link is the first focusable element and actually moves focus.
- [ ] Tab order follows visual order; nothing focusable is reachable only by mouse.
- [ ] The focus ring is visible on every focusable element, including on dark surfaces.
- [ ] Nothing is announced twice (a common symptom of `aria-label` duplicating visible text).

## B. Language and locale (QM-3)

The app ships th/en and the default is Thai.

- [ ] `<html lang>` changes when the locale switches — a screen reader reading Thai text with an
      English voice is unintelligible, and this is invisible to every automated check.
- [ ] The language switcher announces the **current** locale, not just the word "Language".
- [ ] Buddhist Era dates are announced as dates, not as a run of digits.
- [ ] With `ar-SA` forced, layout mirrors and reading order follows the mirrored layout.

## C. Forms

Check on `/site/issues/new` and `/site/reports/new` — the two most field-dense forms.

- [ ] Every input announces a label. Placeholder-only fields fail: the placeholder disappears on
      input, leaving the field unnamed mid-typing.
- [ ] Required fields announce as required before the user types, not only after a failed submit.
- [ ] On failed submit, focus moves to the first invalid field and its message is announced.
- [ ] Error messages are associated (`aria-describedby`), so tabbing back to the field re-announces
      the error rather than only the label.
- [ ] The error summary, if present, is a `role="alert"` or a focused live region — a silently
      updated `<div>` of errors is announced by nothing.
- [ ] Selects and comboboxes announce the number of options and the highlighted option.
- [ ] Date pickers are operable from the keyboard alone, and announce the Buddhist Era year.
- [ ] Submitting announces success or failure. A spinner that changes to a checkmark with no live
      region leaves a screen reader user with no idea whether the report was saved.

## D. Dialogs and overlays

- [ ] Opening moves focus into the dialog; closing returns it to the trigger.
- [ ] Focus is trapped while open — Tab from the last element wraps to the first.
- [ ] `Esc` closes, and the underlying page is inert (not reachable by the virtual cursor).
- [ ] The dialog announces its own title on open.

## E. Tables and lists

- [ ] Data tables announce column headers when moving across cells.
- [ ] Sortable columns announce their sort state and that they are actionable.
- [ ] Empty states announce something. A table that renders zero rows and says nothing is
      indistinguishable from a table that failed to load.
- [ ] Pagination announces the current page and the total.

## F. Mobile (`apps/mobile`)

24 of the 50 screens with tappable elements currently have no accessibility props at all —
`scripts/a11y/check-rn-a11y.sh` lists them. Prioritise those.

- [ ] Every `Pressable`/`TouchableOpacity` announces a name and the role "button".
- [ ] Icon-only buttons have an `accessibilityLabel` — TalkBack otherwise announces "button" alone.
- [ ] Swipe order matches visual order.
- [ ] Photo capture and annotation are operable without sight, or offer an accessible alternative.
- [ ] Offline/sync state changes are announced, not only shown as a colour change.
- [ ] Text scales with the OS font-size setting, and nothing is clipped at the largest step.

## G. Recording a pass

Record in the release ticket: date, app version, which two readers, and every failure with its
screen and a one-line description. A pass with no findings is a suspicious result — note what was
covered so the next person knows what was not.

## Known gaps

- No screen-reader pass has been recorded yet; this checklist is new as of 2026-08-03.
- Contrast on mobile is unmeasured (see `contrast-report.md` § Not covered).
- WCAG 1.4.11 non-text contrast (focus rings, icon borders, 3:1) is not audited by any gate here.
