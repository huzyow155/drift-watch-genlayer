# Runtime Notes: GenLayer Studionet Probe (Milestone 0)

Status: Preview (Studionet)  
Network: Studionet (Chain ID: 61999)  
RPC Endpoint: `https://studio.genlayer.com/api`  
Probe Contract Address: `0x980c01c81E6593E62582a2f08C6Ee2E6023257D1`  
Probe Deploy Transaction: `0x528abf79f9443a0dbe3b29e59042aab539ba758d421bde2456f5c87e5f5e8877`  

## 1. Verified Runtime Behaviors

| Feature / Behavior | Observed Result on Studionet | Implication for Drift Watch |
| :--- | :--- | :--- |
| **Sender Accessor** | `gl.message.sender_address.as_hex` accurately returns caller address (`0x68aF05b60FE48913A6eE838A28479caD161e8EF9`). | Used for owner-only access control on `set_baseline`, `accept_change`, `update_source`, and pinner tracking in `DriftGuard`. |
| **Consensus Primitive** | `gl.eq_principle.strict_eq(fn)` successfully accepted by validators with `MAJORITY_AGREE`. | Used for consensus on canonical string `"<VERDICT>|<norm_hash16>"`. |
| **LLM Output (`gl.nondet.exec_prompt`)** | Returns raw string. Returned strict JSON without unexpected envelopes. Latency was measured at 28.25s. | Strip code fences and strictly parse JSON without relying on undocumented flags. |
| **HTTP Fetch (`gl.nondet.web.get`)** | Returns object with `.status` (int) and `.body` (bytes or string). | Decode `.body` with `.decode("utf-8", errors="replace")`. Check `.status == 200`. |
| **HTTP 404 Response** | `.status == 404`, body `"404: Not Found"` (length 14). Latency: 8.40s. | Raise `UserError("HTTP status 404")` when status is not 200. |
| **Byte Stability (5 fetches)** | 5 sequential fetches of commit-pinned raw Markdown yielded identical hash `ae41899b3f2d782dba053de7360bd2679639f03cd8a012c48b6d1a9c6d0ce7c9`. | Commit-pinned raw GitHub URLs are completely byte-stable across fetches. |
| **Large Storage in `TreeMap`** | 60,000 bytes string stored successfully in `self.results["large_payload"]`. Latency: 6.92s. | `TreeMap[str, str]` reliably handles baseline clause lists and serialized JSON records up to 60 KB. |
| **Stdlib Module Imports** | `hashlib`, `urllib.parse`, `ipaddress`, `re`, `json`, `html` all import cleanly at module level. | Clean parser and normalization algorithms can be defined as pure module-level functions. |
| **View Return Types** | `bool`, `str`, `list[str]` views all execute and deserialize properly via `readContract`. | Discovery views and status checks can return native structured types or JSON strings. |

## 2. Measured On-Chain Latencies

All values are real wall-clock execution times measured during the Milestone 0 probe run:

- **Contract Deployment**: 6.51 seconds
- **Deterministic Storage Write (60 KB)**: 6.92 seconds
- **Web Fetch Write (HTTP 404)**: 8.40 seconds
- **Web Fetch Write (Raw Markdown, 200 OK)**: 11.64 seconds
- **Web Fetch Write (Raw HTML, 200 OK)**: 11.85 seconds
- **Web Fetch Write (Public Site example.com, 200 OK)**: 11.72 seconds
- **Byte Stability Test (5 sequential HTTP gets)**: 12.50 seconds
- **Model-Judged Write (`gl.nondet.exec_prompt`)**: 28.25 seconds

## 3. Decision Gate Confirmation

The DECISION GATE in Section 9 requires:
> "if the page text is not readable or not byte-stable from inside the contract (non-200, rate limit, changing bytes) and no workaround works, STOP after Milestone 0 and report BLOCKED... Do not improvise a different design."

**Decision**: PROCEED. All 5 fetches returned identical byte hashes (`stable: true`), HTTP statuses were reported with high fidelity, and model judgment completed with majority agreement.
