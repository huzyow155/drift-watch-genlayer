import os
import re
import hashlib
import html

def page_text(raw_bytes: bytes) -> str:
    if not raw_bytes:
        return ""
    try:
        text = raw_bytes.decode("utf-8", errors="replace")
    except Exception:
        text = str(raw_bytes)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\xa0", " ")
    
    # HTML cleaner
    is_html = ("<html" in text.lower()) or ("<!doctype" in text.lower()) or ("<body" in text.lower()) or ("<div" in text.lower()) or ("<p>" in text.lower())
    if is_html:
        text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
        text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
        text = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", text)
        text = re.sub(r"(?s)<!--.*?-->", " ", text)
        text = re.sub(r"(?i)<br\s*/?>", "\n", text)
        text = re.sub(r"(?i)</?(?:p|div|h[1-6]|li|tr|th|td|blockquote|section|article|header|footer)\b[^>]*>", "\n", text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = html.unescape(text)
    else:
        # Markdown cleaner
        text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
        text = re.sub(r"`[^`]+`", " ", text)
        text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
        text = re.sub(r"(?m)^[ \t]*[#]+[ \t]*", "", text)
        text = re.sub(r"(?m)^[ \t]*[-*+][ \t]+", "", text)
        text = re.sub(r"(?m)^[ \t]*\d+\.[ \t]+", "", text)
        text = re.sub(r"[*_~]", "", text)
        text = html.unescape(text)

    # replace curly quotes and unicode dashes with spaces / standard chars
    text = text.replace("\u201c", "\"").replace("\u201d", "\"").replace("\u2018", "'").replace("\u2019", "'")
    lines = [l.strip() for l in text.split("\n")]
    return "\n".join([l for l in lines if l])

def split_clauses(text: str) -> list[str]:
    boilerplate_patterns = [
        "last updated", "effective date", "effective as of",
        "copyright", "all rights reserved", "version"
    ]
    raw_clauses = []
    lines = text.split("\n")
    for line in lines:
        # Split on line breaks and on sentence terminators (., !, ?, ;) followed by whitespace or end
        parts = re.split(r"([.!?;]+(?:\s+|$))", line)
        buf = ""
        for p in parts:
            if re.match(r"^[.!?;]+(?:\s+|$)$", p):
                buf += p
                if buf.strip():
                    raw_clauses.append(buf.strip())
                buf = ""
            else:
                buf += p
        if buf.strip():
            raw_clauses.append(buf.strip())
            
    filtered = []
    for c in raw_clauses:
        words = [w for w in re.split(r"\s+", c) if w]
        if len(words) < 4:
            continue
        c_lower = c.lower()
        if any(bp in c_lower for bp in boilerplate_patterns):
            continue
        # Also drop if it consists only of a date
        if re.match(r"^(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}\s+[a-z]+\s+\d{2,4})[.,]?$", c_lower):
            continue
        filtered.append(c)
    return filtered

def normalize_clause(c: str) -> str:
    s = c.casefold()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())

def norm_hash(normalized_clauses: list[str]) -> str:
    norm_set = sorted(set(normalized_clauses))
    joined = "\n".join(norm_set)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()

def raw_hash(raw_bytes: bytes) -> str:
    return hashlib.sha256(raw_bytes).hexdigest()

def jaccard_ge_half(words_a: list[str], words_b: list[str]) -> bool:
    # Deterministic integer cross-multiplication: |A & B| / |A | B| >= 1/2 <=> 2 * |A & B| >= |A | B|
    set_a = set(words_a)
    set_b = set(words_b)
    inter = len(set_a.intersection(set_b))
    union = len(set_a.union(set_b))
    if union == 0:
        return False
    return 2 * inter >= union

def jaccard_score_num_den(words_a: list[str], words_b: list[str]) -> tuple[int, int]:
    set_a = set(words_a)
    set_b = set(words_b)
    inter = len(set_a.intersection(set_b))
    union = len(set_a.union(set_b))
    return (inter, union)

def clause_diff(old_orig_clauses: list[str], new_orig_clauses: list[str]) -> list[dict]:
    old_norm = [normalize_clause(c) for c in old_orig_clauses]
    new_norm = [normalize_clause(c) for c in new_orig_clauses]

    old_norm_set = set(old_norm)
    new_norm_set = set(new_norm)

    # Removed: in old not in new (keep original index)
    removed_indices = [i for i, c in enumerate(old_norm) if c not in new_norm_set]
    # Added: in new not in old (keep new index)
    added_indices = [j for j, c in enumerate(new_norm) if c not in old_norm_set]

    # Pair removed with added of highest token-Jaccard similarity >= 0.5
    # Deterministic tie-break by position; each clause used once
    pairs = [] # (rem_idx, add_idx)
    used_rem = set()
    used_add = set()

    for rem_i in removed_indices:
        rem_words = old_norm[rem_i].split()
        best_add_j = None
        best_num = 0
        best_den = 1 # fraction best_num / best_den

        for add_j in added_indices:
            if add_j in used_add:
                continue
            add_words = new_norm[add_j].split()
            inter, union = jaccard_score_num_den(rem_words, add_words)
            if union > 0 and 2 * inter >= union: # >= 0.5
                # Compare fraction inter/union with best_num/best_den:
                # inter * best_den > best_num * union
                if best_add_j is None or (inter * best_den > best_num * union):
                    best_add_j = add_j
                    best_num = inter
                    best_den = union

        if best_add_j is not None:
            used_rem.add(rem_i)
            used_add.add(best_add_j)
            pairs.append((rem_i, best_add_j))

    # Construct final changes list
    # Output ordered by position in new text (removed ones by old position at end)
    # Each item carrying ORIGINAL clause text capped at 400 chars.
    changes = []

    # Map add_j to pair if modified
    add_to_pair = {add_j: rem_i for (rem_i, add_j) in pairs}

    for j, new_clause in enumerate(new_orig_clauses):
        if j in add_to_pair:
            rem_i = add_to_pair[j]
            changes.append({
                "kind": "MODIFIED",
                "old": old_orig_clauses[rem_i][:400],
                "new": new_clause[:400]
            })
        elif j in added_indices and j not in used_add:
            changes.append({
                "kind": "ADDED",
                "old": "",
                "new": new_clause[:400]
            })

    for rem_i in removed_indices:
        if rem_i not in used_rem:
            changes.append({
                "kind": "REMOVED",
                "old": old_orig_clauses[rem_i][:400],
                "new": ""
            })

    return changes

def injection_tripwire(changed_texts: list[str]) -> bool:
    tripwire_phrases = [
        "ignore previous", "ignore all", "automated review",
        "automated reviewer", "automated system", "ai reviewer",
        "language model", "system:", "classify all", "classify every",
        "mark all", "answer none", "as an ai"
    ]
    for text in changed_texts:
        t_low = text.lower()
        for phrase in tripwire_phrases:
            if phrase in t_low:
                return True
    return False

if __name__ == "__main__":
    print("Testing pure functions...")
    v0_text = b"""# Terms of Service
Last updated: January 1, 2026. Effective as of January 1, 2026. Copyright 2026 Acme Notes Inc. All rights reserved.

1. Welcome to Acme Notes terms of service.
2. By accessing our services you agree to these terms.
3. You must provide accurate registration information to open an account.
4. You are responsible for maintaining the confidentiality of your credentials.
5. We keep your notes for 30 days after you delete them.
6. We may share anonymized usage statistics with analytics providers.
7. We do not sell your personal data.
8. You can export or delete your data at any time.
9. You retain all ownership rights to your notes and uploaded documents.
10. We grant you a limited non-exclusive license to use the platform.
11. You agree not to reverse engineer or abuse the service infrastructure.
12. We may suspend accounts that violate our security policies or service integrity.
13. We implement reasonable administrative measures to protect stored customer content.
14. Service availability is provided on an as-is and as-available basis.
15. Our total aggregate liability is limited to the fees paid in the past twelve months.
16. Neither party is liable for indirect or consequential damages arising from service interruption.
17. Disputes are resolved in the courts of Delaware.
18. These terms constitute the entire agreement between you and Acme Notes.
19. We will notify you of material changes before they become effective.
20. Contact us at support@acme.example.
"""
    v0_clean = page_text(v0_text)
    v0_clauses = split_clauses(v0_clean)
    print(f"v0 clauses count: {len(v0_clauses)}")
    v0_norm = [normalize_clause(c) for c in v0_clauses]
    h0 = norm_hash(v0_norm)
    print("v0 norm hash:", h0)

    # Test v1 cosmetic html
    v1_html = b"""<!DOCTYPE html>
<html>
<head><title>ACME NOTES TERMS</title><style>body { font-family: sans-serif; }</style></head>
<body>
<h1>TERMS OF SERVICE</h1>
<p>Last updated: March 15, 2026. All rights reserved.</p>
<div>
<p>Contact us at support@acme.example.</p>
<p>By accessing our services you agree to these terms.</p>
<p>Welcome to Acme Notes terms of service.</p>
<p>You must provide accurate registration information to open an account.</p>
<p>You are responsible for maintaining the confidentiality of your credentials.</p>
<p>We keep your notes for 30 days after you delete them.</p>
<p>We may share anonymized usage statistics with analytics providers.</p>
<p>We do not sell your personal data.</p>
<p>You can export or delete your data at any time.</p>
<p>You retain all ownership rights to your notes and uploaded documents.</p>
<p>We grant you a limited non-exclusive license to use the platform.</p>
<p>You agree not to reverse engineer or abuse the service infrastructure.</p>
<p>We may suspend accounts that violate our security policies or service integrity.</p>
<p>We implement reasonable administrative measures to protect stored customer content.</p>
<p>Service availability is provided on an as-is and as-available basis.</p>
<p>Our total aggregate liability is limited to the fees paid in the past twelve months.</p>
<p>Neither party is liable for indirect or consequential damages arising from service interruption.</p>
<p>Disputes are resolved in the courts of Delaware.</p>
<p>These terms constitute the entire agreement between you and Acme Notes.</p>
<p>We will notify you of material changes before they become effective.</p>
</div>
</body>
</html>
"""
    v1_clean = page_text(v1_html)
    v1_clauses = split_clauses(v1_clean)
    print(f"v1 clauses count: {len(v1_clauses)}")
    v1_norm = [normalize_clause(c) for c in v1_clauses]
    h1 = norm_hash(v1_norm)
    print("v1 norm hash:", h1)
    assert h0 == h1, f"Hash mismatch! {h0} != {h1}"
    print("SUCCESS: v0 and v1 norm_hash match exactly!")
