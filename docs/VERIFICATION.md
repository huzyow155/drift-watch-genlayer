# DriftWatch & DriftGuard: On-Chain Verification & Live Evidence

**Network**: Studionet  
**Chain ID**: 61999  
**RPC Endpoint**: `https://studio.genlayer.com/api`  
**Explorer Base**: `https://explorer-studio.genlayer.com/address/`  
**Execution Account (Throwaway)**: `0x795Ee5E4F8A2cA5B816228B97FE8740dA3Aa7d2a`  
**Fixtures Repository**: `https://github.com/huzyow155/drift-watch-fixtures`  
**Fixtures Commit**: `c8ff0f0cf8b5e406a44baad04867cb793c52d328`  

---

## 1. Deployed Contracts & Byte-for-Byte Source Verification

Source verification was performed by querying the RPC method `eth_getTransactionByHash` for each contract's deployment transaction, decoding the base64 string at `result.data.contract_code`, and verifying that its SHA-256 hash matches the local repository file byte-for-byte.

| Contract | Address | Deploy Tx Hash | Local SHA-256 | On-Chain Decoded SHA-256 | Match Result | Explorer Link |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DriftWatch** | `0x7Ce13F5696f3A81AB5782BC203158691c0D742Cf` | `0xe5eeb4ba21fd7370f3ddd789dce5bcbb382d618abd1ab7f8f2e44102187713e8` | `9d80f1bc271116dae1b29cbf34f823f104d5fca94f6e012140b2686a32fe8e50` | `9d80f1bc271116dae1b29cbf34f823f104d5fca94f6e012140b2686a32fe8e50` | **EXACT MATCH** (0 diff) | [DriftWatch Explorer](https://explorer-studio.genlayer.com/address/0x7Ce13F5696f3A81AB5782BC203158691c0D742Cf) |
| **DriftGuard** | `0x02167c91C7054F7503Ea38200eD293003A8E9e4F` | `0xef8092b855239516c1a3a4b2e85c70733ff5c2245484c1631ae9335db633b4b9` | `eb1b26aed095daf61ad1b94b1752d1636055965311543319d8fe214bc24863dc` | `eb1b26aed095daf61ad1b94b1752d1636055965311543319d8fe214bc24863dc` | **EXACT MATCH** (0 diff) | [DriftGuard Explorer](https://explorer-studio.genlayer.com/address/0x02167c91C7054F7503Ea38200eD293003A8E9e4F) |

Verification output recorded in `scripts/deploy/verification_result.json`.

---

## 2. Live On-Chain Test Matrix (Cases a - k)

All transactions executed against Studionet and validated with full receipts.

| Case | Description | Method | Tx Hash | Latency | Status / Result / Leader | Stored Outcome / Assertion |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Deploy Watch** | Deploy DriftWatch core contract | deployContract | `0xe5eeb4ba21fd7370f3ddd789dce5bcbb382d618abd1ab7f8f2e44102187713e8` | 8.18s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Deployed at `0x7Ce13F5696f3A81AB5782BC203158691c0D742Cf` |
| **Deploy Guard** | Deploy DriftGuard consumer contract | deployContract | `0xef8092b855239516c1a3a4b2e85c70733ff5c2245484c1631ae9335db633b4b9` | 8.60s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Deployed at `0x02167c91C7054F7503Ea38200eD293003A8E9e4F` |
| **Case (a)** | Create watch #1 (`terms-v0.md`) | `create_watch` | `0x06f3ce7fdfa6accf70cef74c3c0313621a76beecab389b78aa96772b7d06d4d2` | 5.18s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Status: `NEEDS_BASELINE`, 4 redlines pinned |
| **Case (a)** | Lock baseline #1 on v0 | `set_baseline` | `0x0cd0875fdefed2fbdfce5f9916e91c3af157324a489d07e01c814ca4c5503f96` | 11.79s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Status: `ACTIVE`, 20 baseline clauses stored |
| **Case (b)** | Check against v0 (Gate 3) | `check` | `0xd6404843707c36c32a282026b8a6e915f4c698760cb26a35dabb69798c0f408f` | 11.77s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #1: verdict `UNCHANGED`, gate `UNCHANGED` |
| **Case (c)** | Update source to `terms-v1-cosmetic.html` | `update_source` | `0xfdeea557f88ce775d33838503cd07406cad4f8a7d1efa1485baa9ab741700fb4` | 8.49s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v1 |
| **Case (c)** | Check against v1 (Gate 4) | `check` | `0x20e9f6dcf05d3e009cb508a59f6e29a4debd9b321f2ddab297e86e0981964355` | 15.03s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #2: verdict `COSMETIC`, gate `COSMETIC` |
| **Case (d)** | Update source to `terms-v2-subtle.md` | `update_source` | `0xe2a2d4e8daf4de5c1cbd6b792d8482b14c2c385dcae343ac41f8a10fe5e0d250` | 8.56s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v2 |
| **Case (d)** | Check v2 (subtle: drops "anonymized") | `check` | `0x697c949a5df96322db16420a35ff14ad708281a448b4c60461bf11c08ca98e05` | 25.03s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #3: verdict `REVIEW` (fail-safe conservative label) |
| **Case (d)** | Update source to `terms-v3-obvious.md` | `update_source` | `0xbcdab529b0d13e67a3ebe3305b180fcf061afb58a2c251b691a8c5a72eab0d07` | 5.28s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v3 |
| **Case (d)** | Check v3 (obvious: sells data, deletes export) | `check` | `0x8079a8a3a7f72529edfd9d0cf6978d18d62338389aca783278bba7b38b149a6b` | 28.35s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #4: verdict `MATERIAL`, 2 changes flagged |
| **Case (d)** | Update source to `terms-v4-injection.md` | `update_source` | `0x860b77e014037f264c5cfcc7d91315b2355f8195f3a4a52c73ef3098cc7ca2e1` | 8.54s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v4 |
| **Case (d)** | Check v4 (injection attempt) | `check` | `0xc869fd4bce3784f9393f3bd8869c82f6dc4a288c684efa2754476069c0541ac4` | 28.77s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #5: verdict `MATERIAL`, `tripwire: true` |
| **Case (d)** | Update source to `terms-v5-harmless.md` | `update_source` | `0xc4244f381ce7ee92ca8cc95146b67910ea02098d9b5a7a831e07f44a08407717` | 8.53s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v5 |
| **Case (d)** | Check v5 (harmless support email change) | `check` | `0xf664d88670e795b6129b9c9566f2b48e93709d5b866a371fd13057d58a4d9f2c` | 15.20s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #6: verdict `REVIEW` (fail-safe conservative label) |
| **Case (d)** | Update source to `terms-v6-salami1.md` | `update_source` | `0x6a5066fe206fb2df0df7471505f692a028fdae554877ab37b1df44983b2a2164` | 5.53s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v6 |
| **Case (d)** | Check v6 (salami1: 60d retention <= 90d redline) | `check` | `0xd7084d6e5a94db6cab1cdfd2f709b6953bdf9d5f92e2db09f19e265dbe585de6` | 18.61s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #7: verdict `MINOR` |
| **Case (e)** | Baseline-never-moves verification | `get_watch` | readContract | <1.0s | SUCCESS | Baseline seq remained `1`, baseline hash strictly matches v0 |
| **Case (d)** | Update source to `terms-v7-salami2.md` | `update_source` | `0x23ec11b9f282a09edf50dd8cee2b33e3fa0248b7da91fa4b10306f8101325fe6` | 5.18s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v7 |
| **Case (d)** | Check v7 (salami2: 100d retention > 90d redline) | `check` | `0x4426f0d45b2a680aece992fe4b9eb3a1d77c0c9110d8fc839d0525fb3875759a` | 28.52s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #8: verdict `MATERIAL`, 2 cumulative changes |
| **Case (f)** | Duplicate observation rejection | `check` | `0xa494f4114c6b5ba6da9937dad1817f1de5551f65a6cca28d0c802260547f1f50` | 160.63s | ACCEPTED / MAJORITY_AGREE / ERROR | Rejected with `duplicate observation: already recorded in check 8` |
| **Case (g)** | Create 404 watch | `create_watch` | `0xe4bceda774d20c31fc8e734099708f463f86029fe8c91c18ca8eb75c1f55dad5` | 8.61s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Watch #2 created |
| **Case (g)** | Set baseline on 404 URL | `set_baseline` | `0xa999067de1012f9a0cec66ff3171d4aa84a6893a30e3be721e26d983b7a1b160` | 41.85s | UNDETERMINED / MAJORITY_DISAGREE / ERROR | Rejected with HTTP 404 status error |
| **Case (g)** | Update source to mismatched host | `update_source` | `0x40689d470d67fe962dbce1fb06597413bf1e1b8a3a18b95c113fb24f74ac596d` | 8.73s | ACCEPTED / MAJORITY_AGREE / ERROR | Rejected with `host mismatch: cannot change monitored domain` |
| **Case (h)** | Accept change from check #6 | `accept_change` | `0xfbec551c17e16a209eddd538694bd8456d0039092bd71dedb7ef7d05df7df230` | 5.29s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Baseline seq advances to `2`, baseline check id `6` |
| **Case (h)** | Update source back to v5 | `update_source` | `0x12853bf293863ed71643671da3efbb7657b55493473f769d283efcc8e380ba89` | 8.48s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Monitored URL set to v5 |
| **Case (h)** | Check v5 against new baseline | `check` | `0xc223951902845141a4734cf71be9531175a95d0b347bca6ca8cb80786dcc2b17` | 11.77s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #9: verdict `COSMETIC`, gate `COSMETIC` |
| **Case (i)** | Create fresh watch #3 for DriftGuard | `create_watch` | `0x97042ae521e650bce4a9c922bee9e9846babc32af5054aa6c9942ccf18ca15cc` | 5.16s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Watch #3 created |
| **Case (i)** | Set baseline on watch #3 | `set_baseline` | `0x4a2384ef43b6dae75a89790aa061ee6d38d93c5881551570b856e5129955df20` | 11.79s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Watch #3 active |
| **Case (i)** | Pin watch #3 in DriftGuard | `pin` | `0x51fe79202cad6ba6215edc792b5c746c391a942ccff6ed896d11e41da57091cb` | 8.65s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Guard state: `NO_CHECK_YET`, `safe: false` |
| **Case (i)** | Check v0 on watch #3 | `check` | `0x2a47a240493ec42e52a92838cf7af69171018e5937a7a88243ace300fc5de5c2` | 11.91s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Guard state: `OK`, `safe: true` |
| **Case (i)** | Update watch #3 to v2 & check | `check` | `0x8ed862c2e2495d698f281c0a78f4c1696151f43dbbe77901162b359fafb8814e` | 58.67s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Guard state: `ALARM`, `safe: false` |
| **Case (i)** | Acknowledge check #11 | `acknowledge` | `0x0418f24169c9d7beb5b024e8590d605ca72486ecd14e934ce691fe5abb49a02b` | 8.51s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Guard state: `ACKNOWLEDGED`, `safe: true` |
| **Case (i)** | Accept change on watch #3 | `accept_change` | `0x07bf3bc07bc05c5bd576aeab52a29cd5649db1b3fad53044533fadb89a19f86e` | 8.53s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Guard state: `BASELINE_CHANGED`, `safe: false` |
| **Case (i)** | Repin watch #3 in DriftGuard | `repin` | `0x7ae689ee19f59d6a0efd9abd12c138310b8b1e1b56a2c56034a82b005f522b33` | 8.62s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Baseline hashes updated |
| **Case (i)** | Check v2 on watch #3 | `check` | `0xd4a50a7ddbf80f9cfe5fefd906c33f33f729d206cbef6fc1b6920ee5e7b36d22` | 11.81s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Guard state: `OK`, `safe: true` |
| **Case (i)** | Synchronous `is_safe_for` binding | `is_safe_for` | readContract | <1.0s | SUCCESS | Valid hashes -> `true`; tampered -> `false` |
| **Case (j)** | Read on-chain stats counters | `get_stats` | readContract | <1.0s | SUCCESS | Total checks: `12`, Cosmetic: `3`, Material: `3`, Minor: `1`, None: `0`, Review: `3`, Unchanged: `2` |
| **Case (k)** | Verify `is_alarm_for` binding | `is_alarm_for` | readContract | <1.0s | SUCCESS | Valid check candidate -> `true`; tampered -> `false` |

---

## 3. Expected vs Observed Matrix

Comparison between pre-registered expectations in `fixtures/EXPECTED.md` and live on-chain results:

| Fixture | Target | Expected Verdict | Observed Verdict | Expected Gate | Observed Gate | Tripwire | Agreement Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `terms-v0.md` | `terms-v0.md` | `UNCHANGED` | `UNCHANGED` | `UNCHANGED` | `UNCHANGED` | `false` | **Exact match**: Deterministic Gate 3 fired in 11.77s. |
| `terms-v1-cosmetic.html` | `terms-v0.md` | `COSMETIC` | `COSMETIC` | `COSMETIC` | `COSMETIC` | `false` | **Exact match**: Deterministic Gate 4 fired in 15.03s. HTML tags, curly quotes, and reordered sections normalized cleanly. |
| `terms-v2-subtle.md` | `terms-v0.md` | `MATERIAL` | `REVIEW` | none | none | `false` | **Fail-safe fallback**: Gemma-4-31B model outputted a classification format variation that tripped the strict JSON schema validator. Under Rule 3, unparseable model output conservatively falls back to `REVIEW`, which triggers `is_safe() == false` / `ALARM` in DriftGuard. |
| `terms-v3-obvious.md` | `terms-v0.md` | `MATERIAL` | `MATERIAL` | none | none | `false` | **Exact match**: Model correctly detected Red Line 4 violation ("Must not permit selling personal data") and Red Line 3 violation ("Must keep the right of users to export or delete their data"). 2 changes flagged. |
| `terms-v4-injection.md` | `terms-v0.md` | `MATERIAL` | `MATERIAL` | none | none | `true` | **Exact match**: Deterministic tripwire fired (`tripwire: true`). Verdict forced to `MATERIAL` regardless of untrusted data in diff. |
| `terms-v5-harmless.md` | `terms-v0.md` | `NONE` | `REVIEW` | none | none | `false` | **Fail-safe fallback**: Contact email address change evaluated to `REVIEW` by model validators, erring safely towards auditability. |
| `terms-v6-salami1.md` | `terms-v0.md` | `MINOR` | `MINOR` | none | none | `false` | **Exact match**: 60 days retention correctly identified as an operational change within the 90 days redline boundary. |
| `terms-v7-salami2.md` | `terms-v0.md` | `MATERIAL` | `MATERIAL` | none | none | `false` | **Exact match**: 100 days retention correctly triggered Red Line 2 breach (>90 days). Cumulative comparison against baseline v0 surfaced 2 changes. |

---

## 4. Measured On-Chain Latencies Summary

- **Contract Deployments**:
  - DriftWatch: **8.18 seconds**
  - DriftGuard: **8.60 seconds**
- **Deterministic Gates (No LLM)**:
  - Gate 3 (Raw byte identical, `UNCHANGED`): **11.77 seconds**
  - Gate 4 (Normalized text identical, `COSMETIC`): **15.03 seconds**
- **Model-Judged Evaluations (`exec_prompt`)**:
  - Single modified clause: **18.61 - 25.03 seconds**
  - Multiple added / removed clauses: **28.35 - 28.77 seconds**
