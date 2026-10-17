const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient, chains, createAccount } = require('genlayer-js');
const { generatePrivateKey } = require('viem/accounts');

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function retryWithBackoff(fn, desc, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const waitSec = attempt * 4;
      console.warn(`  [Retry ${attempt}/${maxRetries}] ${desc} failed: ${e.message}. Waiting ${waitSec}s...`);
      if (attempt === maxRetries) throw e;
      await sleep(waitSec * 1000);
    }
  }
}

async function waitForReceiptCustom(client, txHash) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      return await client.waitForTransactionReceipt({
        hash: txHash,
        status: 'FINALIZED',
        interval: 3000,
        retries: 40,
      });
    } catch (e) {
      const waitSec = 5;
      if (attempt === 20) throw e;
      console.warn(`  [Receipt] Polling issue: ${e.message.slice(0, 80)}. Waiting ${waitSec}s...`);
      await sleep(waitSec * 1000);
    }
  }
}

async function main() {
  console.log("==================================================================");
  console.log("DRIFT WATCH: BATCH 2 ROBUSTNESS SUITE (v3 x10, v4 x10, v6 x5)");
  console.log("==================================================================");

  // 1. Verify instructions prompt sha256 against DriftWatch.py
  const { execSync } = require('child_process');
  const pyOut = execSync('python scripts/verify_prompt_match.py', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  const m = pyOut.match(/Extracted DriftWatch\.py instructions sha256:\s*([a-f0-9]+)/);
  if (!m) throw new Error("Could not extract instructions sha256");
  const dwSha256 = m[1].trim();
  console.log(`DriftWatch.py instructions SHA-256: ${dwSha256}`);

  const promptsPath = path.join(__dirname, '../fixtures/robustness_prompts.json');
  const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
  const probeInstrSha256 = crypto.createHash('sha256').update(prompts['v3'].prompt_obj.instructions, 'utf8').digest('hex');
  console.log(`Probe instructions SHA-256:        ${probeInstrSha256}`);

  if (dwSha256 !== probeInstrSha256) {
    throw new Error(`Prompt mismatch! DW=${dwSha256} vs Probe=${probeInstrSha256}`);
  }
  console.log(">> Instructions verified byte-identical.\n");

  // Account setup
  const envPath = path.join(__dirname, '../.env');
  let privateKey = null;
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const km = envContent.match(/THROWAWAY_PRIVATE_KEY=([0-9a-fA-Fx]+)/);
    if (km) privateKey = km[1].trim();
  }
  if (!privateKey) {
    privateKey = generatePrivateKey();
    fs.appendFileSync(envPath, `THROWAWAY_PRIVATE_KEY=${privateKey}\n`);
  }

  const account = createAccount(privateKey);
  console.log("Throwaway wallet:", account.address);

  const client = createClient({
    chain: chains.studionet,
    account: account,
  });

  const probeAddress = "0x43c882AA13699503Dfa7B0886e7F64fc92cf41DF";
  console.log("ProbeLabels contract:", probeAddress);

  const outDir = path.join(__dirname, '../docs/evidence/robustness');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Batch 2 plan: v3 runs 6-15, v4 runs 1-10, v6 runs 6-10
  const batchPlan = [
    { fix: 'v3', startRun: 6, targetRuns: 10, name: 'terms-v3-obvious.md', tripwire: false },
    { fix: 'v4', startRun: 1, targetRuns: 10, name: 'terms-v4-injection.md', tripwire: true },
    { fix: 'v6', startRun: 6, targetRuns: 5,  name: 'terms-v6-salami1.md', tripwire: false },
  ];

  const totalRuns = batchPlan.reduce((acc, p) => acc + p.targetRuns, 0);
  console.log(`Total Batch 2 on-chain runs: ${totalRuns}\n`);

  let runCounter = 0;

  for (const item of batchPlan) {
    const fixtureKey = item.fix;
    const promptData = prompts[fixtureKey];
    console.log(`------------------------------------------------------------------`);
    console.log(`STARTING FIXTURE ${fixtureKey.toUpperCase()} (${item.name}): ${item.targetRuns} RUNS`);
    console.log(`------------------------------------------------------------------`);

    for (let i = item.startRun; i < item.startRun + item.targetRuns; i++) {
      runCounter++;
      const resultKey = `robustness_${fixtureKey}_run${i}`;
      console.log(`\n[${runCounter}/${totalRuns}] Executing ${resultKey}...`);

      const t0 = Date.now();
      const txHash = await retryWithBackoff(
        () => client.writeContract({
          address: probeAddress,
          functionName: 'probe_prompt',
          args: [promptData.prompt_json_str, resultKey],
        }),
        `writeContract ${resultKey}`
      );
      console.log(`  tx: ${txHash}`);

      const receipt = await waitForReceiptCustom(client, txHash);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      const leaderModel = leaderReceipt?.node_config?.primary_model?.model || 'unknown';

      // Read raw model response from probe contract
      const rawText = await retryWithBackoff(
        () => client.readContract({
          address: probeAddress,
          functionName: 'get_result',
          args: [resultKey],
        }),
        `readContract get_result ${resultKey}`
      );

      // Save raw text and receipt
      const rawFile = path.join(outDir, `${resultKey}.txt`);
      const rcptFile = path.join(outDir, `${resultKey}_receipt.json`);
      fs.writeFileSync(rawFile, rawText, 'utf8');
      fs.writeFileSync(rcptFile, JSON.stringify(receipt, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2), 'utf8');

      // Test with strict parser
      const parseRes = parseLabelsStrict(rawText, promptData.n_changes, promptData.n_redlines);
      let verdict = "REVIEW";
      if (parseRes.ok) {
        verdict = decide(parseRes.ch, parseRes.rl, item.tripwire);
      }

      console.log(`  Completed in ${elapsed}s | Leader: ${leaderModel}`);
      console.log(`  Parse status: ${parseRes.ok ? 'SUCCESS' : 'FAIL (' + parseRes.reason + ')'} | Verdict: ${verdict}`);
    }
  }

  console.log("\n==================================================================");
  console.log("BATCH 2 RUNS COMPLETE. Saved all receipts and raw text files.");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("FATAL ERROR in Batch 2 runner:", err);
  process.exit(1);
});
