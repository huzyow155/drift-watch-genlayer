# Limitations of Drift Watch

Status: Preview (Studionet)

This document provides a comprehensive, honest catalog of known technical and architectural boundaries of the Drift Watch and DriftGuard contracts.

## 1. Snapshot-Based Model Without Internal Clock
- **No Background Polling**: GenLayer contracts execute exclusively upon external transaction invocation. There is no automated continuous daemon or internal scheduled cron inside the contract.
- **Freshness Duty on Caller**: Any verification or reliance on `is_safe` reflects only the state at the most recent transaction execution. Integrators must submit a `check` transaction if fresh verification is required.

## 2. Text-Only Extraction & JavaScript Limitations
- **No Client-Side JavaScript Rendering**: Web pages are retrieved directly over HTTP via `gl.nondet.web.get`. Single Page Applications (SPAs) or pages relying on client-side React/Vue/Angular rendering that do not return rendered text in the initial HTTP payload will yield insufficient text.
- **Minimum Text Threshold**: Pages with under 200 characters of cleaned text trigger a `UserError("page unreadable (too little text; it may need JavaScript)")` rather than an alarm verdict.
- **Byte Size Limit**: Pages exceeding the byte cap (400,000 bytes) are rejected with `UserError("page too large")`.

## 3. Order-Insensitive Clause Comparison
- **Set-Based Normalization**: Clauses are sorted and deduplicated prior to computing `norm_hash` (`sha256("\n".join(sorted(set(clauses))))`).
- **Moved Clauses**: Relocating a clause or restructuring document sections without altering clause wording is classified as `UNCHANGED` or `COSMETIC`. While structural repositioning could hypothetically alter legal interpretation, Drift Watch intentionally isolates clause-level meaning over document geography to eliminate false alarms from section reordering.

## 4. English-First Heuristic Parsing & Cleaning
- **Language Assumptions**: Clause splitting relies on sentence terminators (`.`, `!`, `?`, `;`) followed by whitespace and standard line breaks. Boilerplate filters target English terms ("last updated", "effective date", "copyright", "all rights reserved"). Non-English legal texts or unconventional punctuation may be split unevenly.
- **Exotic Markup**: Complex tables, nested footnotes, or unconventional DOM trees may cause heuristic tag-stripping to concatenate disjoint fragments or drop formatting boundaries.

## 5. Scope of Semantic Judgment & Change Thresholds
- **Threshold on Changed Clauses**: If a diff exceeds 12 modified, added, or removed clauses, the contract automatically returns `REVIEW`. Complete document overhauls or massive rewrites cannot be evaluated reliably in a single consensus call and require human review.
- **Not Legal Advice**: Drift Watch does not provide legal opinions or determine statutory compliance. It checks whether detected textual diffs violate specific, user-defined red lines in plain English.
- **LLM Variance on Borderline Phrasing**: While consensus requires majority agreement on a single canonical verdict string (`<VERDICT>|<norm_hash16>`), subtle edge-case phrasing may occasionally generate divergence or require `REVIEW`.
- **Subtle One-Word Modifications & Parser Fail-Safe**: Với ca tinh vi chỉ đổi 1 từ (chẳng hạn bỏ chữ "anonymized"), kết quả phụ thuộc vào nhãn do mô hình ngôn ngữ trả về; khi nhãn không parse được (ví dụ do mô hình trả về mảng object thay vì mảng chuỗi phẳng), hệ thống tự động trả về `REVIEW` (an toàn theo nguyên tắc fail-safe, nhưng gây nhiều báo động cho người tích hợp).

## 6. Baseline Governance & DriftGuard Semantics
- **Owner Controls Baseline Updates**: The watch creator controls `accept_change`. The baseline does not advance automatically. This design guarantees that incremental ("salami-slice") edits accumulate against the original accepted baseline rather than evading detection across small hops.
- **Host Binding on Source Updates**: `update_source` requires exact parsed host identity (case-insensitive, subdomains are distinct). It allows URL path updates on the same host but relies on the watch owner not pointing to an unrelated resource on that same host.
- **Snapshot Retention Limit**: Detailed clause snapshots (`snapshot_clauses`) are retained only for the 3 newest checks to bound on-chain storage growth. Older checks retain hashes, diff summaries, and metadata, but their snapshots are pruned (`snapshot_dropped: "true"`).
- **Guard Reports Stored State**: `DriftGuard.is_safe` evaluates the latest recorded check in `DriftWatch`. If a terms page changed upstream but nobody called `check`, the guard reflects the last recorded state.
