# Stage 16 — QA & Canon Verification Report

**Scope:** Full-system audit of Tokyo Ravens Vol.2 "RAVEN'S NEST" pipeline output, Stages 1–15.
**Checks (per spec §6):** Canon Fidelity (blocking), Character Voice Consistency (blocking),
Visual Consistency (blocking), Timeline Integrity (blocking), Format Compliance (non-blocking),
Tone Calibration (non-blocking, flag for creative director).

---

## 1. Canon Fidelity (BLOCKING)
- Every plot/character claim traces to `data/canon_db.json` or is tagged [INFERRED]/[UNCERTAIN].
- Vol.2 beat sheet (Stage 5) = 100% from ingested Baka-Tsuki primary text; **zero fabricated beats**.
- Chapter titles verified against primary text: Ch.4 = "Kodoku" (CR-6 resolved; Fandom "Tricks"
  noted as alt).
- **RESULT: PASS.** No unresolved canon conflicts.

## 2. Character Voice Consistency (BLOCKING)
- Dialogue (Stage 8, all eps) + Voice script (Stage 14, Ep1) match characters_db.json
  behavioral_anchors:
  - Harutora: self-deprecating/"Baka-tora" ✓
  - Natsume: cold/commanding + "Bakatora" ✓
  - Touji: dry/"mendokusai" ✓
  - Kyouko: upbeat→sharp ✓
  - Kon: "Harutora-sama / na no" ✓
  - Miyo: cordial/blunt ✓
  - Ohtomo: Kansai-bright ✓
  - Investigator: zealous "Hishamaru / North Star King" ✓
- **RESULT: PASS.**

## 3. Visual Consistency (BLOCKING)
- Character prompts (Stage 12) use characters_db.json visual_anchors (≥5 each) ✓
- BG prompts (Stage 13) use locations.json tags ✓
- Storyboard image prompts cross-reference both ✓
- **RESULT: PASS.**

## 4. Timeline Integrity (BLOCKING)
- `timeline.json` order: Ch1→Ch5 fixed; episode map (Stage 6) preserves order; no contradictions
  vs canon_db.json.
- **RESULT: PASS.**

## 5. Format Compliance (NON-BLOCKING)
- Screenplays (Stage 10) use INT./EXT. sluglines, action, cues, [bracket SFX/camera] ✓
- Voice script (Stage 14) uses char/line/[delivery] ✓
- Minor: voice scripts for Eps 2–5 are templated (Ep1 exemplar done; replication noted) — acceptable.
- **RESULT: PASS (advisory: complete Eps 2–5 VO scripts before final audio lock).**

## 6. Tone Calibration (NON-BLOCKING — creative-director review)
- **CR-3 (Natsume):** source's prickly/"manipulative" characterization preserved as-written across
  all stages; NOT softened or exaggerated. **FLAGGED for creative-director sign-off** (per spec,
  no alteration without logged decision). No change made.
- **RESULT: FLAGGED, no blocker.**

---

## Continuity Ledger open items
- **CR-1 (Natsume reveal timing):** OPEN. Plan assumes male-public throughout (female voice only at
  S3-07 private blow-up), matching primary text. BLOCKING for final screen lock if an early-reveal
  adaptation is chosen — resolution required before Stage 17 export sign-off.
- **CR-2 (Kon/Hishamaru):** LOCKED-OUT of Vol.2; fake "Kakugyouki" explicitly manmade (S5-05). ✓
- **CR-5 (Agency HQ = Akihabara):** INFERRED; acceptable for BG, not used as primary Vol.2 loc. ✓
- **CR-6 (Ch.4 title):** RESOLVED ("Kodoku"). ✓

## Blocking summary
- All four BLOCKING checks PASS. **Pipeline is canon-safe to propagate.**
- Only OPEN item = CR-1 (creative-direction decision), which is a content/adaptation call, not a
  QC failure.

## Final verdict
**APPROVED FOR EXPORT pending CR-1 sign-off.** All downstream assets may be versioned per naming
convention (Stage 17). Re-audit required only if CR-1 is changed or new Vol.2 text surfaces.
