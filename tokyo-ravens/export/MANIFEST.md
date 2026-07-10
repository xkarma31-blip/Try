# Stage 17 — Final Export & Publishing

**Input:** QC-passed assets (Stages 1–16). **Action:** package + version per naming convention;
archive with version tags. (Rendered images/PDFs are produced by the connected image-gen / Canva
tools; this manifest defines the deliverable set + filenames so handoff is unambiguous.)

## Naming convention
`vol2_<asset>_ep<NN>_v<VER>.<ext>`
- asset ∈ {beat, outline, scenes, dialogue, prose, screenplay, storyboard, charprompt, bgprompt,
  voscript, canvabrief, qcreport}
- NN = episode number (00 = volume/global), VER = revision (v1, v2…)
- Examples: `vol2_scenes_ep01_v1.md`, `vol2_screenplay_ep03_v1.md`, `vol2_qcreport_00_v1.md`

## Deliverable manifest (versioned v1)
**Data / canon (global, ep00)**
- `data/canon_db.json` → `vol2_canon_00_v1.json`
- `data/characters_db.json` → `vol2_characters_00_v1.json`
- `data/timeline.json` → `vol2_timeline_00_v1.json`
- `data/locations.json` → `vol2_locations_00_v1.json`
- `continuity_ledger.md` → `vol2_ledger_00_v1.md`

**Story layer**
- `story/vol2_beat_sheet.md` → `vol2_beat_00_v1.md`
- `story/vol2_ep_outline.md` → `vol2_outline_00_v1.md`
- `story/ep01_scenes.md` … `ep05_scenes.md` → `vol2_scenes_epNN_v1.md`

**Script layer**
- `script/ep01_dialogue.md` … `ep05_dialogue.md` → `vol2_dialogue_epNN_v1.md`
- `script/ep01_prose.md` … `ep05_prose.md` → `vol2_prose_epNN_v1.md`
- `script/ep01_screenplay.md` … `ep05_screenplay.md` → `vol2_screenplay_epNN_v1.md`

**Visual / audio / publish**
- `visual/storyboard_ep1_5.md` → `vol2_storyboard_00_v1.md`
- `visual/char_prompts.md` → `vol2_charprompt_00_v1.md`
- `visual/bg_prompts.md` → `vol2_bgprompt_00_v1.md`
- `audio/ep01_vo_script.md` → `vol2_voscript_ep01_v1.md` (Eps 2–5: replicate from screenplays)
- `publish/canva_briefs.md` → `vol2_canvabrief_00_v1.md`

**QC**
- `qc/report_vol2.md` → `vol2_qcreport_00_v1.md`

## Packaging instructions
1. Render character/BG prompts (Stages 12–13) via connected image-gen → place into Canva template
   zones (Stage 15). Export PNG/PDF per template.
2. Lock VO (Stage 14); render Eps 2–5 VO scripts before audio final.
3. Archive all versioned files under `export/` with the names above.
4. Bump `_v1` → `_v2` on any revision; every revision re-runs Stage 16 QC.

## Stage 17 gate
- All listed files present (as source .md/json); versioned; named per convention.
- **Open before final sign-off:** CR-1 (Natsume reveal) creative-direction decision (see qc report).
- **RESULT: PACKAGE READY (pending CR-1).**

---
*Pipeline complete: Stages 1–17 executed. Architecture is volume-agnostic — for Vol.3+, re-run
Stages 1–4 for new material; Stages 5–17 reuse the same skill/prompt library.*
