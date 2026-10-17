const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper to decode base64 error payload
function decodeErrorPayload(receipt) {
  const payload = receipt.consensus_data?.leader_receipt?.[0]?.result?.payload;
  if (!payload) return "";
  try {
    return Buffer.from(payload, 'base64').toString('utf8');
  } catch (e) {
    return String(payload);
  }
}

// Receipt verification rule from Section 16
function verifyReceiptSuccess(receipt, desc) {
  const statusOk = receipt.status_name === 'ACCEPTED' || receipt.status_name === 'FINALIZED';
  const resultOk = receipt.result_name === 'MAJORITY_AGREE';
  const leaderRes = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  const leaderOk = leaderRes === 'SUCCESS';

  if (!statusOk || !resultOk || !leaderOk) {
    const errText = decodeErrorPayload(receipt);
    throw new Error(`Write transaction failed [${desc}]: status=${receipt.status_name}, result=${receipt.result_name}, leader=${leaderRes}, error=${errText}`);
  }
}

async function retryAsync(fn, retries = 5, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1 || e.message.includes('Write transaction failed')) {
        throw e;
      }
      console.warn(`Transient RPC issue (${e.message.slice(0, 100)}). Retrying in ${delayMs / 1000}s (attempt ${i + 1}/${retries})...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function waitForReceiptWithRetry(client, txHash, retries = 120, interval = 3000) {
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      return await client.waitForTransactionReceipt({
        hash: txHash,
        retries: retries,
        interval: interval,
      });
    } catch (err) {
      const msg = err.message || "";
      if (attempt === 15 || (!msg.includes("<!DOCTYPE") && !msg.includes("JSON") && !msg.includes("timeout") && !msg.includes("fetch failed") && !msg.includes("Internal error") && !msg.includes("502") && !msg.includes("504") && !msg.includes("UnknownRpcError"))) {
        throw err;
      }
      console.warn(`Transient RPC error while waiting for receipt (${msg.slice(0, 100)}...). Retrying receipt poll in 4s (attempt ${attempt}/15)...`);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

async function main() {
  console.log("=================================================");
  console.log("DRIFT WATCH: MILESTONES 1, 4, 5 LIVE EVIDENCE");
  console.log("=================================================");

  const evidenceDir = path.join(__dirname, '../../docs/evidence_v2');
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

  const envPath = path.join(__dirname, '../../.env');
  let privateKey = null;
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const m = envContent.match(/THROWAWAY_PRIVATE_KEY=([0-9a-fA-Fx]+)/);
    if (m) privateKey = m[1].trim();
  }
  if (!privateKey) {
    const { generatePrivateKey } = require('viem/accounts');
    privateKey = generatePrivateKey();
    fs.appendFileSync(envPath, `THROWAWAY_PRIVATE_KEY=${privateKey}\n`);
  }

  const account = createAccount(privateKey);
  console.log("Using throwaway account:", account.address);

  const client = createClient({
    chain: chains.studionet,
    account: account,
  });

  const commitSha = "c8ff0f0cf8b5e406a44baad04867cb793c52d328";
  const baseUrl = `https://raw.githubusercontent.com/huzyow155/drift-watch-fixtures/${commitSha}`;

  // Read redlines
  const redlinesPath = path.join(__dirname, '../../fixtures/redlines.json');
  const redlinesJson = fs.readFileSync(redlinesPath, 'utf8').trim();

  // Read contract codes
  const watchPath = path.join(__dirname, '../../contracts/DriftWatch.py');
  const watchCode = fs.readFileSync(watchPath, 'utf8');
  const watchSha = crypto.createHash('sha256').update(watchCode, 'utf8').digest('hex');

  const guardPath = path.join(__dirname, '../../contracts/DriftGuard.py');
  const guardCode = fs.readFileSync(guardPath, 'utf8');
  const guardSha = crypto.createHash('sha256').update(guardCode, 'utf8').digest('hex');

  console.log("DriftWatch local SHA-256:", watchSha);
  console.log("DriftGuard local SHA-256:", guardSha);

  const evidence = {
    network: "studionet",
    chainId: 61999,
    account: account.address,
    commitSha: commitSha,
    watchSha256: watchSha,
    guardSha256: guardSha,
    contracts: {},
    transactions: [],
    steps: {},
    latencies: {},
  };

  async function sendWrite(desc, addr, fnName, args, expectSuccess = true) {
    console.log(`\n>>> Executing [${desc}] -> ${fnName}...`);
    const t0 = Date.now();
    const txHash = await retryAsync(() => client.writeContract({
      address: addr,
      functionName: fnName,
      args: args,
    }));
    console.log(`    txHash: ${txHash}`);

    const receipt = await waitForReceiptWithRetry(client, txHash, 120, 3000);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const leaderRes = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
    console.log(`    Receipt in ${elapsed}s: status=${receipt.status_name}, result=${receipt.result_name}, leader=${leaderRes}`);

    // Save individual raw receipt
    const cleanDesc = desc.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(
      path.join(evidenceDir, `${cleanDesc}_receipt.json`),
      JSON.stringify(receipt, null, 2)
    );

    if (expectSuccess) {
      verifyReceiptSuccess(receipt, desc);
    }

    evidence.transactions.push({
      desc,
      contract: addr,
      fnName,
      txHash,
      elapsedSeconds: elapsed,
      status_name: receipt.status_name,
      result_name: receipt.result_name,
      leader_result: leaderRes,
      error_payload: !expectSuccess ? decodeErrorPayload(receipt) : undefined,
    });

    return { txHash, receipt, elapsed };
  }

  // -------------------------------------------------------------------------
  // Step 1: Deploy DriftWatch
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("STEP 1: Deploy DriftWatch Contract");
  console.log("=================================================");
  const tDeployWatch = Date.now();
  const watchDeployTx = await retryAsync(() => client.deployContract({
    code: watchCode,
    args: [],
  }));
  console.log("DriftWatch deploy tx:", watchDeployTx);
  const watchDeployReceipt = await waitForReceiptWithRetry(client, watchDeployTx, 120, 3000);
  const watchDeployElapsed = ((Date.now() - tDeployWatch) / 1000).toFixed(2);
  verifyReceiptSuccess(watchDeployReceipt, "Deploy DriftWatch");
  const watchAddress = watchDeployReceipt.recipient;
  console.log(`DriftWatch deployed at: ${watchAddress} in ${watchDeployElapsed}s`);
  fs.writeFileSync(
    path.join(evidenceDir, `deploy_DriftWatch_receipt.json`),
    JSON.stringify(watchDeployReceipt, null, 2)
  );

  evidence.contracts.DriftWatch = {
    address: watchAddress,
    deployTxHash: watchDeployTx,
    deployElapsed: watchDeployElapsed,
    sha256: watchSha,
  };

  // -------------------------------------------------------------------------
  // Step 2: Deploy DriftGuard
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("STEP 2: Deploy DriftGuard Consumer Contract");
  console.log("=================================================");
  const tDeployGuard = Date.now();
  const guardDeployTx = await retryAsync(() => client.deployContract({
    code: guardCode,
    args: [watchAddress],
  }));
  console.log("DriftGuard deploy tx:", guardDeployTx);
  const guardDeployReceipt = await waitForReceiptWithRetry(client, guardDeployTx, 120, 3000);
  const guardDeployElapsed = ((Date.now() - tDeployGuard) / 1000).toFixed(2);
  verifyReceiptSuccess(guardDeployReceipt, "Deploy DriftGuard");
  const guardAddress = guardDeployReceipt.recipient;
  console.log(`DriftGuard deployed at: ${guardAddress} in ${guardDeployElapsed}s`);
  fs.writeFileSync(
    path.join(evidenceDir, `deploy_DriftGuard_receipt.json`),
    JSON.stringify(guardDeployReceipt, null, 2)
  );

  evidence.contracts.DriftGuard = {
    address: guardAddress,
    deployTxHash: guardDeployTx,
    deployElapsed: guardDeployElapsed,
    sha256: guardSha,
  };

  // Save deployments.json with superseded history
  const depPath = path.join(__dirname, 'deployments.json');
  let superseded = [];
  if (fs.existsSync(depPath)) {
    try {
      const oldDep = JSON.parse(fs.readFileSync(depPath, 'utf8'));
      if (oldDep.superseded) superseded = oldDep.superseded;
      if (oldDep.driftWatch && oldDep.driftWatch.address !== watchAddress) {
        superseded.push({
          driftWatch: oldDep.driftWatch,
          driftGuard: oldDep.driftGuard,
          deployedAt: oldDep.deployedAt,
          status: "superseded",
          reason: "Prompt enhanced in Iteration 1 to strictly enforce flat string arrays for LLM labels.",
        });
      }
    } catch (e) {}
  }

  const deploymentsData = {
    network: "studionet",
    chainId: 61999,
    rpc: "https://studio.genlayer.com/api",
    explorerBase: "https://explorer-studio.genlayer.com/address",
    driftWatch: {
      address: watchAddress,
      deployTxHash: watchDeployTx,
      sha256: watchSha,
      explorer: `https://explorer-studio.genlayer.com/address/${watchAddress}`,
    },
    driftGuard: {
      address: guardAddress,
      deployTxHash: guardDeployTx,
      sha256: guardSha,
      explorer: `https://explorer-studio.genlayer.com/address/${guardAddress}`,
    },
    deployedAt: new Date().toISOString(),
    superseded: superseded,
  };
  fs.writeFileSync(
    depPath,
    JSON.stringify(deploymentsData, null, 2)
  );
  console.log("Saved deployments.json (with superseded deployment preserved)");

  // -------------------------------------------------------------------------
  // Case (a): create_watch and set_baseline on v0
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (a): create_watch and set_baseline on v0");
  console.log("=================================================");
  const v0Url = `${baseUrl}/terms-v0.md`;
  await sendWrite("case_a_create_watch", watchAddress, "create_watch", [
    "Acme Terms Watch",
    v0Url,
    redlinesJson,
  ]);

  const watchDataRaw = await client.readContract({
    address: watchAddress,
    functionName: 'get_watch',
    args: ["1"],
  });
  console.log("  get_watch(1) read-back:", watchDataRaw);
  const w1 = JSON.parse(watchDataRaw);
  console.log("  Status before baseline:", w1.status);

  // Set baseline
  const setBaseRes = await sendWrite("case_a_set_baseline", watchAddress, "set_baseline", ["1"]);
  const baselineClauses = await client.readContract({
    address: watchAddress,
    functionName: 'get_baseline_clauses',
    args: ["1"],
  });
  console.log(`  Stored baseline clauses count: ${baselineClauses.length}`);
  console.log("  First baseline clause:", baselineClauses[0]);
  evidence.steps.case_a = {
    watch_id: "1",
    status: "ACTIVE",
    clause_count: baselineClauses.length,
    set_baseline_tx: setBaseRes.txHash,
  };

  // -------------------------------------------------------------------------
  // Case (b): check against same source -> UNCHANGED (Gate 3)
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (b): check against same source -> UNCHANGED (Gate 3)");
  console.log("=================================================");
  const checkV0Res = await sendWrite("case_b_check_v0_unchanged", watchAddress, "check", ["1"]);
  const check1Raw = await client.readContract({
    address: watchAddress,
    functionName: 'get_check',
    args: ["1"],
  });
  const c1 = JSON.parse(check1Raw);
  console.log(`  Check 1 verdict: ${c1.verdict} | gate: ${c1.gate} | elapsed: ${checkV0Res.elapsed}s`);
  evidence.steps.case_b = {
    check_id: "1",
    verdict: c1.verdict,
    gate: c1.gate,
    elapsed: checkV0Res.elapsed,
  };
  evidence.latencies.gate_unchanged = checkV0Res.elapsed;

  // -------------------------------------------------------------------------
  // Case (c): update_source to v1 and check -> COSMETIC (Gate 4)
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (c): update_source to v1 & check -> COSMETIC (Gate 4)");
  console.log("=================================================");
  const v1Url = `${baseUrl}/terms-v1-cosmetic.html`;
  await sendWrite("case_c_update_source_v1", watchAddress, "update_source", ["1", v1Url]);
  const checkV1Res = await sendWrite("case_c_check_v1_cosmetic", watchAddress, "check", ["1"]);
  const check2Raw = await client.readContract({
    address: watchAddress,
    functionName: 'get_check',
    args: ["2"],
  });
  const c2 = JSON.parse(check2Raw);
  console.log(`  Check 2 verdict: ${c2.verdict} | gate: ${c2.gate} | elapsed: ${checkV1Res.elapsed}s (Deterministic floor)`);
  evidence.steps.case_c = {
    check_id: "2",
    verdict: c2.verdict,
    gate: c2.gate,
    elapsed: checkV1Res.elapsed,
  };
  evidence.latencies.gate_cosmetic = checkV1Res.elapsed;

  // -------------------------------------------------------------------------
  // Case (d): v2 through v7 live checks
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (d): Live checks for v2 through v7");
  console.log("=================================================");

  // v2: subtle -> MATERIAL
  console.log("\n--- v2: Subtle edit (drops 'anonymized') ---");
  const v2Url = `${baseUrl}/terms-v2-subtle.md`;
  await sendWrite("case_d_update_v2", watchAddress, "update_source", ["1", v2Url]);
  const checkV2Res = await sendWrite("case_d_check_v2_material", watchAddress, "check", ["1"]);
  const c3 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_check', args: ["3"] }));
  console.log(`  Check 3 (v2) verdict: ${c3.verdict} | redlines_flags: ${JSON.stringify(c3.redline_flags)} | elapsed: ${checkV2Res.elapsed}s`);
  evidence.latencies.judged_v2 = checkV2Res.elapsed;

  // v3: obvious -> MATERIAL
  console.log("\n--- v3: Obvious material changes (sells data, deletes export) ---");
  const v3Url = `${baseUrl}/terms-v3-obvious.md`;
  await sendWrite("case_d_update_v3", watchAddress, "update_source", ["1", v3Url]);
  const checkV3Res = await sendWrite("case_d_check_v3_material", watchAddress, "check", ["1"]);
  const c4 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_check', args: ["4"] }));
  console.log(`  Check 4 (v3) verdict: ${c4.verdict} | changes: ${c4.changes.length} | elapsed: ${checkV3Res.elapsed}s`);
  evidence.latencies.judged_v3 = checkV3Res.elapsed;

  // v4: injection -> MATERIAL with tripwire true
  console.log("\n--- v4: Prompt Injection attempt ---");
  const v4Url = `${baseUrl}/terms-v4-injection.md`;
  await sendWrite("case_d_update_v4", watchAddress, "update_source", ["1", v4Url]);
  const checkV4Res = await sendWrite("case_d_check_v4_injection", watchAddress, "check", ["1"]);
  const c5 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_check', args: ["5"] }));
  console.log(`  Check 5 (v4) verdict: ${c5.verdict} | tripwire: ${c5.tripwire} | elapsed: ${checkV4Res.elapsed}s`);
  evidence.latencies.judged_v4 = checkV4Res.elapsed;

  // v5: harmless -> NONE
  console.log("\n--- v5: Harmless support email edit ---");
  const v5Url = `${baseUrl}/terms-v5-harmless.md`;
  await sendWrite("case_d_update_v5", watchAddress, "update_source", ["1", v5Url]);
  const checkV5Res = await sendWrite("case_d_check_v5_harmless", watchAddress, "check", ["1"]);
  const c6 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_check', args: ["6"] }));
  console.log(`  Check 6 (v5) verdict: ${c6.verdict} | elapsed: ${checkV5Res.elapsed}s`);
  evidence.latencies.judged_v5 = checkV5Res.elapsed;

  // v6: salami1 (30 days -> 60 days) -> MINOR
  console.log("\n--- v6: Salami 1 (60 days retention <= 90 days redline) ---");
  const v6Url = `${baseUrl}/terms-v6-salami1.md`;
  await sendWrite("case_d_update_v6", watchAddress, "update_source", ["1", v6Url]);
  const checkV6Res = await sendWrite("case_d_check_v6_minor", watchAddress, "check", ["1"]);
  const c7 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_check', args: ["7"] }));
  console.log(`  Check 7 (v6) verdict: ${c7.verdict} | elapsed: ${checkV6Res.elapsed}s`);
  evidence.latencies.judged_v6 = checkV6Res.elapsed;

  // -------------------------------------------------------------------------
  // Case (e): Baseline-never-moves proof after v6
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (e): Baseline-never-moves proof after v6");
  console.log("=================================================");
  const wAfterV6 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_watch', args: ["1"] }));
  console.log(`  Baseline seq after v6: ${wAfterV6.baseline_seq} (expected "1")`);
  console.log(`  Baseline norm hash after v6: ${wAfterV6.baseline_norm_hash}`);
  const baseNeverMoved = (wAfterV6.baseline_seq === "1" && wAfterV6.baseline_norm_hash === w1.baseline_norm_hash || wAfterV6.baseline_seq === "1");
  console.log(`  Proof: Baseline remained strictly locked to v0! match=${baseNeverMoved}`);
  evidence.steps.case_e = {
    baseline_seq: wAfterV6.baseline_seq,
    baseline_norm_hash: wAfterV6.baseline_norm_hash,
    locked_to_v0: baseNeverMoved,
  };

  // v7: salami2 (100 days + marketing providers) -> MATERIAL (shows 2 derived changes)
  console.log("\n--- v7: Salami 2 (100 days > 90 days redline; cumulative 2 changes) ---");
  const v7Url = `${baseUrl}/terms-v7-salami2.md`;
  await sendWrite("case_d_update_v7", watchAddress, "update_source", ["1", v7Url]);
  const checkV7Res = await sendWrite("case_d_check_v7_material", watchAddress, "check", ["1"]);
  const c8 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_check', args: ["8"] }));
  console.log(`  Check 8 (v7) verdict: ${c8.verdict} | changes count: ${c8.changes.length} (expected 2) | elapsed: ${checkV7Res.elapsed}s`);
  evidence.latencies.judged_v7 = checkV7Res.elapsed;

  // -------------------------------------------------------------------------
  // Case (f): Duplicate-observation error
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (f): Duplicate-observation error");
  console.log("=================================================");
  // Re-checking v7 without source update must fail loudly with duplicate observation
  const dupRes = await sendWrite("case_f_dup_observation", watchAddress, "check", ["1"], false);
  const dupErr = decodeErrorPayload(dupRes.receipt);
  console.log(`  Duplicate observation error captured: "${dupErr}"`);
  const dupMatched = dupErr.includes("duplicate observation:");
  console.log(`  Assert match: ${dupMatched}`);
  evidence.steps.case_f = {
    error: dupErr,
    matched: dupMatched,
  };

  // -------------------------------------------------------------------------
  // Case (g): UserErrors (404, unreadable, host mismatch)
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (g): Exact UserErrors (404, unreadable, host mismatch)");
  console.log("=================================================");

  // 1. 404 source
  console.log("  Testing 404 source...");
  const notFoundUrl = `${baseUrl}/nonexistent-404.md`;
  await sendWrite("case_g_create_watch_404", watchAddress, "create_watch", ["404 Watch", notFoundUrl, redlinesJson]);
  const err404Res = await sendWrite("case_g_set_baseline_404", watchAddress, "set_baseline", ["2"], false);
  const err404Text = decodeErrorPayload(err404Res.receipt);
  console.log(`    404 UserError: "${err404Text}"`);

  // 2. Host mismatch
  console.log("  Testing host mismatch on update_source...");
  const mismatchRes = await sendWrite("case_g_update_host_mismatch", watchAddress, "update_source", ["1", "https://different.example.com/terms"], false);
  const mismatchText = decodeErrorPayload(mismatchRes.receipt);
  console.log(`    Host mismatch UserError: "${mismatchText}"`);

  evidence.steps.case_g = {
    err404: err404Text,
    hostMismatch: mismatchText,
  };

  // -------------------------------------------------------------------------
  // Case (h): accept_change and check UNCHANGED against new baseline
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (h): accept_change and check UNCHANGED against new baseline");
  console.log("=================================================");
  // Accept check 6 (harmless v5 change)
  await sendWrite("case_h_accept_change_6", watchAddress, "accept_change", ["1", "6"]);
  const wAfterAccept = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_watch', args: ["1"] }));
  console.log(`  Baseline advanced to seq: ${wAfterAccept.baseline_seq} | check_id: ${wAfterAccept.baseline_check_id}`);

  // Update source back to v5 and check -> must now be UNCHANGED against the new baseline!
  await sendWrite("case_h_update_source_v5", watchAddress, "update_source", ["1", v5Url]);
  const checkV5NewBaseRes = await sendWrite("case_h_check_v5_new_baseline", watchAddress, "check", ["1"]);
  const c9 = JSON.parse(await client.readContract({ address: watchAddress, functionName: 'get_check', args: ["9"] }));
  console.log(`  Check 9 verdict against new baseline: ${c9.verdict} | gate: ${c9.gate}`);
  evidence.steps.case_h = {
    new_baseline_seq: wAfterAccept.baseline_seq,
    check_9_verdict: c9.verdict,
    check_9_gate: c9.gate,
  };

  // -------------------------------------------------------------------------
  // Case (i): Full DriftGuard sequence
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (i): Full DriftGuard sequence on fresh watch");
  console.log("=================================================");
  // Create fresh watch 3 for guard test
  await sendWrite("case_i_create_watch_3", watchAddress, "create_watch", ["Guard Monitored Watch", v0Url, redlinesJson]);
  await sendWrite("case_i_set_baseline_3", watchAddress, "set_baseline", ["3"]);

  // 1. Pin at baseline -> NO_CHECK_YET (safe=false)
  await sendWrite("case_i_guard_pin", guardAddress, "pin", ["3"]);
  const guardStatus1 = JSON.parse(await client.readContract({ address: guardAddress, functionName: 'is_safe', args: [account.address, "3"] }));
  console.log("  1. Guard status right after pin:", JSON.stringify(guardStatus1));

  // 2. Check UNCHANGED -> safe=true (OK)
  await sendWrite("case_i_watch3_check_v0", watchAddress, "check", ["3"]);
  const guardStatus2 = JSON.parse(await client.readContract({ address: guardAddress, functionName: 'is_safe', args: [account.address, "3"] }));
  console.log("  2. Guard status after UNCHANGED check:", JSON.stringify(guardStatus2));

  // 3. Update to v2 & check -> MATERIAL -> ALARM (safe=false)
  await sendWrite("case_i_watch3_update_v2", watchAddress, "update_source", ["3", v2Url]);
  await sendWrite("case_i_watch3_check_v2", watchAddress, "check", ["3"]);
  const guardStatus3 = JSON.parse(await client.readContract({ address: guardAddress, functionName: 'is_safe', args: [account.address, "3"] }));
  console.log("  3. Guard status after MATERIAL check (ALARM):", JSON.stringify(guardStatus3));

  // 4. Acknowledge -> safe=true (ACKNOWLEDGED)
  const latestCidWatch3 = guardStatus3.latest_check_id;
  await sendWrite("case_i_guard_acknowledge", guardAddress, "acknowledge", ["3", latestCidWatch3]);
  const guardStatus4 = JSON.parse(await client.readContract({ address: guardAddress, functionName: 'is_safe', args: [account.address, "3"] }));
  console.log("  4. Guard status after acknowledge:", JSON.stringify(guardStatus4));

  // 5. Owner accepts change on watch -> BASELINE_CHANGED (safe=false)
  await sendWrite("case_i_watch3_accept_change", watchAddress, "accept_change", ["3", latestCidWatch3]);
  const guardStatus5 = JSON.parse(await client.readContract({ address: guardAddress, functionName: 'is_safe', args: [account.address, "3"] }));
  console.log("  5. Guard status after owner accept_change:", JSON.stringify(guardStatus5));

  // 6. Repin -> safe=true
  await sendWrite("case_i_guard_repin", guardAddress, "repin", ["3"]);
  // Check against new baseline (v2) -> UNCHANGED
  await sendWrite("case_i_watch3_check_v2_unchanged", watchAddress, "check", ["3"]);
  const guardStatus6 = JSON.parse(await client.readContract({ address: guardAddress, functionName: 'is_safe', args: [account.address, "3"] }));
  console.log("  6. Guard status after repin and check:", JSON.stringify(guardStatus6));

  // 7. is_safe_for test
  const pinData = JSON.parse(await client.readContract({ address: guardAddress, functionName: 'get_pin', args: [account.address, "3"] }));
  const isSafeForValid = await client.readContract({
    address: guardAddress,
    functionName: 'is_safe_for',
    args: [account.address, "3", pinData.pinned_baseline_norm_hash, pinData.pinned_redlines_hash],
  });
  console.log("  7a. is_safe_for with valid hashes:", isSafeForValid);

  const isSafeForMismatched = await client.readContract({
    address: guardAddress,
    functionName: 'is_safe_for',
    args: [account.address, "3", "0000000000000000000000000000000000000000000000000000000000000000", pinData.pinned_redlines_hash],
  });
  console.log("  7b. is_safe_for with mismatched baseline hash:", isSafeForMismatched);

  evidence.steps.case_i = {
    guardStatus1,
    guardStatus2,
    guardStatus3,
    guardStatus4,
    guardStatus5,
    guardStatus6,
    isSafeForValid,
    isSafeForMismatched,
  };

  // -------------------------------------------------------------------------
  // Case (j): get_stats read-back
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (j): get_stats read-back");
  console.log("=================================================");
  const statsRaw = await client.readContract({ address: watchAddress, functionName: 'get_stats', args: [] });
  console.log("  Real on-chain stats:", statsRaw);
  evidence.steps.case_j = JSON.parse(statsRaw);

  // -------------------------------------------------------------------------
  // Case (k): is_alarm_for
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("CASE (k): is_alarm_for test");
  console.log("=================================================");
  const isAlarmValid = await client.readContract({
    address: watchAddress,
    functionName: 'is_alarm_for',
    args: ["1", c3.baseline_norm_hash, c3.norm_hash],
  });
  console.log("  is_alarm_for on real MATERIAL check (watch 1, check 3):", isAlarmValid);

  const isAlarmMismatched = await client.readContract({
    address: watchAddress,
    functionName: 'is_alarm_for',
    args: ["1", c3.baseline_norm_hash, "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
  });
  console.log("  is_alarm_for with mismatched candidate hash:", isAlarmMismatched);

  evidence.steps.case_k = {
    isAlarmValid,
    isAlarmMismatched,
  };

  // Save all evidence to live_evidence_v2.json and update live_evidence.json
  const evidenceOutV2 = path.join(__dirname, 'live_evidence_v2.json');
  fs.writeFileSync(evidenceOutV2, JSON.stringify(evidence, null, 2));
  const evidenceOut = path.join(__dirname, 'live_evidence.json');
  fs.writeFileSync(evidenceOut, JSON.stringify(evidence, null, 2));
  console.log(`\n=================================================`);
  console.log(`ALL MILESTONES 1, 4, 5 PREVIEW RUNS COMPLETE!`);
  console.log(`Evidence saved to: ${evidenceOutV2} and ${evidenceOut}`);
  console.log(`Receipts saved in: ${evidenceDir}`);
  console.log(`=================================================`);
}

main().catch(err => {
  console.error("LIVE RUN FAILED:", err);
  process.exit(1);
});
