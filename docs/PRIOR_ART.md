# Prior Art Analysis: Drift Watch

Status: Preview (Studionet)

## Executive Summary

Monitoring digital agreements, terms of service, and privacy policies has traditionally fallen into two disparate paradigms:
1. **Centralized Web Monitoring Services**: (e.g., Visualping, ChangeTower, Versionista) that perform periodic DOM diffs or visual screenshot comparisons on centralized servers.
2. **Community Crowd-Sourced Annotation Platforms**: (e.g., *Terms of Service; Didn't Read* / `tosdr.org`) that curate manual, human-reviewed summaries and ratings of major tech terms.
3. **Decentralized Dispute & Oracle Mechanisms**: (e.g., UMA, Kleros) that arbitrate subjective real-world questions via human crowds or economic staking, but lack direct autonomous web-reading and real-time smart contract execution capabilities.

Among existing tools, **Visualping** represents the single closest existing project.

## Comparison: Visualping vs. Drift Watch

| Dimension | Visualping | Drift Watch (GenLayer Intelligent Contract) |
| :--- | :--- | :--- |
| **Execution Architecture** | Centralized SaaS server running headless Chromium. Single point of trust and failure. | Decentralized GenVM execution across independent validators who must reach consensus on page content and semantic verdict. |
| **Trust Model** | The operator or server administrator can be coerced, pressured, or compromised; notifications can be suppressed or delayed. | Trust-minimized validator consensus (`gl.eq_principle.strict_eq`). No single party can alter the recorded verdict. |
| **Change Detection Mechanism** | Pixel diffs, DOM tree diffs, or text-length heuristics. High false-positive rate on cosmetic CSS/layout/date changes. | Deterministic cosmetic gate (`raw_hash` vs. `norm_hash`) followed by semantic evaluation against integrator red lines. |
| **Evaluation Criteria** | Generic "any change detected" or keyword matching. No customized contextual policy evaluation. | User-specified "Red Lines" in natural English (e.g., "Must not permit selling personal data"). |
| **Anti-Drift Baseline** | Compares current fetch against immediate previous fetch ($N$ vs $N-1$), vulnerable to cumulative "salami-slice" changes. | Pinned baseline model: changes are strictly compared against the accepted baseline until explicitly advanced by governance. |
| **Smart Contract Integration** | None. Webhooks or email alerts only. Cannot be read natively by on-chain contracts without trusted bridges. | Native Intelligent Contract (`DriftGuard`) readable directly by dApps, DAOs, and smart contracts via synchronous view calls. |
| **Operational Trigger** | Continuous scheduled background cron on SaaS servers. | Transaction-driven snapshot checks triggered by any caller. |
| **JavaScript Rendering** | Full headless browser with JavaScript execution and visual screenshot rendering. | Raw HTTP payload retrieval (`gl.nondet.web.get`); pages requiring client-side JS hydration are out of scope. |

## Detailed Trade-Offs

1. **Snapshot vs. Continuous Cron**: Visualping polls automatically every hour or day on its own infrastructure. Drift Watch runs on-chain and evaluates a snapshot only when a user or keeper calls `check`.
2. **Deterministic Gating vs. Cost**: Simple reformatting (e.g., migrating markdown to HTML, reordering clauses, changing copyright dates) is filtered deterministically on-chain without invoking LLM inference, keeping gas and latency minimal.
3. **Prompt Injection Defense**: Unlike commercial scrapers that pass raw text to generic summarizers, Drift Watch treats all fetched text as untrusted data, encapsulates it in strict JSON schemas, utilizes an automated injection tripwire, and enforces a fail-safe floor of `REVIEW`.
4. **On-Chain Programmability**: The `DriftGuard` contract allows autonomous protocols (such as DAOs or cross-chain bridges) to pause integrations automatically if upstream terms violate pinned safety criteria.
