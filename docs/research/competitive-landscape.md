# Competitive Landscape — Construction OS (COS)

> **Status:** research document — NOT an architecture spec; nothing here overrides `docs/specifications/`.
> **Date of research:** 2026-07-13. **Companion doc:** [`kanna-competitive-analysis.md`](kanna-competitive-analysis.md)
> (KANNA gets its own deep in-product audit; this doc covers the rest of the field).
> **Method:** 10 parallel research sub-agents across segments (global platforms, Thai/SEA local, field/
> photo apps, field-management, Japanese apps, construction ERPs, BOQ/takeoff, procurement/marketplace,
> AI-native startups), each required to cite a source URL per claim or mark it UNVERIFIED.
>
> **Evidence discipline:** every company row is either **cited** or flagged **⚠️ UNVERIFIED**. "Thai
> presence" and "Thai-language UI" are tracked separately — a reseller/hub is not a localized product.
> Threat levels are this analysis's judgment (📋), grounded in the cited facts.

---

## 1. Executive summary — who actually competes with COS in Thailand

The important correction up front: **the real competition in Thailand is Japanese + homegrown Thai +
Singaporean — not the Western giants.** Procore and Autodesk reach Thailand only through a Singapore hub
or local resellers, with no confirmed Thai-language product. Meanwhile three players are genuinely
present and Thai-relevant, and one of them (ANDPAD) directly attacks the transactional layer COS treats
as its moat.

**Threat ranking for the Thai market (this analysis, 📋):**

| #   | Competitor                                                                                                  | Why it matters in Thailand                                                                                       | Threat                            |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | **ANDPAD** (Japan)                                                                                          | Full construction OS (procurement + cost/budget) + strongest AI (Stellarc) + **Thai UI added Dec 2025**          | **HIGH & rising**                 |
| 2   | **BUILK One Group** (Thai)                                                                                  | Homegrown incumbent: free cost-control + materials marketplace + ERP + e-procurement, all Thai, SCG/KBank-backed | **HIGH**                          |
| 3   | **KANNA** (Japan)                                                                                           | Bangkok office + Thai UI since 2022; owns the site-reporting wedge (see companion doc)                           | **HIGH (on site reporting only)** |
| 4   | **Novade** (Singapore)                                                                                      | Enterprise field-management, Thailand sales office, deep AI, free external viewers                               | **MEDIUM-HIGH**                   |
| 5   | **Procore** (US)                                                                                            | Global leader; ASEAN via Singapore hub; no Thai office/UI                                                        | **MEDIUM (enterprise)**           |
| 6   | **Autodesk Construction Cloud** (US)                                                                        | Via Thai resellers (MTECH, VR Digital); BIM-centric                                                              | **MEDIUM (BIM segment)**          |
| —   | Everyone else (Raken, CompanyCam, Fonn, Dashpivot, Fieldwire, CMiC/Sage/SAP, BOQ tools, AI-native startups) | No confirmed Thai presence / benchmark-or-watch only                                                             | **LOW now**                       |

**The single most important finding:** COS's "transactional moat" (procurement → cost → finance) is
**NOT empty white space in Thailand** — **BUILK** (Thai) and **ANDPAD** (now Thai) both already do it.
COS's genuine differentiation is the _combination_ nobody holds: **BOQ engine + procurement + cost +
finance + AI-native + offline-first + Thai-localized + multi-tenant** in one platform. See §6.

---

## 2. Tier 1 — Real, present, Thai-relevant competitors

### 2.1 ANDPAD (Aldagram's bigger Japanese rival) — HIGH & rising 📋

- **What it is:** a **full construction OS**, not a point tool. Beyond photos/reports it includes
  **order/procurement management (受発注)** and **cost/budget management (原価管理/予算管理)**, scheduling,
  drawings, chat. Source: [SelectHub](https://www.selecthub.com/p/construction-management-software/andpad/),
  [IPROS order mgmt](https://www.ipros.com/en/product/detail/2000647450/).
- **AI (strongest roadmap found):** **ANDPAD Stellarc** (launched Dec 2025) — AI Assistant (chat),
  AI Agents (**automatic daily-report generation**, delay-risk detection), and **Knowledge AI** that
  vectorizes PDF drawings to reference past cases. Source:
  [ANDPAD news 2025-12-09](https://andpad.jp/news/20251209), [ai.andpad.co.jp](https://ai.andpad.co.jp/),
  [TheBridge](https://thebridge.jp/2026/04/andpad-stellarc-ai-agent-construction-hot100).
- **Thailand:** **Thai-language UI added 2025-12-16** (alongside Indonesian, Traditional Chinese,
  Spanish). Source: [Media OutReach](https://www.media-outreach.com/news/japan/2025/12/16/436179/),
  [Zawya](https://www.zawya.com/en/economy/global/the-andpad-cloud-based-construction-project-management-service-adds-supporting-indonesian-thai-traditional-wt0olt57).
  Its physical SEA office is **Vietnam (Hanoi)** — so it is now _product-localized_ for Thai but not yet
  office-present there. Source: [Media OutReach Apr 2026](https://www.media-outreach.com/news/japan/2026/04/08/458614/hanoi-office-at-andpad-vietnam-relocated/).
- **Scale:** 265,000 organizations / 690,000 users (JP-reported, 2026). Same source.
- **Pricing:** quote-only (Lite/Basic/Business/Enterprise), setup ~¥100k + monthly. Source:
  [ANDPAD pricing](https://andpad.jp/help/pricing). External-user model ⚠️ UNVERIFIED.
- **Offline:** exists for the blackboard/photo app but reviews report reliability problems; conflict
  handling ⚠️ UNVERIFIED. Sources:
  [Speaker Deck](https://speakerdeck.com/andpad/the-journey-to-release-offline-mode-for-andpad-blackboard),
  [MWM reviews](https://mwm.ai/apps/andpad/1067643333).
- **Why it's the top threat:** it is exactly what KANNA is **not** (transactional depth), has the best AI
  trajectory, and just went Thai. If it opens a Thai office, it is COS's most complete competitor.

### 2.1b Thai-native construction ERP / BOQ tools (transactional incumbents) — MEDIUM 📋

⚠️ **Correction to the "BOQ = empty white space" idea:** a cluster of Thai-native construction ERPs
**already ship a BOQ engine + procurement + cost + AR/AP, in Thai** — they are legacy/desktop-style
without modern offline-first mobile + AI, but they hold the transactional-BOQ ground:

- **Pojjaman 2** (BUILK-owned) — PR/PO with multi-vendor price comparison, cost-vs-budget, AR/AP + period
  close, EVM, mobile approval, Rukhamai material tie-in; "30,000+ businesses" (self-reported). Broadest
  COS overlap of the Thai set. [pojjaman.com](https://www.pojjaman.com/).
- **Absolute Management Solutions** — construction ERP with **BOQ import/management**, on/off-BOQ material
  requisition (FIFO costing), work orders, QC forms, retention, Gantt. [absolute.co.th](https://www.absolute.co.th/absolute-product/construction).
- **Crystal Software — FORMULA/FORMA BOQ** — BOQ-centric ERP: BOQ by trade, cost segregation, procurement
  planning, AR/AP, inventory. [crystalsoftwaregroup.com](https://www.crystalsoftwaregroup.com/products/boq-construction-industry/).
- **PEstimate** — estimating + **BOQ generation with AI drawing-reading**, Thai gov labor-rate DB, ปร.4
  output, CAD/Revit add-ons; Autodesk Authorized Developer, 500+ licenses (self-reported).
  [pestimate.net](https://www.pestimate.net/).
- **Vcon (Visionsoft), CONSOL, Work Mark, AccCloud, Mango ERP** — Thai cost-control/BOQ/ERP tools;
  existence-confirmed, scale/pricing/capabilities ⚠️ vendor-claim-only / UNVERIFIED.
- **BuildSpace** (Malaysia) — BQ/BOQ-centric + e-tendering (clients Gamuda/PKNS); no Thai presence.

**Implication:** COS's BOQ differentiation is **not "BOQ exists"** (it does, in Thai) — it is _BOQ
integrated into a modern AI-native, offline-first, multi-tenant OS with the procurement→cost→finance
chain_, which these legacy Thai ERPs do not offer. Their competitive weight beyond BUILK/Pojjaman is
⚠️ UNVERIFIED (thin public documentation) — treat as an unquantified but real local ERP long tail.

### 2.2 BUILK One Group (the homegrown Thai incumbent) — HIGH 📋

- **What it is:** a Thai construction-tech group (founded 2005/2009, Bangkok; Patai Padungtin) with a
  portfolio: **BUILK Cost Control** (free), **Yello** (materials marketplace), **Pojjaman 2 ERP**,
  **BUILK INSITE** (site-report app). Backed by **SCG (AddVentures), Kasikornbank (Beacon VC), Krungsri
  Finnovate, BCH Ventures**. ~25,000 contractors across TH/ID/MM/LA/KH/PH. Sources:
  [builk.one](https://www.builk.one/), [Beacon VC](https://www.beaconvc.fund/in-the-news/beacon-vc-invests-in-builk-leading-construction-tech-to-strengthen-the-thai-construction-platform),
  [e27 Series B](https://e27.co/thai-construction-tech-startup-builk-one-group-raises-series-b-aims-for-ipo-in-2022-20210826/).
- **Coverage vs COS:** **procurement** (RFQ + PO + expense tracking — [builk.com/en](https://www.builk.com/en/));
  **cost/budget** (budget planning, income-expense reporting); **partial finance** (invoice/receipt
  records, no full AR/AP ledger documented); **Yello** = materials e-procurement/RFQ marketplace with
  direct manufacturer-to-site delivery ([builk.com/yello](https://www.builk.com/yello/)); **Pojjaman 2**
  = project ERP + construction accounting + **Earned Value Management** + e-procurement via the
  **Rukhamai (รักเหมา)** network of 200+ material shops ([pojjaman.com](https://www.pojjaman.com/)).
- **Native Thai** (+ EN/ID/MM/KH). **BUILK Cost Control is 100% free** (sponsor-monetized) — the free
  software is a **funnel into materials-margin monetization**: ~2020 group revenue ~570M baht was
  **~500M from YELLO materials vs only ~70M from software** ([The Story Thailand](https://www.thestorythailand.com/en/builk-an-empire-built-on-an-11-year-construction-job/)).
  So COS competes with a _materials-marketplace business wearing a free-software coat_, not a software P&L.
- **Ownership / backing:** SET-listed insurer **TQM bought 40% (Aug 2022, ~247M baht → ~617M baht /
  ~US$17M implied valuation)**; cap table TQM 40% / founder (Longkong) 30% / SCG Distribution ~18.6%.
  Deep Thai-corporate backing (SCG + KBank + Krungsri + TQM). Source:
  [Techsauce](https://techsauce.co/news/tqm-becomes-major-shareholder-of-build-one-group).
- **Gaps vs COS (⚠️ not documented / likely absent):** **no BOQ/quantity-takeoff engine**; **no AI**
  features documented; offline-first depth not documented. Source: [builk.com/en](https://www.builk.com/en/).
- **Why it matters:** it is the entrenched, well-capitalized local player that already occupies COS's
  transactional layer in Thai. COS must out-differentiate on BOQ + AI + offline + integration, not on
  "we do procurement/cost" (BUILK already does).

### 2.3 KANNA (Aldagram) — HIGH on the site-reporting wedge only 📋

Full in-product audit in [`kanna-competitive-analysis.md`](kanna-competitive-analysis.md). Summary for
this landscape: field/site-management SaaS; **Bangkok rep office since June 2023** (101 True Digital
Park), **Thai UI since Nov 2022**, named Thai customers (Piyavate Hospital); 70,000+ companies/100+
countries; offline is real but shallow and paywalled (ProPlus+); **AI voice reporting** advertised;
**no procurement/BOQ/cost/finance**. Sources: [Aldagram rep-office](https://aldagram.com/en/news/press230810en/),
[KANNA pricing](https://lp.kanna4u.com/en/pricing). Threat is confined to Priority-1 site reporting +
mobile UX; it does not reach the transactional layer.

### 2.4 Novade (Singapore) — MEDIUM-HIGH 📋

- **What it is:** enterprise **field-management** platform (quality, safety, tasks, progress, workforce,
  logistics, maintenance) — broader/more enterprise than KANNA. 150,000 users / 25 countries. Source:
  [novade.net](https://www.novade.net/us/).
- **Thailand:** **dedicated Thailand sales office** (phone +66 96 1741888) + Malaysia/Indonesia/SG HQ;
  Thai representative partner **VR Digital**; publishes Thailand-specific content. Source:
  [Novade contact](https://www.novade.net/uk/contact/), [Thailand trends](https://www.novade.net/us/trends-construction-software-thailand/).
  **Thai-language UI ⚠️ UNVERIFIED**; named Thai customers ⚠️ UNVERIFIED (case studies are SG-centric).
- **AI (deep):** Speech-to-Forms (voice→structured data), document/photo extraction, generative form
  creation, "Noa" assistant, video analytics (PPE/zone detection), predictive safety. Source:
  [Novade AI](https://www.novade.net/us/ai-construction-software/).
- **Pricing:** Free (≤5 users/5 projects) / Standard from **$39/user/mo** / Premium+Enterprise quote;
  **free View-Only external users** (don't occupy a seat). Source: [Novade pricing](https://www.novade.net/en/pricing/).
- **Overlap:** field-ops + AI; **no procurement/BOQ/cost/finance** confirmed → same category as
  KANNA/COS-Priority-1, but enterprise and AI-deep. Threat mainly to COS's field layer at the enterprise/
  large-contractor end.

---

## 3. Tier 2 — Present via reseller/hub, not Thai-localized

### 3.1 Procore (US) — MEDIUM (enterprise) 📋

Global category leader; genuinely full-stack (procurement Commitments→PO, a "Bill of Quantities" tab on
POs, Estimating, Cost/budget, AI "Helix" with 18+ agents, offline mobile). **ACV (Annual Construction
Volume) pricing, not per-seat; unlimited free collaborators; ~80% gross margin with ~60% of 2M+ users
free** (see `kanna-competitive-analysis.md` §5 and the §26 pricing decision). Thailand: entered ASEAN
June 2021 via a **Singapore hub**, first ASEAN reseller **CS Global Group**, and a **named Thai case
study (Ananda Development, Bangkok)** — but **Thai product UI is BETA only, not GA**, and there is no
local office. Sources:
[ASEAN press](https://www.procore.com/press/procore-continues-asia-pacific-expansion-enters-southeast-asia),
[Ananda case study](https://www.procore.com/casestudies/ananda-development),
[languages FAQ](https://en-gb.support.procore.com/faq/what-languages-are-available-in-procore).
Threat: real at the large-GC/enterprise end; blunted in the SME/Thai-language segment by cost + the
beta-only localization.

### 3.2 Autodesk Construction Cloud / Build ("Forma Build") (US) — MEDIUM (BIM) 📋

Sold into Thailand via authorized partners — **MTECH / M Technologies** and **Synergysoft / VR
Digital** — with real megaproject deployments (**MQDC The Forestias 500+ users**, AP Thailand,
Meinhardt). Per-named-user licensing; BIM/design-centric; PlanGrid folded into Autodesk Build (now
"Forma Build", renamed 24 Mar 2026). **Thai product UI: NO — Thai is not in the ACC supported-languages
list** ([Autodesk supported languages](https://help.autodesk.com/cloudhelp/ENU/Docs-About-ACC/files/Supported_Languages.html)).
Sources: [MTECH](https://mtechthailand.com/autodesk-products/),
[Forma rename](https://adsknews.autodesk.com/en/news/autodesk-construction-cloud-is-now-autodesk-forma/).
Threat: strongest where BIM is mandated (large public projects); per-seat + reseller + no-Thai-UI
friction at SME level.

### 3.3 Fieldwire (by Hilti) — LOW-MEDIUM 📋

Plans + field-task management; **best-documented offline** (selective/smart sync) of the field tools;
AI photo tagging (Field Intelligence). **No verified Thailand office/customers; Thai in the ~20-language
list ⚠️ UNVERIFIED.** Per-user ($0/$39/$64/$89) with financials gated to top tiers. Sources:
[Fieldwire pricing](https://www.fieldwire.com/pricing/), [Fieldwire AI](https://www.fieldwire.com/ai/).

---

## 4. Tier 3 — Not confirmed in Thailand (benchmark / watch-list only)

### 4.1 Field / daily-report / photo point tools (KANNA's category, no Thai presence)

| App                                | Focus                | Offline                                                        | AI                                                    | Thai presence                                                                                                                                                              |
| ---------------------------------- | -------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Raken** (US)                     | Daily reports        | Supported but **review-reported unreliable**; ~5-project cache | Photo tagging, Photo ID, report _summaries_           | Thai **App Store listing** only; no real footprint ([apps.apple.com/th](https://apps.apple.com/th/app/raken-construction-management/id747582049?l=th)); free collaborators |
| **CompanyCam** (US)                | Jobsite photos       | **Robust** (60-project cache; unsynced-photo loss risk)        | **Voice→caption/report, generative docs** (some beta) | ⚠️ none found                                                                                                                                                              |
| **Photoruction** (JP)              | Photo/blackboard/BIM | ⚠️ **not verified**                                            | Auto photo-sorting + BPO                              | ⚠️ none found                                                                                                                                                              |
| **Fonn** (NO/UK, now Access Group) | Broad field mgmt     | Queue-and-sync; internals ⚠️ undocumented                      | Predictive "Project Heartrate" only                   | ⚠️ none found; **flat-fee, unlimited users/subs**                                                                                                                          |
| **Dashpivot / Sitemate** (AU)      | Forms/records + HSEQ | **Documented** (300 photos/30 forms per template cached)       | **Generative "Storm": voice→report, photo AI**        | ⚠️ none found; per-seat, free "Visitors" on Pro+                                                                                                                           |
| **GoCanvas** (US, Nemetschek)      | Mobile forms         | Form-submission scoped                                         | Light (AI PDF→form)                                   | Reseller-only (ASt); ⚠️ no Thai                                                                                                                                            |

Sources: Raken [rakenapp.com](https://www.rakenapp.com/); CompanyCam [companycam.com/ai-features](https://companycam.com/ai-features),
[offline](https://help.companycam.com/en/articles/6828443-access-offline-mode); Photoruction
[photoruction.com/en](https://www.photoruction.com/en); Fonn [Access Group](https://www.theaccessgroup.com/en-us/construction/pricing/access-fonn/);
Dashpivot [offline](https://help.sitemate.com/en/articles/4719089-how-does-offline-mode-work-on-dashpivot-mobile-app),
[AI Storm](https://sitemate.com/au/blog/taking-ai-to-the-front-line/); GoCanvas [ASt reseller](https://www.prnewswire.com/apac/news-releases/advanced-spatial-technologies-appointed-by-gocanvas-as-authorised-reseller-partner-in-anz-and-southeast-asia-302524004.html).
**None of these is a construction OS** — all stop at field coordination/documentation; none touches
procurement/BOQ/cost/finance.

### 4.2 Full construction-vertical ERPs

Strong on procurement+BOQ+cost+finance, but **Thai presence is the differentiator**:

| ERP                       | Full stack                                 | AI               | Thai partner                  | Thai language                     |
| ------------------------- | ------------------------------------------ | ---------------- | ----------------------------- | --------------------------------- |
| CMiC                      | Yes (native, strong)                       | Strong (NEXUS)   | ⚠️ none found                 | ⚠️ no                             |
| Jonas                     | Mostly (weak BOQ)                          | Moderate         | ⚠️ none found                 | ⚠️ no                             |
| Trimble Viewpoint         | Mostly (estimating separate)               | Weak             | ⚠️ none found                 | ⚠️ no                             |
| Sage 300 CRE              | Yes (native, strong)                       | Add-on (Copilot) | ⚠️ US only                    | ⚠️ no                             |
| **MS Dynamics 365 + ISV** | Yes (needs ISV: ProjectPro/MetaConstructX) | Yes (Copilot)    | **Yes** (BC/F&O partners)     | **Yes** (Thai localization packs) |
| **SAP E&C / S/4HANA**     | Yes (native, incl. BOQ)                    | Yes (Joule)      | **Yes** (NDBS/Oasis, Bangkok) | Yes (standard localization)       |

Sources: [CMiC](https://cmicglobal.com/), [Sage 300 CRE](https://www.sage.com/en-us/products/sage-300-construction-and-real-estate/),
[Dynamics Thai localization](https://appsource.microsoft.com/en-gb/marketplace/consulting-services/naviworldasia-1951359.dynamics365business-central-thai-localization),
[SAP Joule Thailand/NDBS](https://www.techtalkthai.com/sap-joule-by-ndbs-thailand/). **Only SAP and
Microsoft have confirmed Thai partners + Thai tax/localization — but neither ships a construction-specific
edition locally** (SAP needs E&C config by a Thai partner; Dynamics needs a Thai BC partner + a
construction ISV that itself has ⚠️ no verified Thai footprint). No named large Thai contractor was
verified running any of these as its construction ERP (⚠️ UNVERIFIED).

### 4.3 BOQ / quantity-takeoff / estimating

- **Strong Thai presence:** **Cubicost / Glodon** (China; Thailand entity, **One Bangkok** reference
  project, 15-country reach — [asia.glodon.com/cubicost](https://asia.glodon.com/cubicost)) and
  **Bluebeam** (ASEAN distributor + Thai resellers REI/Synergysoft — [resellers.bluebeam.com/thailand](https://resellers.bluebeam.com/regions/thailand/)).
- **Homegrown Thai, government-pricing anchored:** **PESTIMATE** (Autodesk dev; integrates **ราคากลาง**
  Comptroller General + Ministry of Commerce material prices; Thai UI — [pestimate.net](https://www.pestimate.net/)),
  **ArchiCAD Thai BIM** (AppliCAD; auto QTO referenced to กรมบัญชีกลาง central prices), THAI BOQ, PRO-BOQ,
  BestBoQ — plus widespread **Excel** in the SME long tail.
- **Western (no verified Thai):** CostX/RIB (Schneider Electric — ownership: Exactal→RIB→Schneider, NOT
  Bentley), PlanSwift (ConstructConnect), Buildxact (AU; touches PO/RFQ + Xero/QuickBooks), STACK (US;
  AI "STACK Assist"). Thai-language UI ⚠️ UNVERIFIED for all Western BOQ tools.
- **Key point:** **none of the six global BOQ tools is a full procurement+BOQ+cost+finance suite** —
  they cluster on takeoff/estimating. Thai BOQ credibility requires **ราคากลาง integration**, which the
  Thai tools have and BUILK/KANNA/ANDPAD do **not**.

### 4.4 Procurement / materials-marketplace specialists

- **Kojo** (US) — AI-strong materials procurement (GPT-4 price prediction, PO/invoice automation,
  takeoff→AP); US-only, ⚠️ no Thai. [usekojo.com](https://www.usekojo.com/).
- **Felix** (AU, ASX) — enterprise source-to-contract / vendor management; ⚠️ no Thai.
- **SEA marketplaces:** Juragan Material / Materee (Indonesia), BuildHub.ph (Philippines, + BuildCredit
  financing), Doxa Connex / Really.sg (Singapore, procure-to-pay + financing), DauThau.Net (Vietnam,
  tendering). All single-country, language-localized to their own market; **none with combined
  BOQ+cost+AR/AP+AI in Thai**.

### 4.5 AI-native construction startups (global) — watch-list, NONE in Thailand

Well-funded but **zero Thailand/SEA presence or Thai UI** across every one researched:

- **Trunk Tools** ($70M total; doc/drawing/submittal AI, agentic vision-language) — deepest AI-native
  platform. **Parspec** ($20M; procurement/product-matching, 6M-product DB) — closest to a procurement
  stack. **Kreo / Beam AI (Attentive.ai $30.5M Series B) / Togal** — AI takeoff/estimating.
  **XBuild (a16z) / Bild AI (YC/Khosla)** — agentic estimating. **Document Crunch** ($21.5M; contract
  compliance). **Slate** (decision intelligence). **ConCntric / LightTable / MeltPlan** (preconstruction AI).
- Relevance: they validate that "AI-native construction" is the funding thesis (~2/3 of ConTech VC), but
  **none competes in Thailand today** — they are a future-entrant watch-list, and a benchmark for COS's AI.

### 4.6 Niche Thai

- **FASTInspect** — Thai QA/inspection app with **offline-first + auto-sync**, photo + geo-tagging;
  claims 200+ projects / 100,000+ units. A focused local competitor on the inspection/offline angle.
  Source: [fastinspect.co](https://www.fastinspect.co/).

---

## 5. Capability map — who covers what (Thailand-relevant players)

Legend: ✅ documented · ~ partial/manual · ✗ absent/not found · ⚠️ unverified.

| Capability                           | KANNA             | ANDPAD           | BUILK       | Novade | Procore | Autodesk | COS (spec)                     |
| ------------------------------------ | ----------------- | ---------------- | ----------- | ------ | ------- | -------- | ------------------------------ |
| Daily site reports + photos          | ✅                | ✅               | ✅ (INSITE) | ✅     | ✅      | ✅       | ✅ (Priority 1)                |
| Procurement PR→RFQ→PO                | ✗                 | ✅               | ✅          | ✗      | ✅      | ~        | ✅ (Phase 5)                   |
| BOQ / quantity takeoff               | ✗                 | ⚠️               | ✗           | ✗      | ~       | ✅ (BIM) | ✅ (Phase 4)                   |
| Cost / budget (EVM)                  | ~ (manual)        | ✅               | ✅          | ✗      | ✅      | ~        | ✅ (Phase 7)                   |
| Finance AR/AP                        | ✗                 | ~                | ~           | ✗      | ~       | ✗        | ✅ (Phase 7)                   |
| Offline-first w/ conflict resolution | ~ (paid, shallow) | ~ (complaints)   | ⚠️          | ⚠️     | ⚠️      | ⚠️       | ✅ (spec; conflict strategies) |
| AI (generative/voice)                | ✅ (voice)        | ✅ (Stellarc)    | ✗           | ✅     | ⚠️      | ~        | ✅ (Phase 11–12)               |
| Knowledge graph / analytics          | ✗                 | ~ (Knowledge AI) | ✗           | ~      | ✅      | ~        | ✅ (Phase 13–14)               |
| Multi-tenant SaaS                    | ✅                | ✅               | ✅          | ✅     | ✅      | ✅       | ✅                             |
| **Thai-language UI**                 | ✅                | ✅ (Dec 2025)    | ✅          | ⚠️     | ⚠️      | ⚠️       | ✅ (QM-3)                      |
| ราคากลาง / e-GP integration          | ✗                 | ✗                | ✗           | ✗      | ✗       | ✗        | not yet specced (opportunity)  |

> **No competitor shows ✅ across the whole column.** The BOQ row, the offline-with-conflict-resolution
> row, the Thai-language row (for Western players), and the ราคากลาง/e-GP row are where the field thins out.

---

## 6. Strategic implications for COS (grounded, honest)

1. **The competition is regional, not Western.** In Thailand, COS competes with ANDPAD, BUILK, KANNA, and
   Novade — not primarily Procore/Autodesk (present only via hub/reseller, no confirmed Thai UI). Plan
   go-to-market against the Japanese + Thai + Singaporean incumbents.

2. **The "transactional moat" is contested, not empty.** ⚠️ **Correction to the earlier KANNA-only
   framing:** BUILK (Thai) and ANDPAD (now Thai) already do procurement + cost. "We do procurement/cost"
   is **not** a differentiator in Thailand. COS must win on the _combination_ + specific gaps below.

3. **Genuine gaps COS can own (each backed by a competitor absence above):**
   - **Full BOQ engine integrated with procurement + cost + AI + offline** — nuance: **BOQ itself is
     NOT white space** (BUILK lacks it, but Thai ERPs Pojjaman/Absolute/Crystal/PEstimate/Vcon **do**
     ship BOQ, in Thai — §2.1b). The white space is BOQ **integrated into a modern AI-native,
     offline-first, multi-tenant OS with the procurement→cost→finance chain** — the legacy Thai ERPs are
     desktop-style without offline-mobile/AI, and the field apps (KANNA/Novade) have no BOQ at all.
   - **ราคากลาง (Comptroller General central pricing) integration** — table stakes for Thai BOQ
     credibility (PESTIMATE/ArchiCAD-Thai have it; BUILK/KANNA/ANDPAD do not). **Recommend COS add
     ราคากลาง as a BOQ pricing source** (spec §Phase 4 does not mention it — a gap to close).
   - **e-GP (public procurement) integration** — the gateway for public-works contractors; no competitor
     integrates it. A procurement differentiator worth a spec decision.
   - **AI-native from the ground up + Thai** — ANDPAD (Stellarc) and Novade are bolting AI on and are the
     ones to beat on AI; being AI-native _and_ Thai-localized _and_ multi-tenant is still rare.
   - **Deep offline-first with documented conflict resolution** — **every competitor leaves conflict
     handling ⚠️ undocumented.** COS's spec'd 3+ conflict strategies (LWW / field-merge / server-wins /
     max-wins / no-auto-resolution for financial) are a genuine, demonstrable edge **if shipped and shown**.

4. **Offline-first is a targeted edge, not a blanket moat.** Urban Thailand has near-universal 4G/5G;
   the offline advantage is real for **rural/remote/infrastructure corridors** (rural usage ~85%,
   occasional 3G-only zones). KANNA and FASTInspect already market offline, so _having_ offline is
   table-stakes — COS's edge is **deeper** offline (conflict resolution), not offline per se. Sources:
   [Thailand connectivity](https://ts2.tech/en/thailands-high-speed-internet-revolution-5g-fiber-and-the-battle-to-bridge-the-digital-divide/).

5. **The full combination is the moat.** No single competitor holds the full set — **BOQ, procurement,
   cost, finance, AI-native, offline-first, Thai, and multi-tenant** — together. That integrated whole
   — with ราคากลาง / e-GP localization — is COS's defensible position. But because every _individual_
   piece has a strong
   incumbent, COS wins on **integration + Thai-localization depth**, and must not assume any single
   feature is unique.

6. **Watch-list (re-audit semi-annually):** **ANDPAD Stellarc** (Thai + transactional + best AI — the
   most dangerous trajectory), **BUILK** (entrenched local incumbent), **Novade** (enterprise SEA + deep
   AI), and the global **AI-native startups** (Trunk Tools, Parspec) as potential future entrants.

---

## 7. How to win — Tier 1 head-to-head (battle cards)

> **Purpose:** turn §2 (competitor facts) + §6 (strategy) into a per-competitor "how to win" and a
> sales-usable battle card. **Evidence rule holds:** every "attack here" weakness below traces to a
> **cited fact in §2** (📊); the plays are this analysis's judgment (📋); execution caveats are ⚠️.

### 7.0 The meta-move — do not fight all four head-on

COS cannot out-capitalize, out-localize, or out-tenure all four Tier-1 players at once (§6). The winning
frame is **choose the battleground where each is structurally weak, and own the SME long tail no one fully
holds** (SME context in §8 Market: ~117k Thai contractors, ~0.6% large-scale, ~83% still non-digital in
2025). Win on the two things **no competitor has** (per the §5 map): an **AI-native "talk/snap/chat →
paperwork"** capture layer, and **ราคากลาง / e-GP localization**.

**Where to fight vs where not to fight (📋, grounded in §2 / §5):**

| Competitor | Fight here — their verified gap                                                       | Do NOT fight here — their real strength                      |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **KANNA**  | No procurement/BOQ/cost/finance; offline shallow + paywalled (§2.3, §5)               | Field/photo UX; Bangkok office + Thai UI + events (§2.3)     |
| **BUILK**  | No BOQ engine; no documented AI; offline undocumented (§2.2, §5)                      | Free + Yello materials margin + SCG/KBank/TQM backing (§2.2) |
| **ANDPAD** | AI bolted on forms; no Thai office (SEA=Vietnam); no ราคากลาง/e-GP; quote-only (§2.1) | Full OS + best AI (Stellarc) + Thai UI + capital (§2.1)      |
| **Novade** | No procurement/BOQ/cost/finance; reseller-led; Thai UI ⚠️ unverified (§2.4)           | Enterprise field-ops + deep AI + Thai sales office (§2.4)    |

**Sequence to win (📋):** (1) **Land** the field wedge against KANNA; (2) **Expand** into the transactional
layer against BUILK/ANDPAD; (3) **Defend** with the integrated OS + ราคากลาง/e-GP no one holds (§6, item 5).

---

### 7.1 Per-competitor battle cards → `battle-cards.md`

The detailed, sales-usable battle card for each Tier-1 competitor — their strength to avoid, their
verified gap to attack, COS's wedge, and **Thai objection-handling scripts (ประโยคโต้)** — lives in the
companion sales artifact [`battle-cards.md`](battle-cards.md) (one printable card per competitor). It is
kept in a single file so the Thai sales scripts do not drift between documents. Summary of which
battleground to pick per competitor is the table in §7.0; the strategic "what must be true to win" is §7.2.

---

### 7.2 What must be true for COS to win (⚠️ honest)

1. **Execution over positioning.** COS's decisive edges — AI-native capture, deep offline, the
   procurement→cost→finance chain — are **spec, not yet shipped** (the build was red, now green). These
   battle cards convert to wins **only when the features ship and can be demoed** (§6, items 3–4).
2. **Speed against ANDPAD.** It races the same axes with more capital; the Thai-SME window is narrow.
3. **Don't out-spend BUILK's distribution.** Win on product depth + non-conflicted channels
   (LINE / depa / accountants / Bangkok Bank — see [`distribution-playbook.md`](distribution-playbook.md)),
   not distribution spend.
4. **Win SME first, not every segment.** The long tail (~83% non-digital) is the beachhead no incumbent
   fully holds; enterprise comes later.
5. **Close the spec gaps first.** AI voice→paperwork in Thai, ราคากลาง + e-GP, and LINE-native delivery are
   **not yet in the spec** (disruption-strategy §8) — they must become spec decisions before the "attack
   here" columns are real, not aspirational.

---

## 8. Market context (Thailand / SEA)

- **Market size (sources disagree — cite the range):** Thai construction **~$31.5B (Mordor, 2026)** to
  **~$106B (NextMSC, 2024)** depending on scope. SEA construction ~$530B (Zacua, 2024). Sources:
  [Mordor](https://www.mordorintelligence.com/industry-reports/thailand-construction-market),
  [NextMSC](https://www.nextmsc.com/report/thailand-construction-market), [Zacua](https://zacuaventures.com/southeast-asia-market-overview/).
- **Digitalization:** BIM adoption in Thailand +40% since 2020; **>50% of large projects use BIM**;
  government mandates BIM for large public works; ฿100B digital-infrastructure allocation (Thailand 4.0).
  But construction is **risk-averse / slow-adopting** vs other Thai sectors; middle management is the
  adoption bottleneck. Sources: NextMSC (above), [Novade/VR Digital](https://www.novade.net/us/trends-construction-software-thailand/).
- **~400 ConTech startups in SEA (~120 active); AI = ~2/3 of ConTech VC.** Source: Zacua (above).
- **Thai market structure:** ~**117,000 registered Thai construction companies** (2024), only ~**0.6%
  large-scale**; SMEs lag on tech adoption (capital constraints); ~**83% of the market still non-digital
  in 2025**; Thai construction & design **software spend only ~US$16.8M (2024)** — a small but
  fast-growing software TAM behind a huge construction TAM. Sources:
  [Krungsri Research](https://www.krungsri.com/en/research/industry/industry-outlook/construction-construction-materials/construction-contractors/io/construction-contractor-2025-2027),
  [Statista](https://www.statista.com/outlook/tmo/software/productivity-software/construction-and-design-software/thailand).
- **SCG is the ecosystem force** behind nearly every Thai materials-tech play — BUILK/YELLO (via
  AddVentures), NocNoc, SCG HOME, Q-Chang. Any COS procurement/marketplace strategy runs into SCG.
- **Thai materials-marketplace economics are brutal — two cautionary shutdowns:** **NocNoc**
  (SCG-backed home/materials marketplace) is **shutting down in 2026** (stops orders 9 Feb 2026, off by
  9 May 2026; ~4.39bn baht cumulative losses), and Indonesia's **Gravel** (labor+materials, $14M NEA)
  **shut down Dec 2024**. This directly supports COS's decision to **defer vendor-side marketplace
  monetization** (spec §26.1.1 / §28.2) and stay software-first, not materials-margin. Sources:
  [Nation Thailand](https://www.nationthailand.com/business/corporate/40060997),
  [Bangkok Post](https://www.bangkokpost.com/business/general/3172323/brutal-ecommerce-war-forces-nocnoc-to-close),
  [TechCrunch Gravel](https://techcrunch.com/2023/12/03/gravel/).

---

## 9. Key UNVERIFIED items (do not assert as fact)

- Thai-language **product UI** for: Novade, Procore, Autodesk ACC, all Western BOQ tools, all Western ERPs
  (except Dynamics/SAP which have Thai _localization packs_, not construction editions).
- ANDPAD Thai **office/go-to-market** (product is Thai-localized; office is Vietnam) and its offline
  conflict/subcontractor-pricing mechanics.
- Named large Thai contractors running any Western ERP as their construction system.
- Oracle (Aconex / Primavera) was **not deeply researched** in this pass — treat its Thai position as
  unknown, not assumed.
- Conflict-resolution internals for **every** field/offline competitor (KANNA, ANDPAD, Novade, Fonn,
Dashpivot, Fieldwire) — none documents it.
</content>
