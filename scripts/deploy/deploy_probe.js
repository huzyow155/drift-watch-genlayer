const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  console.log("=================================================");
  console.log("DRIFT WATCH: MILESTONE 0 RUNTIME PROBE");
  console.log("=================================================");

  const account = createAccount();
  console.log("Generated throwaway account:", account.address);

  const client = createClient({
    chain: chains.studionet,
    account: account,
  });

  const probePath = path.join(__dirname, '../../contracts/Probe.py');
  const code = fs.readFileSync(probePath, 'utf8');
  const codeSha = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
  console.log("Probe source sha256:", codeSha);

  console.log("\n1. Deploying Probe contract to Studionet (Chain 61999)...");
  const t0 = Date.now();
  const deployTxHash = await client.deployContract({
    code: code,
    args: [],
  });
  console.log("Deploy tx submitted. Hash:", deployTxHash);

  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTxHash,
    retries: 120,
    interval: 3000,
  });
  const deployLatency = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Deploy receipt received in ${deployLatency}s:`);
  console.log("  status_name:", deployReceipt.status_name);
  console.log("  result_name:", deployReceipt.result_name);
  const leaderRes = deployReceipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  console.log("  leader execution_result:", leaderRes);

  const contractAddress = deployReceipt.recipient;
  console.log("Probe contract deployed address:", contractAddress);

  if (!contractAddress || leaderRes !== 'SUCCESS') {
    throw new Error("Probe contract deployment failed: " + JSON.stringify(deployReceipt));
  }

  const results = {
    contractAddress,
    deployTxHash,
    deployLatency,
    codeSha256: codeSha,
    sender: account.address,
    views: {},
    transactions: [],
  };

  // Record deploy transaction
  results.transactions.push({
    action: "deploy_probe",
    txHash: deployTxHash,
    status_name: deployReceipt.status_name,
    result_name: deployReceipt.result_name,
    leader_result: leaderRes,
    latency_seconds: deployLatency,
  });

  // 2. Test views
  console.log("\n2. Testing contract views (sender, bool, str, list)...");
  const senderView = await client.readContract({
    address: contractAddress,
    functionName: 'get_sender',
    args: [],
  });
  console.log("  get_sender returned:", senderView);

  const boolView = await client.readContract({
    address: contractAddress,
    functionName: 'probe_bool',
    args: [],
  });
  console.log("  probe_bool returned:", boolView);

  const strView = await client.readContract({
    address: contractAddress,
    functionName: 'probe_str',
    args: [],
  });
  console.log("  probe_str returned:", strView);

  const listView = await client.readContract({
    address: contractAddress,
    functionName: 'probe_list',
    args: [],
  });
  console.log("  probe_list returned:", JSON.stringify(listView));

  results.views = {
    senderView,
    boolView,
    strView,
    listView,
  };

  // Helper for writes
  async function runWrite(actionName, fnName, args) {
    console.log(`\nExecuting ${actionName} (${fnName})...`);
    const tw0 = Date.now();
    const txHash = await client.writeContract({
      address: contractAddress,
      functionName: fnName,
      args: args,
    });
    console.log(`  tx submitted: ${txHash}`);
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      retries: 120,
      interval: 3000,
    });
    const latency = ((Date.now() - tw0) / 1000).toFixed(2);
    const lRes = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
    console.log(`  finished in ${latency}s | status: ${receipt.status_name} | result: ${receipt.result_name} | leader: ${lRes}`);
    
    results.transactions.push({
      action: actionName,
      txHash,
      latency_seconds: latency,
      status_name: receipt.status_name,
      result_name: receipt.result_name,
      leader_result: lRes,
      votes: receipt.consensus_data?.votes,
    });
    return receipt;
  }

  // 3. Test imports and ~60 KB storage payload
  console.log("\n3. Testing imports, stdlib, and 60 KB string storage...");
  const largePayload = "X".repeat(60000);
  await runWrite("imports_and_storage", "probe_imports_and_storage", [largePayload]);
  const envInfo = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['env_info'],
  });
  console.log("  env_info read back:", envInfo);
  results.envInfo = JSON.parse(envInfo);

  // 4. Test web.get against commit-pinned raw github markdown
  const fixtureSha = "c8ff0f0cf8b5e406a44baad04867cb793c52d328";
  const rawMdUrl = `https://raw.githubusercontent.com/huzyow155/drift-watch-fixtures/${fixtureSha}/terms-v0.md`;
  console.log("\n4. Testing web.get on commit-pinned raw markdown:", rawMdUrl);
  await runWrite("web_fetch_md", "probe_web_fetch", [rawMdUrl, "md_result"]);
  const mdResult = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['md_result'],
  });
  console.log("  md_result read back:", mdResult);
  results.mdResult = JSON.parse(mdResult);

  // 5. Test web.get against commit-pinned raw github HTML
  const rawHtmlUrl = `https://raw.githubusercontent.com/huzyow155/drift-watch-fixtures/${fixtureSha}/terms-v1-cosmetic.html`;
  console.log("\n5. Testing web.get on commit-pinned raw HTML:", rawHtmlUrl);
  await runWrite("web_fetch_html", "probe_web_fetch", [rawHtmlUrl, "html_result"]);
  const htmlResult = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['html_result'],
  });
  console.log("  html_result read back:", htmlResult);
  results.htmlResult = JSON.parse(htmlResult);

  // 6. Test web.get against 404 URL
  const notFoundUrl = `https://raw.githubusercontent.com/huzyow155/drift-watch-fixtures/${fixtureSha}/nonexistent-404.md`;
  console.log("\n6. Testing web.get on 404 URL:", notFoundUrl);
  await runWrite("web_fetch_404", "probe_web_fetch", [notFoundUrl, "not_found_result"]);
  const notFoundResult = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['not_found_result'],
  });
  console.log("  not_found_result read back:", notFoundResult);
  results.notFoundResult = JSON.parse(notFoundResult);

  // 7. Test byte stability across 5 fetches
  console.log("\n7. Testing byte stability across 5 fetches of raw markdown...");
  await runWrite("byte_stability_5", "probe_byte_stability", [rawMdUrl, 5]);
  const stabilityResult = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['byte_stability'],
  });
  console.log("  stability read back:", stabilityResult);
  results.stabilityResult = JSON.parse(stabilityResult);

  // 8. Test large public site
  const publicSiteUrl = "https://example.com";
  console.log("\n8. Testing web.get on public site:", publicSiteUrl);
  await runWrite("web_fetch_public", "probe_web_fetch", [publicSiteUrl, "public_result"]);
  const publicResult = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['public_result'],
  });
  console.log("  public_result read back:", publicResult);
  results.publicResult = JSON.parse(publicResult);

  // 9. Test LLM exec_prompt
  console.log("\n9. Testing exec_prompt with prompt size 20...");
  await runWrite("exec_prompt_20", "probe_exec_prompt", [20]);
  const promptResult = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['prompt_20'],
  });
  console.log("  exec_prompt read back:", promptResult);
  results.promptResult = promptResult;

  // Save probe findings
  const outPath = path.join(__dirname, 'probe_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nProbe results saved successfully to ${outPath}`);
}

main().catch(err => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
