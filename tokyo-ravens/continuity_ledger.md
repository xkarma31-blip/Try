# Continuity Ledger — Tokyo Ravens Vol.2 RAVEN'S NEST

Running diff of every decision made against canon or inference. Entries are append-only; never edit history, only add new rows.

## Session 2026-07-10 — Stages 1-2 (Research + Canon DB)

### Scope lock
- CONFIRMED: "Vol.2" = LN Vol.2 "RAVEN'S NEST" (Sept 9, 2010). Architecture volume-agnostic.
- Anime (24 eps, covers LN 1-9) used as adaptation *reference only*, not primary Vol.2 scene canon.

### Research verification (Canon Researcher, Stage 1)
- VERIFIED HARD CANON: Author Kōhei Azano / Illus. Sumihei / Fujimi Fantasia Bunko. (WP, Goodreads, Fandom Vol2, RanobeDB)
- VERIFIED HARD CANON: Vol.2 title/date/ISBN 978-4-8291-3552-5. (Fandom Vol2, CDJapan, RanobeDB)
- VERIFIED HARD CANON: Anime Eight Bit / Takaomi Kansaki / Hideyuki Kurata, 24 eps, Oct 9 2013-Mar 26 2014. (WP, MAL, Dubbing fandom)
- VERIFIED HARD CANON: Yakou / Taizan Fukun / Great Spiritual Disaster / Onmyo Agency backbone. (WP, MAL, Alchetron, Fandom)
- CORRECTION to spec §0.3: Vol.2 has a REAL 5-chapter structure, not just placeholders:
  1. Young Ravens' Academy  2. Ears and Tail  3. Shikigami Showdown  4. Tricks  5. One-Armed Oni
  (Fandom Vol2 + Baka-Tsuki PDF on archive.org)

### Decisions / inferences logged
- D-01: Onmyo Agency HQ = Akihabara tagged INFERRED (not independently re-verified). OK for BG art; upgrade if primary source needed.
- D-02: Suzuka phrased in spec as "emotional/social correction" — corrected to "penalty imposed by the Onmyo Agency" per WP ep.10. Both reflect same beat; use penalty framing in scripts.
- D-03: Suzuka "youngest ever First-Class Onmyouji" → verified as "youngest member of the Twelve Divine Generals" (elite First-Class). Consistent; keep.

### Continuity risks opened
- CR-1: Natsume gender-reveal timing across LN/manga/anime — OPEN, needs creative-direction decision before Stage 10 (screenplay).
- CR-2: Yakou reincarnation / Harutora-true-heir / Kon-as-Hishamaru — LOCKED OUT of Vol.2 scope (later reveal).
- CR-3: Natsume tone-calibration (divisive/"manipulative" in source) — FLAG for Canon QC Auditor (non-blocking); preserve canon behavior, no softening/exaggeration without logged decision.
- CR-4: Vol.2 beat-level scene text not yet extracted — BLOCKS Stage 5 until Baka-Tsuki PDF ingested.
- CR-5: Agency HQ Akihabara INFERRED (see D-01).

### Blocking status
- Stage 1->2 (Research->Canon DB): PASS. canon_db.json schema valid, every HARD_CANON claim cites >=1 source.
- Stage 2->3 (Canon DB->Character DB): READY. characters_db.json (Stage 3) can reuse the `characters` block already in canon_db.json.
- Stage 5 (Story Breakdown): BLOCKED by CR-4 until real Vol.2 text supplied.

## Session 2026-07-10 — Stages 3-4 (Character DB + Timeline/Locations)

### Stage 3 — Character DB (characters_db.json)
- PROMOTED canon_db.json `characters` block into full bible. All 8 characters meet the
  >=5 visual + >=3 behavioral anchor rule (Stage 3 spec).
- Visual anchors based on Eight Bit anime adaptation (covers LN 1-9 incl. Vol.2) and
  tagged INFERRED (anime adaptation reference) — LN-specific descriptions not re-verified.
- VOICE refs captured (JP/EN seiyuu) for Stage 14 direction.
- LINKS: CR-2 (Kon/Hishamaru reserved), CR-3 (Natsume tone), CR-1 (Natsume reveal visual tells).

### Stage 4 — Timeline (timeline.json) + Locations (locations.json)
- Vol.2 internal order LOCKED: Ch1 Young Ravens' Academy -> Ch2 Ears and Tail ->
  Ch3 Shikigami Showdown -> Ch4 Tricks -> Ch5 One-Armed Oni.
- NEW CONSTRAINT logged: Suzuka's on-page Academy *enrollment* is Vol.3-4 (GIRL RETURN),
  NOT Vol.2. She must NOT be seated as a classmate in Vol.2 Academy scenes. Corrects the
  spec §0.2 phrasing ("sent to the Academy") which could mislead staging.
- Akihabara HQ remains INFERRED (CR-5).
- QC: zero timeline contradictions vs canon_db.json.

### Stage gate status
- Stage 2->3: PASS. Stage 3->4: PASS. Stage 4->5: BLOCKED by CR-4 (need real Vol.2 text).

## Next actions
- [ ] Resolve CR-4: ingest Baka-Tsuki Vol.2 PDF (archive.org) before Stage 5.
- [ ] Resolve CR-1: creative-direction decision on Natsume reveal continuity.
- [ ] Stage 5+: Story Breakdown -> Episode Planning -> Scene Planning per episode.
