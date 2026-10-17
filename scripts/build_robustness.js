const fs = require('fs');
const path = require('path');

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

  return { ok: true, reason: "OK", ch, rl };
}

function decide(change_labels, redline_flags, tripwire = false) {
  if (redline_flags.some(f => f === "HIT")) return "MATERIAL";
  if (change_labels.some(l => l === "MATERIAL")) return "MATERIAL";
  if (change_labels.some(l => l === "UNCLEAR") || redline_flags.some(f => f === "UNCLEAR")) return "REVIEW";
  let verdict = change_labels.some(l => l === "MINOR") ? "MINOR" : "NONE";
  if (tripwire && (verdict === "NONE" || verdict === "MINOR")) return "REVIEW";
  return verdict;
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

// Scan all receipts
const files = fs.readdirSync(dir).filter(f => f.endsWith('_receipt.json')).sort();

const allRuns = [];

for (const rcptName of files) {
  const base = rcptName.replace('_receipt.json', '');
  const m = base.match(/^robustness_([a-z0-9]+)_run(\d+)$/);
  if (!m) continue;
  const fixtureKey = m[1];
  const runNum = parseInt(m[2], 10);

  const rcptPath = path.join(dir, rcptName);
  const txtPath = path.join(dir, `${base}.txt`);

  const rcpt = JSON.parse(fs.readFileSync(rcptPath, 'utf8'));
  let rawText = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : '';
  if (rawText.includes('--- RAW MODEL OUTPUT ---')) {
    rawText = rawText.split('--- RAW MODEL OUTPUT ---')[1].trim();
  }

  const cfg = fixtureConfigs[fixtureKey];
  const pData = prompts[fixtureKey];
  const parseRes = parseLabelsStrict(rawText, pData.n_changes, pData.n_redlines);

  let verdict = "REVIEW";
  if (parseRes.ok) {
    verdict = decide(parseRes.ch, parseRes.rl, cfg.tripwire);
  }

  const txHash = rcpt.hash;
  const leaderReceipt = rcpt.consensus_data?.leader_receipt?.[0];
  const leaderModel = leaderReceipt?.node_config?.primary_model?.model || 'unknown';

  allRuns.push({
    fixtureKey,
    runNum,
    base,
    txHash,
    leaderModel,
    parseOk: parseRes.ok,
    parseReason: parseRes.reason,
    verdict,
    prereg: cfg.prereg,
    verdictMatches: verdict === cfg.prereg,
  });
}

// Group by fixture
const grouped = {};
for (const r of allRuns) {
  if (!grouped[r.fixtureKey]) grouped[r.fixtureKey] = [];
  grouped[r.fixtureKey].push(r);
}

// Sort runs by runNum
for (const k in grouped) {
  grouped[k].sort((a, b) => a.runNum - b.runNum);
}

// Generate Markdown tables
console.log("## 2. Statistical Robustness Results (Combined 60 Runs on Studionet)\n");

console.log("| Fixture | Name | Total Runs | Parse Success | Parse Success % | Verdict Distribution | Meets >=90% Rule? |");
console.log("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |");

let totalRunsCount = 0;
let totalParseSuccessCount = 0;

for (const k of ['v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
  const runs = grouped[k] || [];
  const count = runs.length;
  const successCount = runs.filter(r => r.parseOk).length;
  const pct = ((successCount / count) * 100).toFixed(1);
  const vDist = {};
  for (const r of runs) {
    vDist[r.verdict] = (vDist[r.verdict] || 0) + 1;
  }
  const vDistStr = Object.entries(vDist).map(([v, c]) => `${v}: ${c}`).join(', ');
  const meets = parseFloat(pct) >= 90.0 ? "**YES**" : "**NO**";

  totalRunsCount += count;
  totalParseSuccessCount += successCount;

  console.log(`| **${k}** | \`${fixtureConfigs[k].name}\` | ${count} | **${successCount} / ${count}** | **${pct}%** | ${vDistStr} | ${meets} |`);
}

const totalPct = ((totalParseSuccessCount / totalRunsCount) * 100).toFixed(2);
console.log(`\n**Total Suite Parse Success**: **${totalParseSuccessCount} / ${totalRunsCount} (${totalPct}%)**\n`);

console.log("### Verdict Agreement with Pre-Registered Verdict\n");
console.log("| Fixture | Pre-Registered Verdict | Total Runs | Agreement Count | Agreement % | Verdict Variance / Notes |");
console.log("| :--- | :--- | :--- | :--- | :--- | :--- |");

for (const k of ['v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
  const runs = grouped[k] || [];
  const count = runs.length;
  const agreeCount = runs.filter(r => r.verdictMatches).length;
  const agreePct = ((agreeCount / count) * 100).toFixed(1);

  const varianceList = [];
  for (const r of runs) {
    if (!r.verdictMatches) {
      varianceList.push(`${r.verdict} (run ${r.runNum})`);
    }
  }
  const varianceStr = varianceList.length > 0 ? varianceList.join(', ') : "None (100% agreement)";

  console.log(`| **${k}** | \`${fixtureConfigs[k].prereg}\` | ${count} | ${agreeCount} / ${count} | **${agreePct}%** | ${varianceStr} |`);
}

console.log("\n### Complete Run Log (60 Runs)\n");
console.log("| Fixture | Run | Tx Hash | Leader Model | Parse Status | Verdict | Pre-Reg Match |");
console.log("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |");

for (const k of ['v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
  const runs = grouped[k] || [];
  for (const r of runs) {
    const matchStr = r.verdictMatches ? "MATCH" : `DIFF (${r.verdict})`;
    console.log(`| **${r.fixtureKey}** | ${r.runNum} | \`${r.txHash}\` | \`${r.leaderModel}\` | ${r.parseOk ? 'SUCCESS' : 'FAIL'} | \`${r.verdict}\` | ${matchStr} |`);
  }
}
