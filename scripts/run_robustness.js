const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient, chains, createAccount } = require('genlayer-js');
const { generatePrivateKey } = require('viem/accounts');

// Exact parse_labels matching contracts/DriftWatch.py Iteration 1
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
    if (typeof c !== 'string') {
      return { ok: false, reason: `changes[${i}] is not a string (type ${typeof c}): ${JSON.stringify(c)}`, ch: [], rl: [] };
    }
    if (!validChange.has(c)) {
      return { ok: false, reason: `changes[${i}] invalid label '${c}'`, ch: [], rl: [] };
    }
  }

  for (let i = 0; i < rl.length; i++) {
    const r = rl[i];
    if (typeof r !== 'string') {
      return { ok: false, reason: `redlines[${i}] is not a string (type ${typeof r}): ${JSON.stringify(r)}`, ch: [], rl: [] };
    }
    if (!validRedline.has(r)) {
      return { ok: false, reason: `redlines[${i}] invalid flag '${r}'`, ch: [], rl: [] };
    }
  }

  return { ok: true, reason: "parsed strictly", ch, rl };
}

function decide(ch_labels, rl_flags, tripwire = false) {
  if (tripwire) return "MATERIAL";
  if (rl_flags.some(r => r === "HIT")) return "MATERIAL";
  if (ch_labels.some(c => c === "MATERIAL")) return "MATERIAL";
  if (ch_labels.some(c => c === "MINOR")) return "MINOR";
  if (ch_labels.some(c => c === "UNCLEAR") || rl_flags.some(r => r === "UNCLEAR")) return "REVIEW";
  if (ch_labels.every(c => c === "NONE") && rl_flags.every(r => r === "CLEAR")) return "NONE";
  return "REVIEW";
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function retryWithBackoff(fn, desc, maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e.message || String(e);
      let waitSeconds = 5;
      if (e.cause?.data?.retry_after_seconds) {
        waitSeconds = e.cause.data.retry_after_seconds + 2;
      } else if (msg.includes('Rate limit exceeded') || msg.includes('429')) {
        waitSeconds = 15;
      }
      console.warn(`  [${desc}] Attempt ${attempt}/${maxRetries} failed: ${msg.slice(0, 90)}. Backing off for ${waitSeconds}s...`);
      if (attempt === maxRetries) throw e;
      await sleep(waitSeconds * 1000);
    }
  }
}

async function waitForReceiptCustom(client, txHash) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      return await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 150,
        interval: 3500,
      });
    } catch (e) {
      const msg = e.message || String(e);
      let waitSec = 5;
      if (e.cause?.data?.retry_after_seconds) {
        waitSec = e.cause.data.retry_after_seconds + 2;
      }
      if (attempt === 20) throw e;
      console.warn(`  [Receipt] Polling issue: ${msg.slice(0, 80)}. Waiting ${waitSec}s...`);
      await sleep(waitSec * 1000);
    }
  }
}

async function main() {
  console.log("==================================================================");
  console.log("DRIFT WATCH: STATISTICAL ROBUSTNESS SUITE (35 RUNS ON STUDIONET)");
  console.log("==================================================================");

  // 1. Verify instructions prompt sha256 against DriftWatch.py
  const { execSync } = require('child_process');
  const pyOut = execSync('python scripts/verify_prompt_match.py', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  const m = pyOut.match(/Extracted DriftWatch\.py instructions sha256:\s*([a-f0-9]+)/);
  if (!m) {
    throw new Error("Could not extract instructions sha256 via verify_prompt_match.py");
  }
  const dwSha256 = m[1].trim();
  console.log(`DriftWatch.py instructions SHA-256: ${dwSha256}`);

  // Load prompts generated by extract_fixture_prompts.py
  const promptsPath = path.join(__dirname, '../fixtures/robustness_prompts.json');
  if (!fs.existsSync(promptsPath)) {
    throw new Error("fixtures/robustness_prompts.json missing! Run python scripts/extract_fixture_prompts.py first.");
  }
  const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));

  const probeInstrSha256 = crypto.createHash('sha256').update(prompts['v2'].prompt_obj.instructions, 'utf8').digest('hex');
  console.log(`Probe runner instructions SHA-256:  ${probeInstrSha256}`);

  if (dwSha256 !== probeInstrSha256) {
    throw new Error(`FATAL: Prompt mismatch! DW=${dwSha256} vs Probe=${probeInstrSha256}`);
  }
  console.log(">> Instructions prompt string verified byte-identical!\n");

  // Setup account & client
  const envPath = path.join(__dirname, '../.env');
  let privateKey = null;
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const m = envContent.match(/THROWAWAY_PRIVATE_KEY=([0-9a-fA-Fx]+)/);
    if (m) privateKey = m[1].trim();
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

  // Plan runs: v2: 10, v5: 10, v3: 5, v6: 5, v7: 5
  const suitePlan = [
    { fix: 'v2', targetRuns: 10, name: 'terms-v2-subtle.md' },
    { fix: 'v5', targetRuns: 10, name: 'terms-v5-harmless.md' },
    { fix: 'v3', targetRuns: 5,  name: 'terms-v3-obvious.md' },
    { fix: 'v6', targetRuns: 5,  name: 'terms-v6-salami1.md' },
    { fix: 'v7', targetRuns: 5,  name: 'terms-v7-salami2.md' },
  ];

  const totalRuns = suitePlan.reduce((acc, p) => acc + p.targetRuns, 0);
  console.log(`Total planned on-chain runs: ${totalRuns}\n`);

  let runCounter = 0;
  const detailedResults = [];

  for (const item of suitePlan) {
    const fixtureKey = item.fix;
    const promptData = prompts[fixtureKey];
    console.log(`------------------------------------------------------------------`);
    console.log(`STARTING FIXTURE ${fixtureKey.toUpperCase()} (${item.name}): ${item.targetRuns} RUNS`);
    console.log(`------------------------------------------------------------------`);

    for (let i = 1; i <= item.targetRuns; i++) {
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

      const statusOk = receipt.status_name === 'ACCEPTED' || receipt.status_name === 'FINALIZED';
      const resultOk = receipt.result_name === 'MAJORITY_AGREE';
      const leaderModel = receipt.consensus_data?.leader_receipt?.[0]?.node_config?.primary_model?.model || 'unknown';

      // Read raw result from probe contract
      await sleep(1500); // Small pause before read
      const rawOutput = await retryWithBackoff(
        () => client.readContract({
          address: probeAddress,
          functionName: 'get_result',
          args: [resultKey],
        }),
        `readContract ${resultKey}`
      );

      // Parse with strict parser
      const parseEval = parseLabelsStrict(rawOutput, promptData.n_changes, promptData.n_redlines);
      let verdict = "REVIEW";
      if (parseEval.ok) {
        verdict = decide(parseEval.ch, parseEval.rl, false);
      }

      console.log(`  Leader: ${leaderModel} | Elapsed: ${elapsed}s | Parse: ${parseEval.ok ? 'SUCCESS' : 'FAIL'}`);
      console.log(`  Verdict: ${verdict} | Parse reason: ${parseEval.reason}`);
      console.log(`  Raw preview: ${JSON.stringify(rawOutput.slice(0, 80))}`);

      // Save raw text file
      const rawTextFile = path.join(outDir, `${resultKey}.txt`);
      const txtContent = [
        `Fixture: ${fixtureKey} (${item.name})`,
        `Run: ${i}`,
        `Tx Hash: ${txHash}`,
        `Elapsed: ${elapsed}s`,
        `Receipt Status: ${receipt.status_name} / ${receipt.result_name}`,
        `Leader Model: ${leaderModel}`,
        `Parse Result: ${parseEval.ok ? 'SUCCESS' : 'FAILED'}`,
        `Parse Reason: ${parseEval.reason}`,
        `Evaluated Verdict: ${verdict}`,
        `Parsed Changes: ${JSON.stringify(parseEval.ch)}`,
        `Parsed Redlines: ${JSON.stringify(parseEval.rl)}`,
        `\n--- RAW MODEL OUTPUT ---`,
        rawOutput,
      ].join('\n');
      fs.writeFileSync(rawTextFile, txtContent, 'utf8');

      // Save receipt JSON
      const receiptFile = path.join(outDir, `${resultKey}_receipt.json`);
      fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), 'utf8');

      detailedResults.push({
        fixture: fixtureKey,
        name: item.name,
        run: i,
        resultKey,
        txHash,
        elapsed: parseFloat(elapsed),
        status: receipt.status_name,
        result: receipt.result_name,
        leaderModel,
        parseOk: parseEval.ok,
        parseReason: parseEval.reason,
        verdict,
        rawLength: rawOutput.length,
      });

      // Pause between runs to respect 30 req/min RPC limits
      await sleep(3500);
    }
  }

  // 4. Summarize statistics
  console.log("\n==================================================================");
  console.log("COMPUTING SUMMARY STATISTICS");
  console.log("==================================================================");

  const summary = {
    evaluatedAt: new Date().toISOString(),
    probeAddress,
    dwInstructionsSha256: dwSha256,
    totalRuns: detailedResults.length,
    byFixture: {},
  };

  for (const item of suitePlan) {
    const fix = item.fix;
    const runs = detailedResults.filter(r => r.fixture === fix);
    const successCount = runs.filter(r => r.parseOk).length;
    const successRate = (successCount / runs.length) * 100;

    const verdictDist = {};
    const modelDist = {};
    let totalElapsed = 0;

    for (const r of runs) {
      verdictDist[r.verdict] = (verdictDist[r.verdict] || 0) + 1;
      modelDist[r.leaderModel] = (modelDist[r.leaderModel] || 0) + 1;
      totalElapsed += r.elapsed;
    }

    summary.byFixture[fix] = {
      name: item.name,
      totalRuns: runs.length,
      parseSuccessCount: successCount,
      parseSuccessRatePct: successRate.toFixed(1),
      verdictDistribution: verdictDist,
      leaderModels: modelDist,
      avgElapsedSeconds: (totalElapsed / runs.length).toFixed(2),
      meetsThreshold90Pct: successRate >= 90.0,
      runs: runs.map(r => ({
        run: r.run,
        txHash: r.txHash,
        elapsed: r.elapsed,
        leaderModel: r.leaderModel,
        parseOk: r.parseOk,
        verdict: r.verdict,
      })),
    };
  }

  const summaryPath = path.join(outDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log("Saved summary to:", summaryPath);

  // 5. Update docs/ROBUSTNESS.md
  console.log("\nUpdating docs/ROBUSTNESS.md with measured data...");
  let mdTable = [
    `| Fixture | Name | Planned Runs | Parse Success | Parse Success % | Verdict Distribution | Avg Elapsed | Meets >=90% Rule? |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |`,
  ];

  let allPassed = true;
  for (const [fix, data] of Object.entries(summary.byFixture)) {
    if (!data.meetsThreshold90Pct) allPassed = false;
    const vStr = Object.entries(data.verdictDistribution).map(([k, v]) => `${k}: ${v}`).join(', ');
    mdTable.push(`| **${fix}** | \`${data.name}\` | ${data.totalRuns} | **${data.parseSuccessCount} / ${data.totalRuns}** | **${data.parseSuccessRatePct}%** | ${vStr} | ${data.avgElapsedSeconds}s | **${data.meetsThreshold90Pct ? 'YES' : 'NO'}** |`);
  }

  let runsDetailTable = [
    `\n### Detailed Run Log (Raw Measured Data)\n`,
    `| Fixture | Run | Tx Hash | Leader Model | Elapsed | Parse Status | Verdict |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`,
  ];
  for (const r of detailedResults) {
    runsDetailTable.push(`| **${r.fixture}** | ${r.run} | \`${r.txHash}\` | \`${r.leaderModel}\` | ${r.elapsed}s | ${r.parseOk ? 'SUCCESS' : 'FAIL'} | \`${r.verdict}\` |`);
  }

  const robustnessDoc = [
    `# Robustness Evaluation of LLM Label Parsing (Iteration 1)`,
    ``,
    `Status: Preview (Studionet)  `,
    `Network: Studionet (Chain ID: 61999)  `,
    `Probe Contract: \`0x43c882AA13699503Dfa7B0886e7F64fc92cf41DF\`  `,
    `Instructions SHA-256: \`${dwSha256}\` (verified byte-identical with \`contracts/DriftWatch.py\`)  `,
    `Evaluated At: \`${summary.evaluatedAt}\`  `,
    ``,
    `---`,
    ``,
    `## 1. Pre-Registered Decision Rule`,
    ``,
    `To avoid post-hoc justification, the following rule was established prior to executing the 35 live runs:`,
    ``,
    `1. **Threshold**: For each fixture (\`v2\`, \`v3\`, \`v5\`, \`v6\`, \`v7\`), parse success must be **>= 90%** (at least 9/10 for \`v2\` and \`v5\`, and at least 5/5 for \`v3\`, \`v6\`, \`v7\`).`,
    `2. **Action if Passed (>= 90%)**: Keep Iteration 1 as active deployment; no further prompt iterations or redeployments.`,
    `3. **Action if Failed (< 90%)**: If any fixture fails to reach 90%, proceed to Iteration 2 (final allowed), rerun 35 runs, and redeploy only if Iteration 2 is demonstrably better. If still < 90%, document the measured failure/REVIEW rate in \`docs/LIMITATIONS.md\`. Never loosen the parser.`,
    ``,
    `---`,
    ``,
    `## 2. Statistical Robustness Results (35 On-Chain Runs)`,
    ``,
    mdTable.join('\n'),
    ``,
    `### Decision Rule Outcome:`,
    allPassed
      ? `**PASS**: Every tested fixture achieved >= 90% parse success rate across diverse Studionet models. Under the pre-registered decision rule, **Iteration 1 is retained as the active deployment**. No redeployment or Iteration 2 is required.`
      : `**FAIL**: One or more fixtures fell below 90% parse success. Advancing to Iteration 2.`,
    ``,
    runsDetailTable.join('\n'),
    ``,
    `---`,
    `*All receipts archived at \`docs/evidence/robustness/*_receipt.json\` and raw outputs at \`docs/evidence/robustness/*.txt\`.*`,
  ].join('\n');

  fs.writeFileSync(path.join(__dirname, '../docs/ROBUSTNESS.md'), robustnessDoc, 'utf8');
  console.log("Updated docs/ROBUSTNESS.md successfully!");
  console.log("\n==================================================================");
  console.log("ROBUSTNESS SUITE COMPLETED SUCCESSFULLY");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("ROBUSTNESS SUITE FAILED:", err);
  process.exit(1);
});
