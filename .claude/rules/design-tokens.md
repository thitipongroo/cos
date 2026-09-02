---
paths:
  - "apps/web/**"
  - "apps/mobile/**"
  - "packages/@cos/ui-logic/**"
  - "mockup/**"
  - "docs/screens/**"
---

# Design Tokens

Indexed in: `context/00_master_construction_os.md` §CROSS-CUTTING SPECIFICATIONS

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.7`

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND IDENTITY (FINAL — approved)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Brand name:   CONSTRUCTION OS
Product name: COS (short form — favicon, app icon, monogram)
Logomark:     Hexagonal geometry mark with 3 stacked infrastructure bars
              Bottom bar: split — AI cyan (left 1/3) + white (right 2/3)
              Represents: modular architecture + infrastructure layers + AI layer
Tagline:      "AI-Native Construction Platform"
              Style: 11px, uppercase, letter-spacing 3.5px, Steel gray #64748B

Personality:  Industrial · Intelligent · Enterprise · AI-native · Mission-critical
Positioning:  Palantir / Datadog / Linear aesthetic — NOT construction contractor

Avoid in all visual work:
  ✗ Building/crane/hard hat/blueprint/gear icons
  ✗ Orange/amber color (not in approved palette)
  ✗ Rounded playful shapes
  ✗ Gradients or glow effects

  TWO EXCEPTIONS to the gradient/glow rule — both because no project data is on screen yet:
    1. Pre-auth entry screens (login, OTP verify, verification overlay, Privacy Policy) —
       rotating gear, `architecture` mark, cyan glow. PO decision 2026-07-16; Privacy Policy
       added by PO decision 2026-08-03 (reached from the login footer, so still pre-auth).
       THIS LIST IS NOT "every pre-auth screen". The Terms of Use and Support Centre
       routes (2026-08-09) are pre-auth, are pinned dark like the rest, and ship with NO
       glow — they are opened FROM an entry screen rather than being one. Adding a
       pre-auth screen does not add it here.
       SUPPORT CENTRE IS NO LONGER PRE-AUTH ONLY (PO decision 2026-08-17): it gained a
       POST-AUTH twin at app/(app)/support.tsx, opened by the TopBar "?" — which until
       then showed a "coming soon" note, because AuthGate bounces a signed-in user out
       of the (auth) group and the only Support route lived there. The line above still
       holds for the PRE-AUTH route, which keeps its pinned dark surface and no glow.
       The post-auth twin follows the USER'S THEME, exactly like app/(app)/privacy-policy
       .tsx (PO 2026-08-04) — pinning is a property of the pre-auth surfaces only, so a
       screen having a pre-auth copy never makes its post-auth copy dark. The two are not
       the same screen either; the split is authoritative in spec §32.7
       "Support Centre — two routes".
    2. <LoadingState /> `ai` variant only — cyan glow; unmounts the moment data renders.
       PO decision 2026-07-17; ADR-055. THE REST OF THE MOTIF IS PER PLATFORM (PO 2026-08-17):
       mobile adds a scan-line + waveform (mockup/mobile/00_loading C), web adds a pulsing
       processor plate + ping dot and has NEITHER (mockup/desktop/imp_002_… C). One component,
       two drawings — do not port one platform's pair onto the other. Spec §32.7 Exception 2.
  Everywhere the signed-in app shows project data, the prohibition holds.
  Amber stays a semantic warning token — only its use as a *brand* colour is prohibited.
  Authoritative: spec §32.7 "Exception 1 / Exception 2".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND COLOR TOKENS (global — web/PWA + mobile)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Source: construction_os_wordmark_brand_palette_v_1.md §5

  --cos-navy:         #0B1020   Infrastructure Core — wordmark, headers, dark UI
  --cos-blue:         #2563EB   System Blue — CTAs, active states, navigation (desktop)
  --cos-cyan:         #06B6D4   AI Cyan — AI modules, insights, event highlights
  --cos-gray:         #64748B   Steel Gray — secondary text, borders, inactive states
  --cos-white:        #F8FAFC   Concrete White — page backgrounds, surfaces, reports

Dark theme tokens (source: brand_palette §6):
  --cos-dark-bg:          #020617   Page background — AND the mobile <TopBar /> (PO decision
                                    2026-08-06, reversing the 2026-07-16 rule that put chrome "on a
                                    surface background distinct from the content area").
                                    --cos-dark-surface is the CARD colour, so chrome drawn in it read
                                    as a card welded to the edge of the screen. Source: mockup/mobile/
                                    04_tenant_admin/01_home/01_home_dashboard/code.html — header is
                                    `bg-surface dark:bg-dark-bg`, and with <html class="dark"> +
                                    darkMode:"class" the dark: utility wins on SPECIFICITY (.dark
                                    .dark\:bg-dark-bg = 2 classes) over the 1-class utilities, so
                                    source order does not decide it. Light is unaffected — there `bg`
                                    is the grey page and `surface` the white card, already distinct.
  --cos-dark-surface:     #0F172A   Card / panel surface
  --cos-dark-surface-container:
                          #102034   The mobile <MobileNav /> bottom bar, and ONLY it (added
                                    2026-08-06, PO decision). The two bars deliberately DIFFER: the
                                    nav is `bg-surface-container dark:bg-surface-container` — same
                                    value both modes — plus rounded-t-xl + top border, i.e. a raised
                                    sheet, while the header is flat against the page. The set had no
                                    token meaning "chrome sheet", which is why the nav sat on the card
                                    colour. Recounted 2026-08-08 over all 321 mockup/mobile/**
                                    code.html: 312 define surface-container as #102034, 5 as
                                    #0F172A, and four are one-offs (#12182b, #141d2b, #1a2238,
                                    #1e293b). Previous figures (217 / 5) were counted on 2026-08-06
                                    against 226 files and went stale as the mockup set grew.
  --cos-dark-elevated:    #111827   Elevated modal / dropdown surface
  --cos-dark-text:        #F8FAFC   Primary text
  --cos-dark-muted:       #94A3B8   Secondary text / inactive
  --cos-dark-blue:        #2563EB   Accent blue (same as light)
  --cos-dark-cyan:        #22D3EE   AI cyan (lighter for dark bg contrast)
  --cos-dark-success:     #10B981   Success state
  --cos-dark-warning:     #F59E0B   Warning state
  --cos-dark-danger:      #EF4444   Error / danger state
  --cos-dark-accent:      #4CD7F6   Accent ON dark bg — icons, eyebrows, card titles, tags
                                    (added 2026-08-06, ACCESSIBILITY not style: --mobile-primary
                                    #0066FF is 4.17:1 on --cos-dark-bg — passes 3:1 for a non-text
                                    control, FAILS the 4.5:1 AA text threshold that §20.8 gates on.
                                    #4CD7F6 is 11.87:1. CTAs KEEP --mobile-primary: a filled button
                                    puts blue behind white text, so contrast is the button's.)
  --cos-dark-outline:     #46464C   Card / input border on dark surfaces (added 2026-08-06). This is
                                    the MINORITY mockup value and is kept on purpose (PO decision
                                    2026-08-07): recounted 2026-08-08 over all 321 mockup/mobile/**
                                    code.html, outline-variant is #434655 in 186 files and #46464C in
                                    126, with #334155 in 4 and four one-offs; 1 file declares none.
                                    (Was 189 / 28 on 2026-08-06 against 226 files — the minority is
                                    now much larger, but still the minority, so the ruling stands.)
                                    The spec once
                                    justified it as "the value the mockups use" — untrue, and that
                                    sentence is gone. (70,70,76) vs (67,70,85): the neutral grey reads
                                    as an EDGE on a navy surface where the bluer one blends in, which
                                    is why the translucent glow was replaced at all. It is also every
                                    card/row/chip/chrome hairline in the dark app — 16,504 px in
                                    01-identity.png alone — so changing it invalidates every dark
                                    capture for 9 points of blue. See §32.7 before "correcting" it.
                                    Before this the set had NO outline token and borders were
                                    invented per call site — mobile had drifted to
                                    rgba(148,163,184,0.24), a glow rather than an edge.
                                    Value is the outline-variant used by mockup/mobile/**.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOBILE COLOR TOKENS (field app — React Native)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Source: MOBILE_UX_GUIDELINES.md — optimized for outdoor sunlight visibility

  --mobile-primary:          #0066FF   Bright blue (outdoor visibility)
  --mobile-success:          #00C853   Confirmation green
  --mobile-warning:          #FF9500   Caution orange
  --mobile-danger:           #FF3B30   Urgent / delete red
  --mobile-bg:               #FFFFFF   Background
  --mobile-surface:          #F5F5F5   Card surface
  --mobile-surface-elevated: #FFFFFF   Elevated card
  --mobile-text-primary:     #1C1C1E   Primary text
  --mobile-text-secondary:   #6C6C70   Secondary text
  --mobile-text-tertiary:    #AEAEB2   Hint text
  --mobile-offline:          #8E8E93   Offline indicator
  --mobile-syncing:          #FFD60A   Syncing indicator
  --mobile-synced:           #00C853   Synced indicator

DESIGN DECISION — Mobile primary vs brand blue:
  --mobile-primary #0066FF ≠ --cos-blue #2563EB (intentional, not a conflict)
  Rationale: field workers use the app in direct sunlight — #0066FF has higher
  outdoor visibility than #2563EB. Desktop/web uses --cos-blue for brand consistency.
  Rule: use --mobile-primary for tap targets and CTAs in React Native only.
        use --cos-blue for all web/PWA (Next.js) surfaces.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPOGRAPHY TOKENS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Brand font (source: brand_palette §7):
  Primary:     Inter Tight
  Package:     @fontsource-variable/inter-tight (via npm — add to web/PWA)
               React Native: expo-font with Inter Tight from Google Fonts
  Fallback:    Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif
  Weight used: 400 (body), 500 (labels/UI), 600 (headings), 700 (wordmark OS)

Mobile typography scale (source: MOBILE_UX_GUIDELINES.md):
  --mobile-text-hero:    28px   Page titles
  --mobile-text-title:   22px   Card titles
  --mobile-text-body:    17px   Body text (iOS standard)
  --mobile-text-caption: 15px   Metadata
  --mobile-text-label:   13px   Input labels
  --mobile-line-normal:  1.5
  --mobile-line-tight:   1.3

Web/Desktop typography scale:
  Font: Inter Tight (already decided) — same as brand
  Base unit: 14px (compact for enterprise SaaS dashboards — Linear, Notion standard)

  --web-text-display:  32px / weight 700   Hero numbers, project budgets
  --web-text-h1:       24px / weight 600   Page titles
  --web-text-h2:       20px / weight 600   Section headers, card titles
  --web-text-h3:       16px / weight 500   Sub-section headers, table headers
  --web-text-body:     14px / weight 400   Default body, table content (dashboard standard)
  --web-text-small:    12px / weight 400   Metadata, timestamps, secondary labels
  --web-text-tiny:     11px / weight 400   Badges, footnotes, fine print

  --web-line-display:  1.2
  --web-line-heading:  1.3
  --web-line-body:     1.6
  --web-line-small:    1.5

  Tailwind config mapping (theme.extend.fontSize — named token utilities, as implemented):
    text-display(32/700) text-h1(24/600) text-h2(20/600) text-h3(16/500)
    text-body(14/400)    text-small(12/400) text-tiny(11/400)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPACING TOKENS (mobile — source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  --mobile-space-xs: 8px    Icon padding
  --mobile-space-sm: 12px   Card internal padding
  --mobile-space-md: 16px   Section padding
  --mobile-space-lg: 24px   Screen edge padding
  --mobile-space-xl: 32px   Major section separation

  Mobile border radius (added 2026-08-05, corrected 2026-08-06 — TIGHTER THAN WEB, from the mockups):
  --mobile-radius-sm:   2px   Chips, inline tags, small status pills
  --mobile-radius-md:   4px   List rows, icon tiles, accordion items, BUTTONS
  --mobile-radius-lg:   8px   Cards, inputs
  --mobile-radius-xl:  12px   Hero / summary cards, emphasised panels
  --mobile-radius-2xl: 16px   Dashed closing panel (left at Tailwind's default in the mockups)
  EVERY status pill / badge takes xl 12px — one token, no exceptions. The mockups DISAGREE: counted
  2026-08-08 over all 321 mockup/mobile/**/code.html, 155 keep rounded-full at 9999px (154 declare it,
  1 omits `full` and inherits Tailwind's default) and 146 override it to 0.75rem = 12px; the remaining
  20 ship no borderRadius config at all. (Was 153 / 52 of 226 on 2026-08-06 — the 12px family has
  grown from a fifth of the set to nearly half as the mockups expanded, which strengthens rather than
  weakens the ruling.) This is a platform ruling, not a reading, and
  it costs nothing: these badges are 18-26px tall, so 12px is at or within 1px of a capsule and the
  two families were never apart on screen. 999 stays for circles only (avatars, status dots, radio
  marks, round icon plates) where the radius is half the width, off this scale entirely.

  Card body length (added 2026-08-06): a card's detail text renders at most THREE lines and
  truncates with an ellipsis. Two layers — CARD_BODY_LINES=3 + ellipsizeMode="tail" in
  TransparencyKit is the runtime guarantee (holds under Thai, larger system fonts, narrow
  handsets); a 140-character budget on *Body / *.body / *.desc i18n keys, tested by
  cardBodyLength.spec.ts, is the editorial rule that stops the clamp ever firing. 140 = three lines
  at the 42-48 chars/line a card body gets between a 44px icon tile and a chevron. Truncation is a
  SAFETY NET: an ellipsis on a transparency screen hides what the reader opened it for. 17 bodies
  were over budget when the rule landed (retentionBody was 306 chars = 5 lines); all were shortened,
  none clamped. Does NOT apply to user- or API-supplied text.

  A heading is stated once (added 2026-08-06, PO approval): a card directly under a SectionLabel
  does not repeat that label as its own title, so InfoCard's `title` is OPTIONAL. Eight pairs
  shipped reading the same i18n key twice — delete.why, delete.how, identity.access, iot.note,
  location.where, logs.retention, network.retention, portal.rights — giving "HOW LONG THIS IS KEPT /
  How long this is kept" on seven screens. The mockups head a section once. Both elements set
  accessibilityRole="header", so the duplicate was also announced twice in a row. A card that is one
  of SEVERAL in a section KEEPS its title: there it names the card, not the section. Held by
  headingStutter.spec.ts, which scans screen SOURCE — a redundantly-titled card renders perfectly,
  so no render test can see it.

  HOW FAR MOCKUP AUTHORITY RUNS (ADR-085, 2026-08-06). Mockups are authoritative for STYLE — radius,
  colour, spacing, alignment, badge shape, copy length — and a difference there is a bug in the code.
  They are NOT authoritative for COMPOSITION. Where a screen's structure has outgrown its mockup, the
  IMPLEMENTED STRUCTURE STANDS; a drawing does not remove reviewed working capability. Examples on
  record: the user list keeps its search, role filter chips and audit card (the mockup has none of
  them); the transparency hub keeps navigation rows rather than the mockup's accordion, whose
  contents — biometric hash, 500m geofence, employee ID, "real-time" sync — this platform does not
  have. EVERY structural deviation carries its reason in the screen's header comment; an unrecorded
  one cannot be told apart from an oversight, which is how the hub's rows were flagged as a gap when
  they were correct. Mockup files are NOT edited to match — that would erase the record of what was
  originally specified.

  mobile-radius-lg 8px =/= web-radius-lg 12px. Shared names, different values, held at different
  distances — do NOT harmonise them. Source: mockup/mobile/**/code.html overrides Tailwind
  borderRadius to lg 0.25rem / xl 0.5rem (full varies as counted above).
  Before 2026-08-05 mobile had NO radius token while web did, so each RN component invented its own:
  253 literals in 56 files using 21 distinct numbers. The 2026-08-06 sweep took that to 28 and
  theme/__tests__/radiusRatchet.spec.ts holds the count so it can only fall. SQUARE ICON PLATES
  (tinted glyph tiles, avatar boxes, logo boxes) are neither on the scale nor circles: a plate >=28px
  takes plateRadius(side) = round(side/4) so the corner scales with the plate; below 28px it takes
  md; round means HALF the width, a different shape. What remains after that is circles plus ONE
  named exception — the bottom-nav active-tab highlight at 20, neither a square plate nor a capsule.

Web/Desktop spacing scale:
  Base unit: 4px (industry standard — compatible with Tailwind's default scale)

  --web-space-1:   4px    Icon-to-text tight gap
  --web-space-2:   8px    Inline element gaps, icon padding
  --web-space-3:  12px    Form field internal padding
  --web-space-4:  16px    Base: card internal padding, standard gaps
  --web-space-5:  20px    Between form fields
  --web-space-6:  24px    Card padding, section internal gap
  --web-space-8:  32px    Between cards/components
  --web-space-10: 40px    Section separation
  --web-space-12: 48px    Major page section gap
  --web-space-16: 64px    Page-level gap, hero sections

  Border radius:
  --web-radius-sm:  4px   Tags, badges
  --web-radius-md:  8px   Inputs, buttons
  --web-radius-lg: 12px   Cards, modals
  --web-radius-xl: 16px   Large panels

  Tailwind mapping: p-4=16px, p-6=24px, gap-2=8px, gap-4=16px (default 4px scale = --web-space-*)
  Radius (theme.extend.borderRadius → --web-radius-*): rounded=4px(sm) rounded-md=8px rounded-lg=12px rounded-xl=16px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOUCH TARGET STANDARDS (mobile — source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Primary button:    min 44px, recommended 52px
  Secondary button:  min 44px, recommended 48px
  Icon button:       min 44px (WCAG AAA)
  List item:         min 52px, recommended 60px
  Form input:        min 48px, recommended 52px
  Checkbox/radio:    tap area min 44px (visual 24–28px)
  Spacing between targets: 8px minimum

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFORMANCE TARGETS (mobile — source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Initial load:       < 2s (max 3s)
  Action feedback:    < 100ms (max 200ms)
  Photo capture:      < 500ms (max 1s)
  Form submission:    instant (optimistic UI)
  Background sync:    automatic with manual fallback
  Daily report goal:  < 2 minutes end-to-end

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOBILE COMPONENT LIBRARY (source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Core components (React Native — implement in apps/mobile/):
  <MobileNav />         Bottom navigation, exactly 4 items (PO 2026-08-04), icons + labels, no Profile tab
  <QuickActionCard />   60px min height, icon + label + badge, single tap. The TILE form, used on a
                        home screen (SITE_ENGINEER's four shortcuts). Not the menu form below.
  <QuickActionRow />    THE PROJECT'S QUICK-ACTION BUTTON (PO decision 2026-08-09). Every
                        quick-action MENU draws its actions with this and no other shape:
                        a coloured left accent strip, a tinted rounded-square icon plate, a title,
                        an uppercase subtitle saying what the action does, and a trailing glyph.
                        The accent is per-action and groups like with like — it is the caller's
                        signal, not decoration, and callers pass a palette colour, never a hex.
                        `variant="dark"` for modal hosts that stay dark on both themes (the Tenant
                        Admin quick-command overlay); omit it on ordinary screens, which follow the
                        user's theme. It began as that overlay's private ActionCard and was lifted
                        out when the Site Worker menu was told to match it: two menus drawing one
                        button two ways is a copy waiting to drift.
  <ProcurementInsight /> The manager dashboard's AI Insights panel (PO 2026-08-10). Renders ONLY
                        what /ai/reports/procurement-summary returns: the model's own text, its
                        `confidence`, and the required `low_confidence` verdict. Leads with a BAND
                        (lib/aiConfidence.ts) rather than a bare percentage, per Google PAIR's
                        guidance, using the band edges spec §33.8 already defines (0.9 / 0.7). The
                        endpoint is per-project, so the dashboard carries a <ProjectPicker /> and
                        the panel names the project its figures came from.
  <ProjectContextBar /> THE PROJECT'S "ACTIVE PROJECT" BAR (PO decision 2026-08-12). Every working
                        screen that belongs to one project opens with it, for EVERY role: a 6px
                        leading accent, a tinted `apartment` plate, an "ACTIVE PROJECT" eyebrow over
                        the project name and its building, and a 44pt switch button at the trailing
                        edge. Tapping anywhere on it opens <SelectProjectSheet />; the button is a
                        target, not a second action. Renders NOTHING when no project is chosen —
                        that state means the picker has not been answered yet, and the picker is
                        already over the user.
                        The shape is the restructured SITE_ENGINEER set's, which draws the same bar
                        on all four of its screens (01_home/01_se_home_dashboard · 03_tasks/
                        01_se_tasks · 04_reports/04_se_reports); it replaced the Site Worker
                        drawing's location-pin line so that one question is not answered two ways in
                        one product. EYEBROW AND PLATE GLYPH TAKE --cos-dark-accent, NOT the
                        drawings' --mobile-primary: unfilled text and icons on a dark surface must
                        clear 4.5:1 themselves and #0066FF is 4.17:1 there (§20.8). The 6px strip
                        keeps primary — nobody reads a bar of colour.
  <SelectProjectSheet /> The project picker OVERLAY, and the project's one project-selection shape
                        (PO decision 2026-08-12): a centred card on a dimmed backdrop, always
                        closeable, never a route. Source drawings: 05_site_worker/01_home/
                        00_sw_project_selection and 03_site_engineer/01_home/00_project_selection.
  <OverlaySyncPill />   The LABELLED sync pill an overlay's own top bar carries (PO 2026-08-09).
                        Distinct from <SyncPill />, which is glyph-only because the shared TopBar
                        also holds the brand and two icon buttons; a full-screen overlay has room
                        for the word, and the quick-action mockups draw it. Same four states and
                        precedence as every other sync indicator — and since 2026-08-20 that is
                        enforced rather than asserted: both pills read useSyncPillView, so the
                        precedence exists once and only the presentation is each pill's own.
  <PhotoCapture />      Camera + gallery grid, inline annotation, offline queue
  <VoiceNoteButton />   Hold-to-record, waveform animation, auto-transcription
  <SyncPill />          Top-bar glyph carrying EVERY sync state, offline included.
                        States: error > syncing > pending > synced. Offline is NOT a
                        separate state — it PRODUCES pending (writes enqueue), and
                        offline with an empty queue genuinely is synced.
                        OfflineBanner deleted 2026-08-06 (PO): two indicators of one
                        subject in one shell, and the red strip pushed pages down.
                        SYNCED IS cloud-done, APP-WIDE (PO 2026-08-06, reaffirmed
                        2026-08-20). check-circle is the rejected option: one state
                        may not have two glyphs, and a cloud says WHERE the work is —
                        on the server — which a tick leaves open. <OverlaySyncPill />
                        had drawn the tick from 01_quick_action_menu's "✓ SYNCED"
                        since it was extracted; a mockup is authoritative for style,
                        not for what a symbol means (ADR-085). The drawer and the
                        sync queue already drew the cloud. Held by useSyncPillView,
                        where it is a constant rather than a caller's choice.
  <TaskCard />          Swipeable (swipe-right = done), status badge, photo count
  <StatusChip />        Visual status: Todo / InProgress / Done / Syncing / Synced
  <OptimisticList />    Instant UI update, rollback on failure, retry option
  <LoadingState />      Loading placeholder / progress. Presentational only — caller owns
                        `progress` (0–100, omit = indeterminate) and `label` (pre-translated).
                        Mobile variants: widget | list | ai | micro (no `table` — see below).
                        Web variants:    widget | table | ai | micro (no `list`).
                        `tone="onPrimary"` (mobile, micro only) for a loader inside a
                        primary-filled button — the default ink is that button's own fill.
                        A DETERMINATE LOADER FINISHES ITS RUN before it is replaced: the bar is
                        driven to 100 and held one fill duration, then <LoadingBoundary />
                        crossfades to the content (PO 2026-08-17). Indeterminate holds 0ms.
                        Full contract: spec §32.7 "Loading State"; ADR-055.

Form components:
  <LocationPicker />    Map + auto-detect GPS

  NOTE (reconciliation): <MobileInput />, <NumberPicker />, and <IconPicker /> were removed —
  §32.7 Mobile Core Component Library (docs/specifications/32) is the authoritative component
  set and does not define them. Per world-class mobile practice, plain TextInput primitives cover
  MobileInput, scroll-wheel NumberPickers are discouraged for construction quantity entry, and
  IconPicker is not a core component. Category selection is handled inline per screen.

DO NOT implement on mobile:
  ✗ Tables → use cards instead
  ✗ Navigation deeper than 3 levels
  ✗ Modal on modal → use bottom sheets
  ✗ Dropdowns with 50+ items → add search
  ✗ Complex charts → simplify or desktop-only
  ✗ Hover states → use press states

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REACT NATIVE DARK MODE TOKENS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  React Native uses JavaScript StyleSheet objects (no CSS variables)
  Note: --mobile-primary stays #0066FF in dark mode (self-lit screen = still outdoor use)

  DarkTheme = {
    background:   '#020617',   Page background
    surface:      '#0F172A',   Card, bottom sheet surface
    elevated:     '#111827',   Modal, dropdown surface
    border:       '#1E293B',   Dividers, card borders
    text: {
      primary:    '#F8FAFC',   Main text
      secondary:  '#94A3B8',   Labels, metadata
      tertiary:   '#64748B',   Placeholders, hints
    },
    primary:      '#2563EB',   Brand blue (buttons, active states)
    fieldPrimary: '#0066FF',   Field worker interactive elements (outdoor visibility)
    accent:       '#22D3EE',   AI features, highlights
    success:      '#10B981',
    warning:      '#F59E0B',
    danger:       '#EF4444',
    offline:      '#475569',   Offline indicator text
    syncing:      '#D97706',   Syncing badge
    synced:       '#059669',   Synced badge
  }

  Usage in React Native:
    const { colors } = useTheme()  — expo-navigation theme provider
    style={{ backgroundColor: colors.surface }}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WEB TOKEN WIRING (Next.js — apps/web) — REQUIRED, else nothing renders styled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Defining the tokens above is NOT enough — the Tailwind/PostCSS pipeline must be
wired or every page renders unstyled (utility classes match no compiled CSS).
This was the actual failure mode once. Required files (all must exist):

  apps/web/postcss.config.js     plugins: tailwindcss + autoprefixer (Next auto-loads it)
  apps/web/tailwind.config.js    content: ['./src/**/*.{ts,tsx,js,jsx}']; darkMode: 'class';
                                 theme.extend maps tokens (colors cos.*, borderRadius sm/md/lg/xl,
                                 fontSize display/h1/h2/h3/body/small/tiny, fontFamily sans = Inter
                                 Tight stack). Use extend so the default palette keeps working.
  apps/web/src/app/globals.css   @tailwind base/components/utilities + :root{ --cos-* / --web-* }
                                 + .dark{} overrides (dark-theme tokens)
  apps/web/src/app/layout.tsx    import '@fontsource-variable/inter-tight' then
                                 import './globals.css'  (global CSS only loads from a layout)

  Spacing: do NOT override — Tailwind default 4px scale already equals the --web-space-* tokens.
  Verify: a production-style build emits non-empty utility CSS (compiling globals.css yields >0 bytes).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOBILE TOKEN WIRING (React Native + Expo — apps/mobile) — REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RN has no CSS variables — the --mobile-* tokens must be a typed module, the brand
font loaded via expo-font, and components must reference the theme (not hardcode).

  apps/mobile/src/theme/tokens.ts   export colors (--mobile-*), typography (hero/title/body/
                                    caption/label), spacing (xs–xl), touchTarget, fontFamily
                                    (InterTight_400Regular/500Medium/600SemiBold/700Bold)
  Brand font                        add expo-font + @expo-google-fonts/inter-tight; useFonts(...)
                                    in app/_layout.tsx, hold render until fontsLoaded
  Components                        use colors.* / fontFamily.* — never hardcode hex or fontWeight
                                    (select weight via fontFamily with custom fonts)
  app.json (or app.config.js)       MUST exist with expo-router + expo-font plugins and
                                    main: 'expo-router/entry', or the app never boots / fonts never load

  Do NOT reuse web --cos-* on mobile: --mobile-primary #0066FF ≠ --cos-blue #2563EB (by design).
  Verify: apps/mobile type-checks and components import theme/tokens (no hardcoded hex).

```
