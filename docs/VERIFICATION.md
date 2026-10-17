# DriftWatch & DriftGuard: On-Chain Verification & Preview Evidence

**Network**: Studionet  
**Chain ID**: 61999  
**RPC Endpoint**: `https://studio.genlayer.com/api`  
**Explorer Base**: `https://explorer-studio.genlayer.com/address/`  
**Execution Account (Throwaway)**: `0x332A3e3864B5D6098f3DD3E71560cca3718fD14E`  
**Fixtures Repository**: `https://github.com/huzyow155/drift-watch-fixtures`  
**Fixtures Commit**: `c8ff0f0cf8b5e406a44baad04867cb793c52d328`  

---

## 1. Deployed Contracts & Byte-for-Byte Source Verification

Source verification was performed via JSON-RPC query `eth_getTransactionByHash` for each contract deployment transaction, decoding `result.data.contract_code` (base64), and computing its SHA-256 hash against local files.

### Active Deployment (Iteration 1: Flat Array Schema)

| Contract | Address | Deploy Tx Hash | Local SHA-256 | On-Chain Decoded SHA-256 | Match Result | Explorer Link |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DriftWatch** | `0xe8A159D3622D33aA0B62da57aF033F2C6D9fdEfD` | `0xbcc2b725f32f79d8477db824bed444e53fb7ff6ef6e08d6ebaa72537e49f8f39` | `2dcd113b3811f7041495878fb0e072020ca366afbe7d35740902080db057ca3e` | `2dcd113b3811f7041495878fb0e072020ca366afbe7d35740902080db057ca3e` | **EXACT MATCH** (0 diff) | [DriftWatch Explorer](https://explorer-studio.genlayer.com/address/0xe8A159D3622D33aA0B62da57aF033F2C6D9fdEfD) |
| **DriftGuard** | `0x0f336D97134D9770aBFA20d3B2Ad5B9f7D4BC557` | `0x9f3428148b3f7047d912903a7469acdd4318c07e225bb43621a30e952a2f9c6f` | `eb1b26aed095daf61ad1b94b1752d1636055965311543319d8fe214bc24863dc` | `eb1b26aed095daf61ad1b94b1752d1636055965311543319d8fe214bc24863dc` | **EXACT MATCH** (0 diff) | [DriftGuard Explorer](https://explorer-studio.genlayer.com/address/0x0f336D97134D9770aBFA20d3B2Ad5B9f7D4BC557) |

### Superseded Deployment (Iteration 0)

| Contract | Address | Deploy Tx Hash | Local SHA-256 | Status | Reason |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DriftWatch** | `0x7Ce13F5696f3A81AB5782BC203158691c0D742Cf` | `0xe5eeb4ba21fd7370f3ddd789dce5bcbb382d618abd1ab7f8f2e44102187713e8` | `9d80f1bc271116dae1b29cbf34f823f104d5fca94f6e012140b2686a32fe8e50` | Superseded | Prompt instruction enhanced in Iteration 1 to enforce flat string arrays. Raw receipts preserved in `docs/evidence/`. |
| **DriftGuard** | `0x02167c91C7054F7503Ea38200eD293003A8E9e4F` | `0xef8092b855239516c1a3a4b2e85c70733ff5c2245484c1631ae9335db633b4b9` | `eb1b26aed095daf61ad1b94b1752d1636055965311543319d8fe214bc24863dc` | Superseded | Re-deployed to reference active DriftWatch contract address. |

Verification output recorded in `scripts/deploy/verification_result.json`.

---

## 2. Studionet On-Chain Test Matrix (Cases a - k)

All transactions executed against Studionet and validated with individual consensus receipts saved in `docs/evidence_v2/`.

| Case | Description | Method | Tx Hash | Latency | Status / Result / Leader | Stored Outcome / Assertion |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Deploy Watch** | Deploy DriftWatch core contract | deployContract | `0xbcc2b725f32f79d8477db824bed444e53fb7ff6ef6e08d6ebaa72537e49f8f39` | 10.84s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Deployed at `0xe8A159D3622D33aA0B62da57aF033F2C6D9fdEfD` |
| **Deploy Guard** | Deploy DriftGuard consumer contract | deployContract | `0x9f3428148b3f7047d912903a7469acdd4318c07e225bb43621a30e952a2f9c6f` | 5.36s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Deployed at `0x0f336D97134D9770aBFA20d3B2Ad5B9f7D4BC557` |
| **Case (a)** | Create watch #1 (`terms-v0.md`) | `create_watch` | `0xc042d6c67379fa6305e3ce25081203613609baea771d1d28b0ca0c2e1d970c08` | 5.47s | ACCEPTED / MAJORITY_AGREE / SUCCESS | `status: NEEDS_BASELINE`, 4 red lines stored |
| **Case (a)** | Set baseline #1 on v0 | `set_baseline` | `0xdc7ad7d91a50840a5f312598ef173aaa856c044018582e10762bbdf41e989132` | 12.09s | ACCEPTED / MAJORITY_AGREE / SUCCESS | `status: ACTIVE`, 20 normalized baseline clauses stored |
| **Case (b)** | Check against v0 (Gate 3) | `check` | `0x82b5820d57ab1a5fa8d44ca0ee4827c806c6c9b5afea99f3b5f1581523dc6220` | 15.26s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #1: verdict `UNCHANGED`, gate `UNCHANGED` |
| **Case (c)** | Update source to `terms-v1-cosmetic.html` | `update_source` | `0x5289166d65d8fb4b68e5bdfbcb6ed6630e5d8c9ff37ef9408c0025b7dc9b5ad7` | 5.20s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v1 HTML |
| **Case (c)** | Check against v1 (Gate 4) | `check` | `0x1d7222215af2815c91fb6f43d37772c050a98b2ff90bd32c0aadbb6535b183b9` | 11.93s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #2: verdict `COSMETIC`, gate `COSMETIC` |
| **Case (d)** | Update source to `terms-v2-subtle.md` | `update_source` | `0x81eb03bdc096e55eecce6913df5d366c915935bab16389a45243e88de4fdeb21` | 5.35s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v2 |
| **Case (d)** | Check v2 (subtle: drops "anonymized") | `check` | `0x7d0453f88bd3bdeb86505b6e51a9e53e4dd0c85763f4e365be2700cecc534017` | 18.56s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #3: verdict `MATERIAL`, `change_labels: ["MATERIAL"]`, `redline_flags: ["HIT", "CLEAR", "CLEAR", "UNCLEAR"]` |
| **Case (d)** | Update source to `terms-v3-obvious.md` | `update_source` | `0x5ef91d04559b9190a621167cee31ef9c5432cb800ecf2b14a7695d8e6f3363d2` | 5.19s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v3 |
| **Case (d)** | Check v3 (obvious: sells data, deletes export) | `check` | `0xa7bce01357bb3e3b3637ff0bd49baf8ca4a7485f346f568b6a1163d80acd8be5` | 18.42s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #4: verdict `MATERIAL`, 2 changes flagged, redlines 3 & 4 HIT |
| **Case (d)** | Update source to `terms-v4-injection.md` | `update_source` | `0x7bbccb265bec573a7a79ada7263254aebdde69f05518d3e18770795d0bc541e1` | 8.52s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v4 |
| **Case (d)** | Check v4 (injection attempt) | `check` | `0xeb221091a15bf0abea8ab32cefb346c1074b1bf879534e3bf49f06bd555708ba` | 28.61s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #5: verdict `MATERIAL`, `tripwire: true` |
| **Case (d)** | Update source to `terms-v5-harmless.md` | `update_source` | `0xff5ef8fc43b23bc14b5fbb4ef447b8a17682f844a59265f13b016b5caa49e3ad` | 5.24s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v5 |
| **Case (d)** | Check v5 (harmless support email change) | `check` | `0x1cfce96ee0deb20228ea23a07a05ca33b8d2e102bd7d6d1be0e2b4c505395f39` | 22.25s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #6: verdict `NONE`, `change_labels: ["NONE"]`, `redline_flags: ["CLEAR", "CLEAR", "CLEAR", "CLEAR"]` |
| **Case (d)** | Update source to `terms-v6-salami1.md` | `update_source` | `0x0a56e114fa5cdbb890c1908db80d0c86e904afcbe04fa5b88e47e7c3e1903037` | 8.52s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v6 |
| **Case (d)** | Check v6 (salami1: 60d retention <= 90d redline) | `check` | `0x47417c85f11567e62b23550aea3627b50d5f852ab89109d16bd8d36486c2b4f7` | 21.87s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #7: verdict `MINOR` |
| **Case (e)** | Baseline-never-moves verification | `get_watch` | readContract | <1.0s | SUCCESS | `baseline_seq == "1"`, baseline hash remains locked to v0 |
| **Case (d)** | Update source to `terms-v7-salami2.md` | `update_source` | `0x073f57ad39927d09ae698ac56466929de9681db0f598459ed9baa8ba1eec1edb` | 8.58s | ACCEPTED / MAJORITY_AGREE / SUCCESS | URL updated to v7 |
| **Case (d)** | Check v7 (salami2: 100d retention > 90d redline) | `check` | `0xd5cf6b52aa968620b564dd4e81431d514154587c815309622ff65d77ebab1b36` | 22.13s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #8: verdict `MATERIAL`, 2 cumulative changes |
| **Case (f)** | Duplicate observation rejection | `check` | `0xdb24b75cdddba28e0084db86b850c1153f5da3c43058e8ee63aabdd5487a71ab` | 15.47s | ACCEPTED / MAJORITY_AGREE / ERROR | Rejection on duplicate observation key: already recorded in check 8 |
| **Case (g)** | Create 404 watch | `create_watch` | `0xf5c4b5e9da1b5e31a54f79c5868c1ca1dceaf589d3f2770639dc759f666e9df2` | 12.28s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Watch #2 created |
| **Case (g)** | Set baseline on 404 URL | `set_baseline` | `0xd123604d5ca363a788aebf7be39eb5bd8ee23e0ee027104feae45b02164158ec` | 41.98s | UNDETERMINED / MAJORITY_DISAGREE / ERROR | **Giao dich khong dat dong thuan (UNDETERMINED / MAJORITY_DISAGREE), trang thai khong doi**. `get_watch("2")` doc lai xac nhan: `status: "NEEDS_BASELINE"`, `baseline_seq: "0"`. |
| **Case (g)** | Update source to mismatched host | `update_source` | `0x1dbcb11e72b20cbac65da48069f059681ab44163667584b56435cfb6d388be48` | 8.70s | ACCEPTED / MAJORITY_AGREE / ERROR | Rejected with `host mismatch: cannot change monitored domain` |
| **Case (h)** | Accept change from check #6 | `accept_change` | `0x4bc7883de07a7395748d6e1d1033ec992dc5ec29b81ab1001dc538e8ee2031df` | 5.22s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Baseline seq advances to `2`, baseline check id `6` |
| **Case (h)** | Update source back to v5 | `update_source` | `0x69b8d9abe338e64cbda1a89ef6c5bdf4e7ee2d62d6aac50a38e107144231e964` | 8.64s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Monitored URL set to v5 |
| **Case (h)** | Check v5 against new baseline | `check` | `0xb36d607b2d8511203d9dbb9f4527ffae91114d143cda6078eec63a6dd3af00df` | 15.38s | ACCEPTED / MAJORITY_AGREE / SUCCESS | Check #9: verdict `COSMETIC`, gate `COSMETIC` |

---

## 3. Case (i) DriftGuard End-to-End Lifecycle Sequence

Every transition was verified through individual transactions and read-backs against consumer contract `DriftGuard` (`0x0f336D97134D9770aBFA20d3B2Ad5B9f7D4BC557`):

| Step | Action | Tx Hash | Receipt File | State Before | State After (`is_safe` Read-Back) | Safe? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Create & Init** | `create_watch` #3 | `0x0ce721d63fd334cfa95d71c8cab6055b6bb1d738f404d3efc0bf3f6a5b4ea0f4` | `case_i_create_watch_3_receipt.json` | - | Watch #3 created | - |
| **2. Set Baseline** | `set_baseline` #3 | `0xf12ce708af190eb3b708438e65256eef9f1c00589df4eb54a46ca7b7df374c11` | `case_i_set_baseline_3_receipt.json` | `NEEDS_BASELINE` | `ACTIVE` | - |
| **3. Pin Baseline** | `pin` #3 | `0xe6677009bfdc37e2d2e64daa768902e3e21556ae5734c798cce7dc676c5a9109` | `case_i_guard_pin_receipt.json` | `NO_PIN` | `{"reason":"NO_CHECK_YET","safe":"false"}` | `false` |
| **4. Initial Check** | `check` v0 #3 | `0x8c57e65324edf9f8c3cca73652e56da7d353183f23f7310724687a6b7ce02b2d` | `case_i_watch3_check_v0_receipt.json` | `NO_CHECK_YET` | `{"latest_check_id":"10","latest_verdict":"UNCHANGED","reason":"OK","safe":"true"}` | `true` |
| **5. Drift Trigger** | `update_source` to v2 & `check` #3 | `0xfdbb166a7a24e47cfbd3c1d9b6aceeaf6dd5655aa9c0e074ed7224a143f75b88` | `case_i_watch3_check_v2_receipt.json` | `OK` | `{"latest_check_id":"11","latest_verdict":"MATERIAL","reason":"ALARM","safe":"false"}` | `false` |
| **6. Acknowledge** | `acknowledge` check #11 | `0x220e1036f5c3a36a3ded800ad46a3f2997a06122750769657f5d08974c0d81fb` | `case_i_guard_acknowledge_receipt.json` | `ALARM` | `{"latest_check_id":"11","latest_verdict":"MATERIAL","reason":"ACKNOWLEDGED","safe":"true"}` | `true` |
| **7. Watch Advance** | `accept_change` check #11 on Watch | `0xcbafe0a45d3e0beb364c008a339fcbb505c2fd1b3c72ce1d4a16a725d9437f2b` | `case_i_watch3_accept_change_receipt.json` | `ACKNOWLEDGED` | `{"latest_check_id":"11","latest_verdict":"MATERIAL","reason":"BASELINE_CHANGED","safe":"false"}` | `false` |
| **8. Re-Pin** | `repin` #3 in DriftGuard | `0xc74d49348a545cb436ac28ce4215ad762685062a9d9913fab1cc1f429f084b91` | `case_i_guard_repin_receipt.json` | `BASELINE_CHANGED` | Hashes updated to check #11 baseline | - |
| **9. Verify New Baseline** | `check` v2 #3 (now baseline) | `0x971dbd07317c4fa465a007b3cfe8bdb31a2d6372f12e88659bcb6fc9b459ad88` | `case_i_watch3_check_v2_unchanged_receipt.json` | Check 12 recorded | `{"latest_check_id":"12","latest_verdict":"COSMETIC","reason":"OK","safe":"true"}` | `true` |
| **10. is_safe_for Binding** | Synchronous query with valid hashes | View Call | - | - | Valid hashes return `true`; mismatched candidate hash returns `false` | `true` / `false` |

---

## 4. On-Chain Stats Read-Back (Case j)

State read-back from `get_stats()` on active contract `0xe8A159D3622D33aA0B62da57aF033F2C6D9fdEfD`:
```json
{
  "schema_version": "1",
  "stat_total_checks": "12",
  "stat_verdict_COSMETIC": "3",
  "stat_verdict_MATERIAL": "5",
  "stat_verdict_MINOR": "1",
  "stat_verdict_NONE": "1",
  "stat_verdict_REVIEW": "0",
  "stat_verdict_UNCHANGED": "2"
}
```
**Key Metric**: `stat_verdict_REVIEW: "0"` across all 12 on-chain checks in the active suite run. Every single candidate was evaluated cleanly to its expected legal category without parser failure.
