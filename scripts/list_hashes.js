const fs = require('fs');
const path = require('path');

function getReceiptFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getReceiptFiles(filePath));
    } else if (file.endsWith('_receipt.json')) {
      results.push(filePath);
    }
  }
  return results;
}

function parseReceipt(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const relPath = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
    const txHash = data.hash || data.transaction_hash || 'N/A';
    const status = data.status_name || (data.status === 5 ? 'ACCEPTED' : String(data.status));
    const result = data.result_name || (data.result === 6 ? 'MAJORITY_AGREE' : String(data.result));
    const leaderModel = data.consensus_data?.leader_receipt?.[0]?.node_config?.primary_model?.model || 'N/A';
    const leaderExec = data.consensus_data?.leader_receipt?.[0]?.execution_result || 'N/A';
    return {
      file: relPath,
      hash: txHash,
      status: status,
      result: result,
      leaderExec: leaderExec,
      leaderModel: leaderModel,
    };
  } catch (err) {
    return {
      file: filePath,
      hash: 'ERROR',
      status: 'ERROR',
      result: 'ERROR',
      leaderExec: 'ERROR',
      leaderModel: err.message,
    };
  }
}

function main() {
  const dirs = [
    path.join(__dirname, '../docs/evidence'),
    path.join(__dirname, '../docs/evidence_v2'),
  ];

  let allFiles = [];
  for (const d of dirs) {
    allFiles = allFiles.concat(getReceiptFiles(d));
  }

  const receipts = allFiles.map(parseReceipt);

  // Print table
  console.log('| File | Tx Hash | Status | Result | Leader Exec | Leader Model |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const r of receipts) {
    console.log(`| \`${r.file}\` | \`${r.hash}\` | \`${r.status}\` | \`${r.result}\` | \`${r.leaderExec}\` | \`${r.leaderModel}\` |`);
  }
}

main();
