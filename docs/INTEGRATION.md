# Integration Guide: Drift Watch & DriftGuard

Status: Preview (Studionet)  
Network: Studionet (Chain ID: 61999)  
RPC: `https://studio.genlayer.com/api`  
Client Library: `genlayer-js@1.1.8`  

## 1. Receipt Success Rule

A write transaction on Studionet is considered successful only when all three conditions hold:
1. `receipt.status_name === "ACCEPTED"` (or `"FINALIZED"`)
2. `receipt.result_name === "MAJORITY_AGREE"`
3. `receipt.consensus_data.leader_receipt[0].execution_result === "SUCCESS"`

A transaction resulting in `result_name: "MAJORITY_DISAGREE"` or `execution_result: "ERROR"` indicates a failure or rejection. For errors, the error string is contained in `result.payload` (base64-encoded).

---

## 2. DriftWatch Public Interface

### Writes

#### `create_watch(name: str, url: str, red_lines_json: str) -> str`
Registers a new watch in `NEEDS_BASELINE` status.
- `name`: 3-60 ASCII characters.
- `url`: Public HTTPS URL (max 300 characters, no userinfo, no IP literals, no fragment, port empty or 443).
- `red_lines_json`: JSON string representing an array of 1-5 red lines (each 5-200 ASCII characters).
- **Returns**: `watch_id` (string, e.g. `"1"`).

#### `set_baseline(watch_id: str) -> str`
Fetches the initial page content, extracts clauses, and anchors the baseline.
- **Access**: Owner only.
- **Consensus Return**: `"BASELINE|<norm_hash16>"`.

#### `check(watch_id: str) -> str`
Executes an on-demand check of the current page against the pinned baseline and user red lines.
- **Access**: Open to any caller.
- **Returns**: Canonical verdict string (`"UNCHANGED"`, `"COSMETIC"`, `"NONE"`, `"MINOR"`, `"MATERIAL"`, `"REVIEW"`).

#### `accept_change(watch_id: str, check_id: str) -> None`
Advances the baseline to the clause snapshot captured in `check_id`.
- **Access**: Owner only.
- Requires that `check_id` belongs to `watch_id`, verdict is not `UNCHANGED`, and snapshot clauses are still stored.

#### `update_source(watch_id: str, new_url: str) -> None`
Updates the monitored URL on the same host (e.g. following URL migrations or version paths).
- **Access**: Owner only.
- Requires `new_url` host to match existing stored host exactly.

---

### Views

#### `get_watch(watch_id: str) -> str`
Returns compact watch metadata (baseline clauses omitted to minimize payload):
```json
{
  "baseline_check_id": "",
  "baseline_norm_hash": "e0c26d288fd485f95f178de36795757e28236963677a12721bf05dd4c96946c9",
  "baseline_raw_hash": "ae41899b3f2d782dba053de7360bd2679639f03cd8a012c48b6d1a9c6d0ce7c9",
  "baseline_seq": "1",
  "host": "raw.githubusercontent.com",
  "id": "1",
  "name": "Acme Watch",
  "owner": "0x68af05b60fe48913a6ee838a28479cad161e8ef9",
  "red_lines": [
    "Must not allow sharing of identifiable or non-anonymized user data with third parties.",
    "Must not keep deleted user data for more than 90 days.",
    "Must keep the right of users to export or delete their data.",
    "Must not permit selling personal data."
  ],
  "redlines_hash": "55f5e82b78a94628ee3e07d727b137d7a314856f6c91a096ccecf1c0f4931a9d",
  "schema_version": "1",
  "seq": "1",
  "source_history": [
    "https://raw.githubusercontent.com/huzyow155/drift-watch-fixtures/c8ff0f0cf8b5e406a44baad04867cb793c52d328/terms-v0.md"
  ],
  "status": "ACTIVE",
  "url": "https://raw.githubusercontent.com/huzyow155/drift-watch-fixtures/c8ff0f0cf8b5e406a44baad04867cb793c52d328/terms-v0.md"
}
```

#### `get_status(watch_id: str) -> str`
Compact binding view designed for synchronous cross-contract reads:
```json
{
  "baseline_norm_hash": "e0c26d288fd485f95f178de36795757e28236963677a12721bf05dd4c96946c9",
  "baseline_seq": "1",
  "latest_baseline_norm_hash": "e0c26d288fd485f95f178de36795757e28236963677a12721bf05dd4c96946c9",
  "latest_check_id": "1",
  "latest_norm_hash": "e0c26d288fd485f95f178de36795757e28236963677a12721bf05dd4c96946c9",
  "latest_verdict": "UNCHANGED",
  "redlines_hash": "55f5e82b78a94628ee3e07d727b137d7a314856f6c91a096ccecf1c0f4931a9d",
  "schema_version": "1",
  "status": "ACTIVE",
  "watch_id": "1"
}
```

#### `get_check(check_id: str) -> str`
Full check record with deterministic changes and leader-reported flags:
```json
{
  "baseline_norm_hash": "e0c26d288fd485f95f178de36795757e28236963677a12721bf05dd4c96946c9",
  "caller": "0x68af05b60fe48913a6ee838a28479cad161e8ef9",
  "change_labels": [],
  "changes": [],
  "gate": "UNCHANGED",
  "id": "1",
  "norm_hash": "e0c26d288fd485f95f178de36795757e28236963677a12721bf05dd4c96946c9",
  "raw_hash16": "ae41899b3f2d782d",
  "redline_flags": [],
  "redlines_hash": "55f5e82b78a94628ee3e07d727b137d7a314856f6c91a096ccecf1c0f4931a9d",
  "schema_version": "1",
  "seq": "1",
  "snapshot_clauses": [
    "Welcome to Acme Notes terms of service.",
    "By accessing our services you agree to these terms."
  ],
  "snapshot_dropped": "false",
  "tripwire": "false",
  "verdict": "UNCHANGED",
  "watch_id": "1"
}
```

#### `is_alarm_for(watch_id: str, baseline_norm_hash: str, norm_hash: str) -> bool`
Returns `true` if and only if a stored check exists for that exact baseline and candidate hash with verdict `MATERIAL` or `REVIEW`.

#### `get_stats() -> str`
Returns contract-wide operational counters across all checks evaluated to date.
Output keys:
- `schema_version`: String `"1"`
- `stat_total_checks`: String integer count of all completed checks
- `stat_verdict_UNCHANGED`: String integer count of checks evaluated to `UNCHANGED`
- `stat_verdict_COSMETIC`: String integer count of checks evaluated to `COSMETIC`
- `stat_verdict_NONE`: String integer count of checks evaluated to `NONE`
- `stat_verdict_MINOR`: String integer count of checks evaluated to `MINOR`
- `stat_verdict_MATERIAL`: String integer count of checks evaluated to `MATERIAL`
- `stat_verdict_REVIEW`: String integer count of checks evaluated to `REVIEW`

Real call example from active deployment (`0xe8A159D3622D33aA0B62da57aF033F2C6D9fdEfD`):
```json
{"schema_version":"1","stat_total_checks":"12","stat_verdict_COSMETIC":"3","stat_verdict_MATERIAL":"5","stat_verdict_MINOR":"1","stat_verdict_NONE":"1","stat_verdict_REVIEW":"0","stat_verdict_UNCHANGED":"2"}
```

---

## 3. DriftGuard Public Interface

### Writes
- `pin(watch_id: str)`: Synchronously reads `DriftWatch.get_status(watch_id)` and pins the active baseline and red line hashes.
- `acknowledge(watch_id: str, check_id: str)`: Records that the pinner has reviewed and accepted a specific alarm check.
- `repin(watch_id: str)`: Re-pins the current watch baseline after an authorized change was accepted by the owner.

### Views
#### `is_safe(pinner: str, watch_id: str) -> str`
Computes current safety status by evaluating the pinned hashes against `DriftWatch.get_status(watch_id)`:
```json
{
  "latest_check_id": "1",
  "latest_verdict": "UNCHANGED",
  "reason": "OK",
  "safe": "true"
}
```
Possible reasons:
- `OK`: Pinned hashes match, latest verdict is `UNCHANGED`, `COSMETIC`, `NONE`, or `MINOR`.
- `NO_PIN`: Caller has not pinned this watch.
- `NO_CHECK_YET`: Pinned, but no check has been recorded yet.
- `ALARM`: Latest verdict is `MATERIAL` or `REVIEW` and unacknowledged.
- `ACKNOWLEDGED`: Latest verdict is `MATERIAL` or `REVIEW`, but acknowledged by the pinner.
- `BASELINE_CHANGED`: Watch baseline hash differs from pinned baseline hash.
- `REDLINES_CHANGED`: Watch red lines hash differs from pinned red lines hash.

#### `is_safe_for(pinner: str, watch_id: str, pinned_baseline_norm_hash: str, pinned_redlines_hash: str) -> bool`
Returns `true` only if the caller's stored pin matches both specified hashes and `is_safe` evaluates to `"safe": "true"`.
