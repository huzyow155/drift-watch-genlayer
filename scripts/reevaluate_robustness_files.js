const fs = require('fs');
const path = require('path');

// Exact decide matching contracts/DriftWatch.py
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

// Strict parser matching contracts/DriftWatch.py
function parseLabelsStrict(text, n_changes, n_redlines) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, reason: `JSON parse failed: ${e.message}`, ch: [], rl: [] };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: "root is not a JSON object", ch: [], rl: [] };
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("changes") || !keys.includes("redlines")) {
    return { ok: false, reason: `keys mismatch: expected ['changes', 'redlines'], got [${keys.join(', ')}]`, ch: [], rl: [] };
  }

  const ch = data["changes"];
  const rl = data["redlines"];
  if (!Array.isArray(ch) || !Array.isArray(rl)) {
    return { ok: false, reason: "changes or redlines is not an array", ch: [], rl: [] };
  }

  if (ch.length !== n_changes || rl.length !== n_redlines) {
    return { ok: false, reason: `length mismatch: changes=${ch.length}/${n_changes}, redlines=${rl.length}/${n_redlines}`, ch: [], rl: [] };
  }

  const validChange = new Set(["NONE", "MINOR", "MATERIAL", "UNCLEAR"]);
  const validRedline = new Set(["HIT", "CLEAR", "UNCLEAR"]);

  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (typeof c !== 'string' || !validChange.has(c)) {
      return { ok: false, reason: `changes[${i}] invalid label '${c}'`, ch: [], rl: [] };
    }
  }

  for (let i = 0; i < rl.length; i++) {
    const r = rl[i];
    if (typeof r !== 'string' || !validRedline.has(r)) {
      return { ok: false, reason: `redlines[${i}] invalid flag '${r}'`, ch: [], rl: [] };
    }
  }

  return { ok: true, reason: "parsed strictly", ch, rl };
}

const dir = path.join(__dirname, '../docs/evidence/robustness');
const prompts = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/robustness_prompts.json'), 'utf8'));

const fixtureConfigs = {
  v2: { name: 'terms-v2-subtle.md', tripwire: false, prereg: 'MATERIAL' },
  v3: { name: 'terms-v3-obvious.md', tripwire: false, prereg: 'MATERIAL' },
  v4: { name: 'terms-v4-injection.md', tripwire: true, prereg: 'MATERIAL' },
  v5: { name: 'terms-v5-harmless.md', tripwire: false, prereg: 'NONE' },
  v6: { name: 'terms-v6-salami1.md', tripwire: false, prereg: 'MINOR' },
  v7: { name: 'terms-v7-salami2.md', tripwire: false, prereg: 'MATERIAL' },
};

const txtFiles = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort();

console.log(`Re-evaluating all ${txtFiles.length} robustness files with exact contract decide()...\n`);
console.log('FILE | FORMAT | OLD VERDICT | NEW VERDICT | STATUS | DETAIL');
console.log('---|---|---|---|---|---');

let changedCount = 0;
const changedFiles = [];

for (const f of txtFiles) {
  const filePath = path.join(dir, f);
  const content = fs.readFileSync(filePath, 'utf8');
  
  const m = f.match(/^robustness_([a-z0-9]+)_run(\d+)\.txt$/);
  if (!m) continue;
  const fixtureKey = m[1];
  const runNum = parseInt(m[2], 10);
  const cfg = fixtureConfigs[fixtureKey];
  const pData = prompts[fixtureKey];

  const hasHeader = content.includes('Evaluated Verdict:');
  let rawText = content;
  let oldVerdict = 'N/A';

  if (hasHeader) {
    const oldVerdictMatch = content.match(/Evaluated Verdict:\s*([^\r\n]+)/);
    oldVerdict = oldVerdictMatch ? oldVerdictMatch[1].trim() : 'N/A';
    if (content.includes('--- RAW MODEL OUTPUT ---')) {
      rawText = content.split('--- RAW MODEL OUTPUT ---')[1].trim();
    }
  } else {
    // Plain raw JSON format (Batch 2 files)
    rawText = content.trim();
  }

  const parseRes = parseLabelsStrict(rawText, pData.n_changes, pData.n_redlines);
  let newVerdict = 'REVIEW';
  if (parseRes.ok) {
    newVerdict = decide(parseRes.ch, parseRes.rl, cfg.tripwire);
  }

  if (!hasHeader) {
    // For Batch 2 files, oldVerdict is whatever newVerdict evaluates to (they only store raw JSON)
    oldVerdict = newVerdict;
  }

  const isDifferent = oldVerdict !== newVerdict;
  if (isDifferent) {
    changedCount++;
    changedFiles.push({ file: f, oldVerdict, newVerdict, ch: parseRes.ch, rl: parseRes.rl });
    
    // Update the Evaluated Verdict line in the file
    const updatedContent = content.replace(
      /Evaluated Verdict:\s*[^\r\n]+/,
      `Evaluated Verdict: ${newVerdict}`
    );
    fs.writeFileSync(filePath, updatedContent, 'utf8');
  }

  const format = hasHeader ? 'Header+Raw' : 'RawJSON';
  const status = isDifferent ? '**CHANGED**' : 'UNCHANGED';
  const detail = `parseOk=${parseRes.ok}, ch=${JSON.stringify(parseRes.ch)}, rl=${JSON.stringify(parseRes.rl)}`;
  console.log(`${f} | ${format} | ${oldVerdict} | ${newVerdict} | ${status} | ${detail}`);
}

console.log(`\nRe-evaluation Complete. Total files: ${txtFiles.length}. Changed: ${changedCount}.`);
if (changedFiles.length > 0) {
  console.log('\nUpdated files:');
  for (const c of changedFiles) {
    console.log(`- ${c.file}: '${c.oldVerdict}' -> '${c.newVerdict}'`);
  }
}
