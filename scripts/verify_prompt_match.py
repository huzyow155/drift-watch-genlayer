import re
import hashlib
import json

def get_dw_instructions():
    with open('contracts/DriftWatch.py', 'r', encoding='ascii') as f:
        dw_content = f.read()

    # Find instructions tuple
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

if __name__ == '__main__':
    instr = get_dw_instructions()
    h = hashlib.sha256(instr.encode('utf-8')).hexdigest()
    print("Extracted DriftWatch.py instructions sha256:", h)
    print("Length:", len(instr))
    print("First 100 chars:", repr(instr[:100]))
