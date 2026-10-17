# Drift Watch: Semantic Policy Drift Detection on GenLayer

Status: Preview (Studionet)  
Network: Studionet (Chain ID: 61999)  
Explorer: [GenLayer Studionet Explorer](https://explorer-studio.genlayer.com)  

Drift Watch is an intelligent contract system for GenLayer that detects semantic policy drift in external web terms and policies. It sounds an alarm when the *meaning* of a monitored terms page changes against an integrator's explicit "red lines", while remaining silent when text formatting, layout, section order, or dates are altered.

## Problem Statement

Modern decentralized applications, DAOs, and service integrators routinely rely on external APIs, RPC providers, infrastructure services, and token issuers whose terms of service and privacy policies are updated without notice. Existing monitoring tools either:
1. **Trigger False Alarms**: Hash or visual diffs trigger on trivial cosmetic updates (CSS changes, reordered clauses, updated copyright years).
2. **Miss Meaning Flips**: Subtle one-word deletions (such as changing "share anonymized statistics" to "share statistics") evade keyword or length diffs while completely flipping data-sharing rights.
3. **Succumb to Salami Attacks**: Comparing each version only to the previous version ($N$ vs. $N-1$) allows incremental relaxation of user protections over multiple minor revisions.

## Mechanism

Drift Watch introduces a multi-stage deterministic and semantic pipeline:
- **Baseline Anchoring**: A watch registers a target URL and explicit plain-English red lines. The accepted baseline is saved as a canonical set of normalized clauses.
- **Deterministic Cosmetic Gate**:
  - `UNCHANGED`: If raw page bytes match the baseline raw hash, execution terminates immediately.
  - `COSMETIC`: If raw bytes differ, but the order-insensitive normalized clause hash (`norm_hash`) matches the baseline, execution terminates with `COSMETIC`. No LLM inference is triggered.
- **Semantic Diff & Red Line Evaluation**: When clauses differ, deterministic code isolates modified, added, and removed clauses. If fewer than or equal to 12 clauses changed, validators pass only the diff and red lines to an LLM evaluator.
- **Strict Consensus Primitive**: Validators run strict consensus (`gl.eq_principle.strict_eq`) on a single canonical string: `"<VERDICT>|<norm_hash16>"` (where `VERDICT` is one of `UNCHANGED`, `COSMETIC`, `NONE`, `MINOR`, `MATERIAL`, or `REVIEW`).
- **DriftGuard Consumer Contract**: Integrators pin their reviewed baseline and red line hashes in `DriftGuard`. A synchronous view call (`is_safe` / `is_safe_for`) allows dApps to dynamically check whether the dependency remains safe.

## Why GenLayer

GenLayer enables contracts to access the public internet via non-deterministic execution (`gl.nondet.web.get`) and run language models (`gl.nondet.exec_prompt`) under consensus. Independent validators fetch the live terms page, compute hashes, evaluate meaning against user-defined red lines, and agree on a canonical verdict on-chain. Solidity and traditional EVM chains cannot read the live web or judge semantic meaning without centralized intermediaries.

## Non-Goals

- **Continuous Background Monitoring**: Checks are performed on-demand when invoked by a transaction. There is no automated cron within the contract.
- **Legal Compliance Advice**: The contract does not determine statutory legality; it evaluates adherence to the user's specific red lines.
- **JavaScript Single-Page Apps**: Pages requiring client-side JS rendering are unsupported and rejected with `UserError`.
- **Order-Dependent Legal Interpretation**: Clause reordering is treated as cosmetic.

## Repository Structure

```
├── contracts/
│   ├── DriftWatch.py       # Main intelligent contract
│   └── DriftGuard.py       # Multi-contract consumer guard
├── docs/
│   ├── DESIGN.md           # Architecture and consensus rationale
│   ├── LIMITATIONS.md      # Honest technical boundaries
│   ├── PRIOR_ART.md        # Prior art and difference table
│   ├── RUNTIME_NOTES.md    # Studionet probe findings
│   ├── INTEGRATION.md      # Method specifications and JSON payloads
│   ├── ERROR_CODES.md      # Comprehensive UserError catalog
│   └── VERIFICATION.md     # Deployment verification and hashes
├── fixtures/
│   ├── EXPECTED.md         # Pre-registered expectations matrix
│   ├── redlines.json       # Acme Notes red lines
│   └── pages/              # Offline test fixture copies (v0 through v7)
├── scripts/
│   ├── deploy/             # Deployment and evidence scripts
│   ├── scan_ascii.py       # ASCII compliance scanner
│   ├── scan_banned_words.py# Banned marketing terminology scanner
│   └── scan_secrets.py     # Secrets and private key scanner
└── tests/
    ├── test_layer1_pure.py # Pure function edge cases and star test
    ├── test_layer2_mocked.py# Contract logic, gates, and UserErrors
    └── test_layer3_consensus.py# Multi-validator consensus simulation
```

## Running Tests

```bash
# Run all unit and integration tests
npm test

# Run code scanners
npm run scan:ascii
npm run scan:banned
npm run scan:secrets
```

## Deployments (Studionet Preview)

Deployment artifacts and verified transaction receipts will be recorded in `scripts/deploy/deployments.json` and `docs/VERIFICATION.md` upon deployment to Studionet.

## License

MIT License - Copyright (c) 2026 Hyper (huzyow155). See [LICENSE](LICENSE) for details.
