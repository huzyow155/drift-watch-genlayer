# Prompt Iterations Log

Status: Preview (Studionet)  
Network: Studionet (Chain ID: 61999)  
Rule: Maximum 2 prompt/parser iterations allowed.

---

## Iteration 1

- **Date**: 2026-10-17
- **Reason for Change**:
  Diagnosis via on-chain `ProbeLabels` contract (`0x43c882AA13699503Dfa7B0886e7F64fc92cf41DF`) revealed that when input changes are provided as JSON objects with fields like `index` and `kind`, multiple models (`anthropic/claude-sonnet-4.6`, `policy:prd-minimax`) in 3 out of 6 runs mirrored the object structure and returned an array of objects `[{"index": 1, "label": "MATERIAL"}]` instead of a flat list of strings `["MATERIAL"]`.
  `parse_labels` enforces strict types (`isinstance(item, str)`), so it correctly rejected the objects and fell back to `REVIEW`.
  Furthermore, the schema key was unified to `"redlines"` exclusively, removing the `red_lines` alias since all 6 diagnostic runs proved models consistently output `"redlines"`.

- **Contract Diff Summary**:
  - `contracts/DriftWatch.py`:
    - Updated prompt instructions to explicitly demand:
      `You must output ONLY a JSON object with exactly two keys: 'changes' and 'redlines'.`
      `'changes' must be a FLAT array of strings (one per change in order) from ['NONE', 'MINOR', 'MATERIAL', 'UNCLEAR'].`
      `'redlines' must be a FLAT array of strings (one per red line in order) from ['HIT', 'CLEAR', 'UNCLEAR'].`
      `DO NOT return objects, dictionaries, or keys like 'label', 'index', or 'flag' inside the arrays.`
      `Correct format example: {"changes": ["NONE"], "redlines": ["CLEAR", "CLEAR", "CLEAR", "CLEAR"]}.`
      `Incorrect format: {"changes": [{"index": 1, "label": "NONE"}]}.`
    - In `parse_labels`: Unified strictly on `{"changes", "redlines"}` with `len(keys) == 2`.
  - `tests/test_layer1_pure.py`: Added `test_real_raw_fixtures_rejected_and_accepted` using real captured outputs, and `test_parse_labels_fuzz_5000_seeded` (seed `987654`) against an independent reference oracle.

- **Validation on Studionet**:
  - The 4 exploratory runs initially executed via `test_improved_prompt.js` did not persist raw receipt JSONs to disk and have been removed from this log in accordance with evidence audit standards.
  - Comprehensive, reproducible statistical robustness evidence with full persisted receipt JSONs and raw model outputs across 35 live on-chain runs is documented in [`docs/ROBUSTNESS.md`](ROBUSTNESS.md) and [`docs/evidence/robustness/`](../docs/evidence/robustness/).
  - Real active contract execution across all cases (a)-(k) with full receipts is archived in [`docs/evidence_v2/`](../docs/evidence_v2/).
