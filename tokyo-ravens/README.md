# Tokyo Ravens — Vol.2 "RAVEN'S NEST" Production Pipeline

AI-assisted virtual-studio pipeline (see spec). All content flows through a single
source of truth (`data/canon_db.json`) and a running decision log
(`continuity_ledger.md`). Nothing downstream may invent canon.

## Directory map
```
tokyo-ravens/
  README.md                 # this file
  continuity_ledger.md      # running diff of every decision vs canon/inference
  data/
    canon_db.json           # single source of truth (Stage 1->2)
    characters_db.json      # per-character bible (Stage 3)
    timeline.json           # chronology (Stage 4)
    locations.json          # spatial map (Stage 4)
  prompts/                  # 11 reusable prompt files (§5.1-5.11)
  story/                    # beat sheet, episode outline, scene lists
  script/                   # dialogue, LN prose, screenplay
  visual/                   # storyboard, char/bg prompts
  audio/                    # voice scripts
  publish/                  # canva briefs
  qc/                       # QC reports
  export/                   # versioned final deliverables (vol2_epNN_vN)
```

## How to run
1. Confirm scope (volume/arc) and lock it in `continuity_ledger.md`.
2. Run Stages 1-4 once per volume (research -> canon DB -> character DB -> timeline).
3. Run Stages 5-17 per episode, always reading from the same DBs.
4. Every stage output is QC-checked before moving on.
5. Publish via Canva templates; archive with version tags.
6. For volume 3+, repeat Stages 1-4 for new material only.

## Governance
- Failed blocking QC check (see spec §6) halts the next phase.
- No Vol.2 chapter text is fabricated; real source material must be supplied at Stage 5.
