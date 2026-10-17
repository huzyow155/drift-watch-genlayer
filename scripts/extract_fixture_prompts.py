import os
import sys
import json
import hashlib

# Add tests directory to sys.path for genlayer mock
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../tests')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from contracts.DriftWatch import page_text, split_clauses, normalize_clause, clause_diff

def extract_dw_instructions():
    dw_path = os.path.join(os.path.dirname(__file__), '../contracts/DriftWatch.py')
    with open(dw_path, 'r', encoding='ascii') as f:
        dw_content = f.read()

    start_tag = '"instructions": ('
    start_idx = dw_content.find(start_tag)
    if start_idx == -1:
        raise ValueError("Could not find start of instructions")
    end_tag = '),\n                "redlines": red_lines,'
    end_idx = dw_content.find(end_tag, start_idx)
    if end_idx == -1:
        raise ValueError("Could not find end of instructions")

    tuple_str = dw_content[start_idx + len('"instructions": '):end_idx + 1]
    instructions = eval(tuple_str)
    return instructions

def main():
    instructions = extract_dw_instructions()
    instr_hash = hashlib.sha256(instructions.encode('utf-8')).hexdigest()
    print("DriftWatch.py instructions sha256:", instr_hash)

    fixtures_dir = os.path.join(os.path.dirname(__file__), '../fixtures')
    pages_dir = os.path.join(fixtures_dir, 'pages')
    with open(os.path.join(fixtures_dir, 'redlines.json'), 'r', encoding='utf-8') as f:
        redlines = json.load(f)

    with open(os.path.join(pages_dir, 'terms-v0.md'), 'rb') as f:
        v0_text = page_text(f.read())
    v0_clauses = [normalize_clause(c) for c in split_clauses(v0_text) if normalize_clause(c)]

    fixtures = {
        'v2': 'terms-v2-subtle.md',
        'v3': 'terms-v3-obvious.md',
        'v4': 'terms-v4-injection.md',
        'v5': 'terms-v5-harmless.md',
        'v6': 'terms-v6-salami1.md',
        'v7': 'terms-v7-salami2.md',
    }

    prompts = {}
    for key, filename in fixtures.items():
        with open(os.path.join(pages_dir, filename), 'rb') as f:
            t = page_text(f.read())
        c = [normalize_clause(cl) for cl in split_clauses(t) if normalize_clause(cl)]
        diff = clause_diff(v0_clauses, c)
        changes = [
            {
                "index": i + 1,
                "kind": ch["kind"],
                "old_clause": ch["old"],
                "new_clause": ch["new"],
            }
            for i, ch in enumerate(diff)
        ]
        prompt_obj = {
            "instructions": instructions,
            "redlines": redlines,
            "changes": changes,
        }
        prompts[key] = {
            "filename": filename,
            "prompt_obj": prompt_obj,
            "prompt_json_str": json.dumps(prompt_obj),
            "n_changes": len(changes),
            "n_redlines": len(redlines),
        }
        print(f"Generated prompt for {key} ({filename}): {len(changes)} changes, {len(redlines)} redlines")

    out_path = os.path.join(fixtures_dir, 'robustness_prompts.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(prompts, f, indent=2)
    print("Saved robustness prompts to:", out_path)

if __name__ == '__main__':
    main()
