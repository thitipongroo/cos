# Distribution / Go-to-Market Playbook — Construction OS (COS) vs the Thai competitors

> **Status:** research + strategy document — NOT an architecture spec; nothing here overrides
> `docs/specifications/`. **Companion docs:** [`competitive-landscape.md`](competitive-landscape.md),
> [`kanna-competitive-analysis.md`](kanna-competitive-analysis.md).
> **Date of research:** 2026-07-13. **Method:** 2 parallel research agents → ~10 cited sub-agents on
> incumbent GTM playbooks (BUILK, KANNA, Novade, Procore/Autodesk) and the real Thai distribution
> channels (banks/CVCs, LINE, depa, government procurement, accounting-software, materials dealers).
>
> **Evidence discipline:** 📊 = cited fact · 📋 = strategic judgment (reasoned, not a fact) ·
> ⚠️ = UNVERIFIED (do not act on as fact). Question answered: _how must COS adapt to out-distribute
> these competitors?_ This is a distribution _strategy_, not a promise — several inputs depend on
> decisions only the product owner can make (§7).

---

## 1. The core reframe

Thai construction software has **two proven distribution motions — both capital-heavy** — and one that
is **unproven in Thailand**:

- **BUILK's free-software → data → marketplace flywheel** 📊 — give SME contractors 100%-free
  cost-control software, fund it with **material-brand sponsorship**, monetize via the **YELLO
  group-buying marketplace**, and let a **strategic cap table (SCG Distribution 18.6%, TQM 40%, KBank,
  Krungsri) act as the distribution channel**. Needs a materials ecosystem + corporate backing.
  Sources: [builk why-free](https://www.builk.com/th/why-free/),
  [BrandInside deep-dive](https://brandinside.asia/builk-workflow-integrated-marketplace-construction/),
  [TQM 40% + cap table](https://www.marketingoops.com/news/tqm-buy-stock-builk-one-group/).
- **KANNA's localization + local-office + enterprise-events + strategic-channel motion** 📊 — Thai UI
  first (Nov 2022), Bangkok office (2023), invite-only executive seminars run via a local PR agency,
  and **Panasonic's global sales network** as a channel. Needs local headcount + a strategic partner.
  Sources: [Thai launch/office](https://aldagram.com/en/news/press230810en/),
  [Panasonic alliance](https://aldagram.com/en/news/9y89tvr7c/),
  [mediator agency events](https://mediator.co.th/en/our_works/kanna-aldagram/).
- **The GC-mandates-software-to-subs flywheel** — **PROVEN in ASEAN but ⚠️ UNVERIFIED in Thailand.**
  Procore's Sime Darby Property (Malaysia) case: one developer mandate pulled **800 contractors + 300
  laborers** onto Procore free ([case study](https://www.procore.com/en-sg/casestudies/sime-darby-property)),
  and ~40% of Procore's new customers come from prior free collaborators
  ([S-1](https://www.sec.gov/Archives/edgar/data/1611052/000119312520057081/d564161ds1.htm)). **But no
  Thai developer/GC was found publicly mandating a SaaS to its subs** — treat the top-down mandate as
  aspirational in Thailand, not a plan.

**Implication for COS (capital-light):** it cannot out-spend BUILK's materials ecosystem or KANNA's
local sales machine, and cannot assume the GC-mandate works in Thailand. It must win distribution with a
**different, capital-light mix**: product-led entry where crews already are, government subsidy/
credibility programs, a bottom-up free-external viral loop, accountant + non-conflicted-bank channels,
and localization moats (ราคากลาง/e-GP) the internationals lack — while explicitly **avoiding the
BUILK-conflicted and SCG-controlled channels**.

---

## 2. The capital-light distribution playbook (ranked, each = evidence → action)

### 2.1 Build the field product LINE-native (MINI App + Official Account) 📊 → 📋

**Evidence:** LINE has **56M MAU = 85.7% of Thai internet users** ([DataReportal 2025](https://datareportal.com/reports/digital-2025-thailand));
Thai construction crews live on LINE (the real incumbent is "LINE + Excel + paper"). LINE **MINI Apps**
(LIFF) run _inside_ the chat with **no app-store install**, and Thailand is an officially supported
region ([LINE MINI App docs](https://developers.line.biz/en/docs/line-mini-app/develop/develop-overview/)).

**Action:** ship the contractor/crew-facing surface as a **LINE MINI App + Official Account** (push job
updates, approvals, photos, daily reports through LINE) so adoption friction ≈ zero and COS meets the
incumbent behavior head-on. ⚠️ Barrier: verified status in Thailand needs a **certified provider** —
either become one or partner with one (an early decision).

### 2.2 Register as a depa Digital Provider → customers pay with the SME voucher 📊 (highest capital-light leverage)

**Evidence:** depa's **SME Digital Coupon / mini-Transformation Voucher** gives eligible SMEs a
subsidy (widely reported **~10,000 THB**) to subscribe to software from a **depa-registered Digital
Provider**; eligible categories include ERP/accounting/PM/IoT ([depa voucher](https://www.depa.or.th/th/smedigitalcoupon)).
Providers register via **Tech Hunt** ([techhunt.depa.or.th](https://techhunt.depa.or.th/)) and get listed
in depa's official catalog.

**Action:** become a depa Digital Provider so a government subsidy becomes a **direct CAC discount** and
COS gains a credibility listing — near-zero capital. ⚠️ Confirm a construction-management SaaS maps to an
accepted category (construction is not explicitly named; it fits via ERP/PM/accounting buckets).

### 2.3 Weaponize the free-external-collaborator decision (§26.1.1) as a BOTTOM-UP viral loop 📊 → 📋

**Evidence:** free external collaborators are Procore's #1 lead source (~40% of new customers were prior
free collaborators; avg customer invites 170) — but the **GC-mandate top-down version is ⚠️ unverified
in Thailand** (§1).

**Action:** run the loop **bottom-up** — subcontractors/vendors use COS free (per the §26.1.1 decision),
experience it, and **pull their GCs onto COS** (and other GCs pull the sub). Don't wait for a developer
decree that has no Thai precedent. The §26.1.1 "unlimited free external" decision is the engine; the
motion is sub-led, not mandate-led.

### 2.4 Use accountants as a referral channel via FlowAccount / PEAK integration 📊 → 📋

**Evidence:** **FlowAccount** (130k+ businesses, **5,900+ accounting-firm partners**, public API) and
**PEAK** (1,200+ firms, REST API) are the two Thai cloud-accounting platforms with public APIs +
accountant-partner networks ([FlowAccount](https://flowaccount.com/en/about-us),
[PEAK developers](https://www.peakaccount.com/developers)). Precedent: **banks already distribute SME
SaaS** — KBank gives FlowAccount free to K-SME customers; Krungsri funded PEAK.

**Action:** integrate COS's finance/AR-AP with FlowAccount/PEAK (a real product feature) **and** enlist
their accountant-partner networks as a referral channel to SME contractors. Accountants are a trusted,
low-CAC route into the exact SME segment.

### 2.5 Enter a NON-conflicted bank accelerator/ecosystem — never KBank or Krungsri 📊

**Evidence (conflict map):** **Beacon VC (KBank) and Krungsri Finnovate both back BUILK** → hard
conflict ([Beacon/BUILK](https://www.beaconvc.fund/in-the-news/beacon-vc-invests-in-builk-leading-construction-tech-to-strengthen-the-thai-construction-platform)).
Non-conflicted options: **Bangkok Bank InnoHub + Bualuang Ventures** (rolling applications, "Future SME
Solution" theme, POC-with-bank + investment path — [InnoHub](https://www.bangkokbankinnohub.com/the-program/)),
**SCB Business Anywhere** (partner ecosystem), **Krungthai (KTB)** — state-owned, dominant in
**government construction payments** (fits the public-works contractor segment).

**Action:** pursue **Bangkok Bank InnoHub** as the primary non-conflicted accelerator/CVC path; use SCB
Business Anywhere / KTB as marketplace + embedded-finance surfaces. **Avoid KBank/Beacon and
Krungsri/Finnovate entirely.**

### 2.6 Own the public-works contractor wedge with government-procurement levers 📊 (COS-unique)

**Evidence:** **THAI SME-GP** gives registered SMEs a **30% government-procurement set-aside + up to 10%
price preference** in e-bidding, on a ~1.3T THB/yr procurement market ([THAI SME-GP](https://www.bangkokbanksme.com/en/thai-sme-gp-promotes-sme-government-procurement)).
**e-GP** procurement data is open ([gprocurement](https://www.gprocurement.go.th/)); **ราคากลาง**
(CGD central-pricing Factor-F methodology) + **MOC monthly material-price** feeds are public open data
([MOC prices](https://index.tpso.go.th/construction-material-prices)). **No competitor localizes any of
this** (Procore Thai UI = beta; Autodesk = no Thai; KANNA/BUILK/ANDPAD don't do ราคากลาง BOQ).

**Action:** build three sticky, COS-unique features: (a) **ราคากลาง-compliant BOQ/cost estimation** using
the free CGD + MOC data; (b) a **THAI SME-GP eligibility/registration helper** that flags when a
contractor's bid qualifies for the 30%/10% edge; (c) an **e-GP tender feed** surfacing government jobs
in-app. This wins the large public-works SME segment (which KTB also serves) with tangible ROI — and it
is defensible localization the internationals cannot match. **Recommend adding ราคากลาง + e-GP to the
spec** (Phase 4 BOQ / Phase 5 procurement do not currently mention them).

### 2.7 Fund infra + capital cheaply (keeps a free tier affordable) 📊

**Evidence:** **AWS Activate** ($100–200K credits) + the new **AWS Bangkok region (launched Jan 2025)**
for PDPA data-residency ([AWS TH region](https://aws.amazon.com/blogs/aws/announcing-the-new-aws-asia-pacific-thailand-region/));
**Microsoft for Startups** ($150K Azure, bootstrapper-friendly); **Google for Startups SEA Accelerator**
($350K, AI-focused, Thailand included); **depa Digital Startup Fund** (non-dilutive, up to **5M THB**);
**BOI Activity 8.1.1** (up to **8-yr corporate-tax exemption** + 100% foreign ownership for software dev).

**Action:** stack cloud credits + depa grant + BOI to lower burn so a **genuinely free/freemium field
tier** (the wedge that matches BUILK-free and KANNA-free-trial) is affordable — funded by investment +
paid conversion, **not** materials margin (see §3).

### 2.8 Low-cost top-of-funnel 📊 → 📋

**Evidence:** active Thai contractor Facebook communities exist (organic reach); KANNA acquires via
events (Manufacturing Expo BITEC, executive seminars) — capital-heavy.

**Action:** lean organic acquisition — Thai contractor Facebook groups, ราคากลาง/BOQ how-to content
(BUILK's playbook is content + community: workshops, Rakmao Fest), and selective event presence — rather
than KANNA-scale seminars.

### 2.9 If pursuing materials co-marketing, use NON-SCG partners only 📊

**Evidence:** **SCG controls the channels to AVOID** — **Global House (SCG 32.94%)**, **NocNoc (SCG
50%)**, **Cotto/Sosuco (SCG Ceramics)** — all would steer contractors to BUILK
([Global House shareholders](https://investor.globalhouse.co.th/en/major-shareholders/)). **Viable
non-SCG** materials channels with existing contractor programs: **INSEE / Siam City Cement** (INSEE Life
loyalty + the **INSEE Alliance** 12-brand co-marketing consortium — [INSEE Alliance](https://www.siamcitycement.com/thailand/en/media/detail/launching-insee-alliance-)),
**Do Home**, **HomePro / Mega Home** (Mega Home is contractor-focused wholesale), **Thai Watsadu (Central
Retail)**.

**Action (optional, later phase):** if a materials co-marketing channel is wanted, court **INSEE
Alliance / Do Home / HomePro-Mega Home / Thai Watsadu** — never SCG-linked chains. But see §3: don't try
to _become_ a materials marketplace.

### 2.10 Industry associations + trade shows (cheapest membership-free entry) 📊 → 📋

**Evidence:** Thailand has active, on-target industry bodies and a fixed trade-show calendar a vendor can
plug into without a membership gate — only sponsorship/booth cost:

- **Thai Contractors Association (TCA, สมาคมอุตสาหกรรมก่อสร้างไทย)** — represents contractor firms (the
  buyer) and explicitly runs **training/seminars** ([tca.or.th](https://www.tca.or.th/)).
- **Engineering Institute of Thailand (EIT, วสท.)** — reaches site engineers/PMs and already **sells
  seats to training courses via an online platform** you could co-deliver on
  ([eit.or.th course platform](https://www.eit.or.th/order/search)).
- **Home-builder / housing developer associations** — HBA/THBA and the Housing Business Association run
  member expos (Home Builder & Materials Expo, House & Condo Expo) whose members are exactly SME–mid
  residential contractors ([hba-th.org](https://www.hba-th.org/), [housingbiz.org](https://www.housingbiz.org/home-EN)).
- **Major trade shows** — Architect/ASA Expo (ASEAN's largest building expo), **BCT Expo** and
  **CBA Expo (Thailand Construction Expo)** skew closer to contractors/builders
  ([architectexpo](https://architectexpo.com/2025/about-the-expo/), [cba-expo](https://cba-expo.com/)).

**Action:** capital-light entry = **speak/run a workshop at TCA or on EIT's course platform, and exhibit
or co-market a talk at BCT/CBA/House & Condo expos** — the cheapest way to reach clustered contractor
buyers without a channel-partner deal. ⚠️ No vendor-partnership _program_ is confirmed at any body — the
route is sponsorship/speaking, not an official partner track; association member counts are UNVERIFIED
(only ASA's ~10,000 architects is official). **COE (สภาวิศวกร) is a regulator — useful for market sizing
and credibility, not distribution.**

---

## 3. What NOT to do (each backed by evidence)

- **Don't replicate BUILK's materials-margin model.** BUILK funds free software with ~500M of 570M
  revenue from YELLO materials, backed by SCG. Competing as a materials marketplace = fighting SCG on its
  turf — and **NocNoc (SCG, 50%) reportedly shut down in 2026 with ~4.39bn baht losses**; Indonesia's
  Gravel collapsed Dec 2024. 📊 COS's §26.1.1/§28.2 already defers vendor-marketplace — stay
  **software-first** (SaaS subscription of the paying GC, like Procore/KANNA).
- **Don't bet on the GC-mandate motion in Thailand** — ⚠️ unverified there (§1); run the free-external
  loop bottom-up instead.
- **Don't approach KBank/Beacon, Krungsri/Finnovate, or any SCG-controlled channel** — all BUILK-conflicted 📊.
- **Don't out-spend KANNA on local office + executive events** — match its _localization_ (Thai UI is
  table stakes) but win on scope + the capital-light channels above, not on sales headcount.
- **Don't rely on developer/GC PropTech CVCs for a contractor SaaS** — Sansiri/Origin/SC Asset invest in
  **lifestyle/home-services**, not contractor tools 📊 (poor fit).

---

## 4. Suggested sequencing (📋 judgment — depends on §7 decisions)

- **Phase 1 — LAND (product-led wedge):** LINE-native field app (2.1) + free/freemium tier funded by
  startup credits/grants (2.7) + depa Digital Provider voucher (2.2) + accountant referrals (2.4) +
  organic Facebook/content (2.8). Goal: seed the SME base at near-zero CAC.
- **Phase 2 — EXPAND (network + government):** free-external bottom-up loop (2.3) + government-procurement
  features (2.6, the public-works wedge) + non-conflicted bank accelerator/embedded finance (2.5). Goal:
  viral expansion + a defensible SME/gov segment.
- **Phase 3 — DEFEND (moat):** deepen the transactional chain (procurement→cost→finance) + ราคากลาง/e-GP
  localization + AI + offline-first — the combination no competitor holds (see competitive-landscape §6).
  Optional non-SCG materials co-marketing (2.9). Goal: lock-in the integrated OS advantage.

---

## 5. Open decisions — I do NOT have the data to decide these (not guessed)

1. **Capital / runway** — BUILK funds free software with materials margin; COS must fund a free tier from
   investment + paid conversion. What is COS's runway and target free→paid conversion? Unknown to me.
2. **Raise from a non-conflicted CVC (Bangkok Bank / SCB / InTouch InVent) vs stay independent** — a
   financing + channel decision only the owner can make.
3. **LINE certified-provider path** — become one, or partner with one, to get verified MINI App status
   in Thailand.
4. **Thai go-to-market team** — KANNA has a Bangkok office + local hires; does COS build one, and when?
5. **Which specific partners to court** (INSEE vs Do Home vs Mega Home; FlowAccount vs PEAK) — requires
   direct BD conversations; I identified the verified candidates but cannot pick for you.

---

## 6. One-line answer

COS out-distributes these competitors **not by matching their capital-heavy motions** (BUILK's
materials flywheel, KANNA's local sales machine) but by being **LINE-native + government-subsidy-funded
(depa voucher) + bottom-up free-external-viral + accountant/non-conflicted-bank-channeled + localized
around ราคากลาง/e-GP** — a capital-light stack that reaches the 83%-non-digital SME long tail where the
incumbents' strengths don't apply, while **avoiding every SCG/KBank/Krungsri channel that is wired to
BUILK.**

---

## 7. Key UNVERIFIED items

- Whether a construction-management SaaS is an **accepted depa voucher category** (fits generic buckets;
  construction not explicitly listed — confirm with depa).
- No official **write/integration API** for e-GP or THAI SME-GP (read-only open data only) — the value is
  guidance/workflow, not bid submission.
- LINE OA Thailand exact plan prices; AWS/Azure Marketplace TH terms; telco-marketplace listing terms;
  Facebook contractor-group sizes — all UNVERIFIED specifics.
- Any GC-mandate-of-subcontractors precedent in Thailand — none found.
- Exact BUILK YELLO take-rate; TQM insurance-agent cross-sell mechanics — UNVERIFIED.
</content>
