# Disruption Strategy — Construction OS (COS)

> **Status:** research + strategy document — NOT an architecture spec; nothing here overrides
> `docs/specifications/`. **Companion docs:** [`competitive-landscape.md`](competitive-landscape.md),
> [`distribution-playbook.md`](distribution-playbook.md), [`kanna-competitive-analysis.md`](kanna-competitive-analysis.md).
> **Date:** 2026-07-14. **Question answered:** *how does COS **disrupt** (displace / take share from)
> these competitors* — not how to out-feature them, and not distribution (that is the companion doc).
>
> **Evidence discipline:** 📊 = cited fact (from the companion research docs) · 📋 = strategic judgment
> (reasoned, not a fact) · ⚠️ = risk / UNVERIFIED / spec-gap. **Spec-status tags** on the product bets
> were checked against `docs/specifications/` + `context/` on 2026-07-14 (grep-verified).

---

## 1. Thesis

**COS disrupts by NOT playing the incumbents' game.** Beating Procore/KANNA/BUILK feature-for-feature is
*sustaining* innovation — and in sustaining fights the larger, better-funded, already-localized incumbent
wins. Disruption here is **new-market disruption of the non-consumer**: make a construction OS usable by
the Thai SME contractor who today can only use **LINE + Excel + paper**, using **AI-native** as the
disruptive technology and a **business-model flip** (free field layer; cost/finance as an automatic
by-product) that the incumbents structurally cannot copy without breaking their own model.

**The opening is real and evidenced** 📊: ~117,000 Thai construction companies, ~0.6% large, **~83% still
non-digital**, software TAM only ~US$16.8M behind a US$31–106B construction market; the true incumbent is
LINE + Excel + paper; adoption is cost-sensitive and bottom-up, blocked by "SMEs lack staff who can use
the tools" (see competitive-landscape §7 and distribution-playbook §1). Procore/Autodesk serve the
enterprise top; KANNA/BUILK reach only part of the SME base. **The non-consumer majority is the disruption
target.**

---

## 2. The disruption logic

1. **Target the non-consumer, not Procore's customer** 📋 — the small contractor who never adopted
   software because forms/BIM need staff they don't have. Winning here is invisible to the enterprise
   incumbents and beneath their cost structure to serve.
2. **AI-native is the disruptive technology** 📊📋 — the job-to-be-done is *"get the paperwork done,"* not
   *"fill in a form."* Every competitor bolts AI onto a form-based workflow (ANDPAD Stellarc, Novade AI,
   KANNA voice) or has none (BUILK). Inverting it — **talk / snap a photo / chat in Thai → AI produces the
   daily report, BOQ, PO, and cost entry** — turns the non-technical contractor into a full-OS user. That
   is what converts non-consumers; a better form does not.
3. **Business-model flip** 📊📋 — give the field/reporting layer away free (matching BUILK-free and
   KANNA-free-trial), and let **cost → procurement → finance emerge automatically from the workflow** (the
   transactional moat competitors lack). The SME gets profit/cost visibility Excel/BUILK/KANNA cannot
   produce — "free **and** does the thing they couldn't do." Monetize the transactional depth, not the
   field layer.
4. **Deliver where the non-consumer already is** 📊 — LINE-native (56M MAU), zero-install; localized around
   **ราคากลาง / e-GP** — a Thai-construction intelligence layer the internationals can't localize cheaply
   and the Japanese/BUILK don't build (see distribution-playbook §2.1, §2.6).

---

## 3. Why each incumbent cannot respond (innovator's dilemma, per competitor)

| Incumbent | Why COS can disrupt it / why it can't easily copy | Evidence |
| --- | --- | --- |
| **Procore / Autodesk** | Going down-market to the Thai SME + localizing (ราคากลาง, Thai UI) **cannibalizes their enterprise ACV/per-seat model** and requires localization they've deprioritized (Procore Thai UI = beta; Autodesk Thai UI = none). Classic incumbent's dilemma. | 📊 competitive-landscape §3.1–3.2 |
| **KANNA** | Its data model has **no vendor / PO / BOQ objects at all** (verified in-product); adding a transactional engine is a different product/company, not a feature. It also treats offline as a paid upsell. | 📊 kanna-competitive-analysis §0.4 |
| **BUILK** | DNA is a **materials-margin marketplace**; software is a loss-leader funnel. Becoming an AI-native, offline-first, BOQ-integrated OS is off-model, and it is tied to SCG. It has **no BOQ, no verified AI, no verified offline**. | 📊 competitive-landscape §2.2 |
| **ANDPAD** | The **most dangerous** — it already has transactional depth (procurement + cost) + the strongest AI (Stellarc) + Thai UI (Dec 2025). But its AI is **bolted onto a form workflow**, and it is Japan-first / Vietnam-office. COS must out-execute on *AI-native* + *Thai ground game* and *speed*, not assume it can't respond. | 📊 competitive-landscape §2.1 · 📋 |
| **Novade** | Enterprise field-ops with deep AI, but **no procurement/BOQ/cost/finance** and reseller-led in Thailand — a field-layer rival, not a transactional-OS one. | 📊 competitive-landscape §2.4 |

---

## 4. The product bets (trackable)

Each bet is a falsifiable hypothesis with a build, the disruption it creates, a **success metric**, its
**spec status** (grep-checked 2026-07-14), and a **kill criterion**. Metrics reuse COS's own spec targets
where they exist.

### BET A — "Talk, and the paperwork is done" (AI-native paperwork elimination) — **the core disruptive bet**

- **Hypothesis** 📋: if a non-technical Thai contractor can **speak / photograph / chat in Thai** and the
  AI produces the daily report, BOQ lines, PO, and cost entry, then the ~83% non-digital SME segment
  adopts — because the #1 barrier ("no staff who can fill forms/BIM") is removed. 📊 (barrier evidenced,
  competitive-landscape §7)
- **Build**: Thai voice/photo/chat capture → AI generates structured records (site report, BOQ item, PO,
  cost transaction) with HallucinationGuard + human-confirm-before-save. Field-first, LINE-native surface.
- **Disrupts**: KANNA/Novade (form-based field UX), BUILK (no AI), Procore/Autodesk (enterprise forms).
  They can't copy fast without re-architecting around AI-native capture.
- **Success metric** (leading → lagging): % of daily reports created with **zero typing** (voice/photo);
  **median report submit < 2 min** (COS Priority-1 target 📊); % of BOQ/PO/cost lines **auto-generated vs
  hand-entered**; activation rate of first-time non-technical users; AI report **p95 < 5s** (QM-6 📊).
- **Spec status** ⚠️ **PARTIAL / GAP**: Phase 11 RAG + Phase 12 AI Report Assistant + HallucinationGuard
  exist; voice notes exist but spec says **STT/transcription is a Stage-2 item** and voice/photo/chat →
  *auto-generate BOQ/PO/cost in Thai* is **not specified** (grep-verified: present only as report
  generation from data, not multimodal capture → transactional docs). **This is the biggest spec gap to
  close for the disruption thesis.**
- **Kill criterion**: if Thai voice/photo → correct BOQ/PO extraction accuracy is too low to trust (needs
  an eval-set target, e.g. field-usable ≥ some threshold), non-consumers won't switch — de-scope to
  assisted (not autonomous) generation.

### BET B — Thai construction intelligence layer (ราคากลาง + e-GP + SME-GP)

- **Hypothesis** 📋: if COS generates **ราคากลาง-compliant BOQ/estimates** (using free CGD Factor-F + MOC
  material-price open data) and helps SMEs win government work (THAI SME-GP 30% set-aside + 10% price
  edge; e-GP tender feed), then public-works SME contractors adopt for tangible ROI — a wedge **no
  competitor localizes**. 📊 (distribution-playbook §2.6)
- **Build**: ราคากลาง pricing source in the BOQ engine; THAI SME-GP eligibility/registration helper; e-GP
  open-data tender feed in-app.
- **Disrupts**: BUILK/KANNA/ANDPAD (no ราคากลาง BOQ), Procore/Autodesk (no Thai localization). Structurally
  hard for internationals to justify localizing.
- **Success metric**: # of ราคากลาง-compliant BOQs generated; # of SME-GP registrations assisted; # of gov
  tenders surfaced → bid → won; retention of public-works-contractor cohort.
- **Spec status** ⚠️ **GAP (not in spec at all)**: grep-verified — **no ราคากลาง / e-GP / SME-GP anywhere**
  in `docs/specifications/` or `context/`. Needs a product-owner spec decision (recommended in
  distribution-playbook §2.6; Phase 4 BOQ / Phase 5 procurement would host it).
- **Kill criterion**: if maintaining the CGD Factor-F methodology + monthly MOC price updates is too
  costly to keep current, scope to a lighter price-reference feature.

### BET C — Cost/finance as an automatic by-product + deep offline

- **Hypothesis** 📋: if cost → procurement → finance **emerge automatically** from the workflow
  (PR→RFQ→PO→delivery→invoice events), and it works offline with real conflict resolution, then SMEs get
  profit/cost visibility **Excel/BUILK/KANNA cannot produce** — the "free and does what they couldn't"
  hook. 📊 (the transactional moat; competitive-landscape §5–6)
- **Build**: procurement events auto-feed cost transactions and budget variance (Phase 5→7); offline-first
  sync with the spec's conflict strategies; financial precision (decimal, ราคากลาง-aware).
- **Disrupts**: KANNA (manual EVM, no transactional source), BUILK (no BOQ, unverified offline/AI),
  everyone on "cost is hand-keyed." **No competitor documents offline conflict resolution.** 📊
- **Success metric**: % of cost entries **auto-fed from procurement events** (vs manual); **offline sync
  success > 98%** (COS SLO 📊); conflict-resolution correctness on the test cases; budget-variance
  accuracy.
- **Spec status** ✅ **SPEC'D but UNPROVEN**: Phase 4 (BOQ), 5 (procurement state machines), 7 (finance),
  6/10 (offline + 3+ conflict strategies) all exist. ⚠️ Execution unproven — the transactional flows and
  offline conflict handling must actually ship and be demonstrated (and the QM-1 build gate must stay
  green — it was red earlier this session, now fixed).
- **Kill criterion**: if the procurement→cost auto-feed can't be made reliable, the "by-product" claim
  collapses into manual entry (= parity with BUILK, not disruption).

### BET D — LINE-native zero-install delivery (the non-consumer reach vehicle)

- **Hypothesis** 📋: delivering Bets A–C **inside LINE** (MINI App + OA) removes install friction for the
  non-consumer who lives on LINE. 📊 (LINE 56M MAU; distribution-playbook §2.1)
- **Build**: LINE MINI App (LIFF) + Official Account surface for capture/approvals/notifications; native
  RN app for heavier field use.
- **Success metric**: % of new signups via LINE; activation rate LINE vs app-store; D1/D7/D30 retention.
- **Spec status** ⚠️ **GAP**: COS spec defines Web (Next.js/Serwist) + React Native mobile; a **LINE MINI
  App surface is not specified**. Needs a decision (barrier: LINE certified-provider for verified status,
  per distribution-playbook §2.1).
- **Kill criterion**: if LINE MINI App constraints (LIFF limits, certified-provider gate) make the field
  UX too thin, keep LINE for capture/notifications only and route heavy work to the RN app.

> **Cross-cutting metric (the disruption is working when):** the share of COS's active users who are
> **first-time software adopters** (were on LINE+Excel+paper before) is high and rising — that is
> new-market disruption, versus merely winning switchers from KANNA/BUILK.

---

## 5. Sequencing 📋

1. **Prove BET A first** (AI paperwork elimination) — it is the disruptive core *and* the biggest spec
   gap. Without "talk → paperwork done in Thai" working, the rest is a better ERP, not a disruption.
2. **BET D in parallel** (LINE-native) — the delivery vehicle that makes A reach the non-consumer.
3. **BET C** (transactional-by-product) — converts free field users into a monetizable, defensible OS;
   spec'd, so it is an execution race.
4. **BET B** (ราคากลาง/e-GP) — the public-works wedge + BOQ credibility; needs a spec decision but is a
   strong differentiator and retention driver.

---

## 6. Risks & what must be true ⚠️ (stated, not hidden)

- **This is COS's *design ambition*, not a proven capability.** AI (Phase 11–12), offline, and the
  transactional chain are spec, not shipped; the backend QM-1 build gate was **red** earlier this session
  (now fixed). Disruption requires **execution**, not positioning.
- **BET A must actually deliver in Thai** — if voice/photo → Thai BOQ/PO/cost extraction isn't accurate
  enough to trust, non-consumers won't switch. Needs a real eval-set + accuracy bar (not yet defined).
- **ANDPAD is racing on the same axes** (AI + transactional + Thai) — the window is narrow; speed matters.
- **SME willingness-to-pay is low** (prefers one-time over subscription 📊) — the free field layer must be
  genuinely free, funded per the distribution-playbook (grants/credits/paid conversion), not materials
  margin.
- **BET B/D are spec gaps** — they can't be executed until a product-owner spec decision adds them.

---

## 7. What NOT to do (each evidence-backed)

- **Don't out-feature Procore** — sustaining innovation; the bigger incumbent wins. 📋
- **Don't build a better KANNA form** — copying a form workflow and hoping to win on UX is not disruption;
  invert it with AI (BET A). 📋
- **Don't fight BUILK on materials margin** — NocNoc (SCG) shut down with ~4.39bn baht losses; stay
  software-first. 📊 (distribution-playbook §3)
- **Don't assume the GC-mandate motion** — unverified in Thailand; the free-external loop must run
  bottom-up. 📊

---

## 8. Open decisions & spec gaps to close (before disruption is real)

1. **Spec BET A** — add "multimodal Thai capture (voice/photo/chat) → auto-generate report/BOQ/PO/cost"
   with an accuracy/eval target (extends Phase 11–12; today only report-generation-from-data is spec'd).
2. **Spec BET B** — add ราคากลาง pricing source + e-GP/SME-GP integration (Phase 4/5) — **not in spec today**.
3. **Spec BET D** — add a LINE MINI App delivery surface (extends the Web/mobile platform decision).
4. **Product-owner calls I cannot make** (need data I don't have): the AI accuracy bar for BET A; capital
   to fund a free tier; whether/when to build the Thai team; LINE certified-provider path (see
   distribution-playbook §5).

---

## 9. One-line strategy

**COS disrupts by making the paperwork disappear** — a Thai contractor speaks, and the OS produces the
report, BOQ, PO, and cost — reaching the 83%-non-digital non-consumer inside LINE, giving away the field
layer while cost/finance emerge free from the workflow, localized around ราคากลาง/e-GP the incumbents
can't match — winning exactly where each incumbent's own model prevents it from following.

---

## 10. Sources

Grounding facts are cited in the companion research docs (all researched 2026-07-13/14 with per-claim
sources): [`competitive-landscape.md`](competitive-landscape.md) (incumbents, gaps, Thai market),
[`distribution-playbook.md`](distribution-playbook.md) (channels, LINE, ราคากลาง/e-GP, non-consumer data),
[`kanna-competitive-analysis.md`](kanna-competitive-analysis.md) (KANNA in-product audit). Spec-status
tags grep-verified against `docs/specifications/` + `context/` on 2026-07-14.
