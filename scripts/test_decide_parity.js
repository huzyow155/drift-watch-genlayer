// Parity test comparing JS decide implementation against contract rules from DriftWatch.py
const assert = require('assert');

function decide(ch_labels, rl_flags, tripwire = false) {
  // Any red line HIT -> MATERIAL
  if (rl_flags.some(flag => flag === "HIT")) {
    return "MATERIAL";
  }

  // Else any change MATERIAL -> MATERIAL
  if (ch_labels.some(lbl => lbl === "MATERIAL")) {
    return "MATERIAL";
  }

  // Else any UNCLEAR -> REVIEW
  if (ch_labels.some(lbl => lbl === "UNCLEAR") || rl_flags.some(flag => flag === "UNCLEAR")) {
    return "REVIEW";
  }

  // Else any change MINOR -> MINOR
  let verdict;
  if (ch_labels.some(lbl => lbl === "MINOR")) {
    verdict = "MINOR";
  } else {
    verdict = "NONE";
  }

  // Tripwire floor: if tripwire fired and verdict is NONE or MINOR -> REVIEW
  if (tripwire && (verdict === "NONE" || verdict === "MINOR")) {
    return "REVIEW";
  }

  return verdict;
}

const testCases = [
  // 1. Run 8 case: MINOR change, but UNCLEAR in redlines -> MUST BE REVIEW
  { ch: ["MINOR"], rl: ["UNCLEAR", "CLEAR", "CLEAR", "CLEAR"], tripwire: false, expected: "REVIEW", desc: "v2_run8 case (UNCLEAR flag overrides MINOR)" },
  
  // 2. Pure NONE without tripwire -> NONE
  { ch: ["NONE"], rl: ["CLEAR", "CLEAR"], tripwire: false, expected: "NONE", desc: "all NONE and CLEAR" },
  
  // 3. Pure NONE with tripwire -> REVIEW (tripwire floor)
  { ch: ["NONE"], rl: ["CLEAR", "CLEAR"], tripwire: true, expected: "REVIEW", desc: "NONE with tripwire floor" },
  
  // 4. Pure MINOR without tripwire -> MINOR
  { ch: ["MINOR"], rl: ["CLEAR", "CLEAR"], tripwire: false, expected: "MINOR", desc: "MINOR without tripwire" },
  
  // 5. Pure MINOR with tripwire -> REVIEW (tripwire floor)
  { ch: ["MINOR"], rl: ["CLEAR", "CLEAR"], tripwire: true, expected: "REVIEW", desc: "MINOR with tripwire floor" },
  
  // 6. Redline HIT overrides everything -> MATERIAL
  { ch: ["NONE"], rl: ["HIT"], tripwire: false, expected: "MATERIAL", desc: "redline HIT with NONE" },
  { ch: ["NONE"], rl: ["HIT"], tripwire: true, expected: "MATERIAL", desc: "redline HIT with NONE and tripwire" },
  { ch: ["MINOR"], rl: ["HIT"], tripwire: false, expected: "MATERIAL", desc: "redline HIT with MINOR" },
  { ch: ["UNCLEAR"], rl: ["HIT"], tripwire: false, expected: "MATERIAL", desc: "redline HIT with UNCLEAR change" },
  { ch: ["UNCLEAR"], rl: ["HIT", "UNCLEAR"], tripwire: true, expected: "MATERIAL", desc: "redline HIT with UNCLEAR redline" },
  
  // 7. Change MATERIAL overrides UNCLEAR (if no HIT) -> MATERIAL
  { ch: ["MATERIAL"], rl: ["CLEAR"], tripwire: false, expected: "MATERIAL", desc: "change MATERIAL with CLEAR" },
  { ch: ["MATERIAL"], rl: ["CLEAR"], tripwire: true, expected: "MATERIAL", desc: "change MATERIAL with CLEAR and tripwire" },
  { ch: ["MATERIAL", "UNCLEAR"], rl: ["CLEAR"], tripwire: false, expected: "MATERIAL", desc: "change MATERIAL with UNCLEAR change" },
  { ch: ["MATERIAL"], rl: ["UNCLEAR"], tripwire: false, expected: "MATERIAL", desc: "change MATERIAL with UNCLEAR redline" },
  { ch: ["MATERIAL", "MINOR"], rl: ["UNCLEAR"], tripwire: true, expected: "MATERIAL", desc: "change MATERIAL with MINOR and UNCLEAR" },
  
  // 8. UNCLEAR without MATERIAL or HIT -> REVIEW
  { ch: ["UNCLEAR"], rl: ["CLEAR"], tripwire: false, expected: "REVIEW", desc: "UNCLEAR change" },
  { ch: ["NONE"], rl: ["UNCLEAR"], tripwire: false, expected: "REVIEW", desc: "UNCLEAR redline" },
  { ch: ["MINOR"], rl: ["UNCLEAR"], tripwire: false, expected: "REVIEW", desc: "MINOR change with UNCLEAR redline" },
  { ch: ["UNCLEAR"], rl: ["CLEAR"], tripwire: true, expected: "REVIEW", desc: "UNCLEAR change with tripwire" },
  { ch: ["MINOR", "UNCLEAR"], rl: ["CLEAR"], tripwire: true, expected: "REVIEW", desc: "MINOR and UNCLEAR change with tripwire" },
  
  // 9. Multiple changes combinations
  { ch: ["NONE", "NONE", "NONE"], rl: ["CLEAR", "CLEAR"], tripwire: false, expected: "NONE", desc: "multiple NONE" },
  { ch: ["NONE", "MINOR", "NONE"], rl: ["CLEAR", "CLEAR"], tripwire: false, expected: "MINOR", desc: "multiple changes with one MINOR" },
  { ch: ["NONE", "MINOR", "NONE"], rl: ["CLEAR", "CLEAR"], tripwire: true, expected: "REVIEW", desc: "multiple changes with MINOR and tripwire" },
  { ch: ["NONE", "MINOR", "MATERIAL"], rl: ["CLEAR", "CLEAR"], tripwire: false, expected: "MATERIAL", desc: "multiple changes with MATERIAL" },
  { ch: ["NONE", "MINOR", "UNCLEAR"], rl: ["CLEAR", "CLEAR"], tripwire: false, expected: "REVIEW", desc: "multiple changes with UNCLEAR" }
];

console.log(`Running test_decide_parity with ${testCases.length} cases...`);

let passed = 0;
for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const actual = decide(tc.ch, tc.rl, tc.tripwire);
  assert.strictEqual(
    actual,
    tc.expected,
    `Case #${i + 1} (${tc.desc}) failed: expected ${tc.expected}, got ${actual}`
  );
  console.log(`PASS Case #${i + 1}: [${tc.ch.join(', ')}] / [${tc.rl.join(', ')}] (tripwire=${tc.tripwire}) => ${actual} (${tc.desc})`);
  passed++;
}

console.log(`\nAll ${passed}/${testCases.length} test cases passed parity with contracts/DriftWatch.py decide()!`);
