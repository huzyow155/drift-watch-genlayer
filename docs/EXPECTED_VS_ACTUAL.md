# Expected vs Actual Matrix

Status: Preview (Studionet)  
Network: Studionet (Chain ID: 61999)  
DriftWatch Contract: `0xe8A159D3622D33aA0B62da57aF033F2C6D9fdEfD`  
Commit: `c8ff0f0cf8b5e406a44baad04867cb793c52d328` (fixtures)  

This document compares pre-registered expectations from `fixtures/EXPECTED.md` (which remains untouched and unedited) against actual observed on-chain receipts on Studionet.

| Fixture | Pre-Registered Expected Verdict | Pre-Registered Gate / Mechanism | Actual Observed Verdict | Transaction Hash (from Receipt) | Receipt Status & Result | Match? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `terms-v0.md` | `UNCHANGED` | Gate 3 (raw byte identity) | `UNCHANGED` | `0x82b5820d57ab1a5fa8d44ca0ee4827c806c6c9b5afea99f3b5f1581523dc6220` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | Gate 3 fired in 15.26s. |
| `terms-v1-cosmetic.html` | `COSMETIC` | Gate 4 (order-insensitive normalized hash) | `COSMETIC` | `0x1d7222215af2815c91fb6f43d37772c050a98b2ff90bd32c0aadbb6535b183b9` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | Gate 4 fired in 11.93s. Whitespace, HTML markup, reordered clauses normalized. |
| `terms-v2-subtle.md` | `MATERIAL` | LLM evaluation (drops "anonymized") | `MATERIAL` | `0x7d0453f88bd3bdeb86505b6e51a9e53e4dd0c85763f4e365be2700cecc534017` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | Single-word deletion evaluated to `MATERIAL` in 18.56s following prompt Iteration 1. |
| `terms-v3-obvious.md` | `MATERIAL` | LLM evaluation (sells data, deletes export) | `MATERIAL` | `0xa7bce01357bb3e3b3637ff0bd49baf8ca4a7485f346f568b6a1163d80acd8be5` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | 2 changes flagged, redlines 3 and 4 violated. Evaluated in 18.42s. |
| `terms-v4-injection.md` | `MATERIAL` | Tripwire override (`tripwire: true`) | `MATERIAL` | `0xeb221091a15bf0abea8ab32cefb346c1074b1bf879534e3bf49f06bd555708ba` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | Tripwire detected injection instruction. Forced to `MATERIAL` in 28.61s. |
| `terms-v5-harmless.md` | `NONE` | LLM evaluation (support email update) | `NONE` | `0x1cfce96ee0deb20228ea23a07a05ca33b8d2e102bd7d6d1be0e2b4c505395f39` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | Harmless contact change evaluated to `NONE` in 22.25s following prompt Iteration 1. |
| `terms-v6-salami1.md` | `MINOR` | LLM evaluation (60d retention <= 90d redline) | `MINOR` | `0x47417c85f11567e62b23550aea3627b50d5f852ab89109d16bd8d36486c2b4f7` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | Operational change within redline boundary evaluated to `MINOR` in 21.87s. |
| `terms-v7-salami2.md` | `MATERIAL` | LLM evaluation (100d retention > 90d redline) | `MATERIAL` | `0xd5cf6b52aa968620b564dd4e81431d514154587c815309622ff65d77ebab1b36` | `ACCEPTED` / `MAJORITY_AGREE` / `SUCCESS` | **Yes** | Cumulative 2-change comparison against baseline v0 detected >90d breach in 22.13s. |
