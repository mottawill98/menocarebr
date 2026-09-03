import { processAccount } from "../src/lib/analysis/process";
import { getCampaigns } from "../src/lib/data";
import { AD_ACCOUNT_ID } from "../src/lib/config";

const accountId = process.argv[2] ?? AD_ACCOUNT_ID;

const overview = await processAccount(accountId);
console.log(JSON.stringify(overview.windows.d7, null, 2));

const campaigns = await getCampaigns();
const counts: Record<string, number> = {};
let alertCount = 0;
for (const c of campaigns) {
  const rec = c.recommendations.d7;
  counts[rec.action] = (counts[rec.action] ?? 0) + 1;
  alertCount += rec.alerts.length;
}
console.log("Alertas (d7):", alertCount);
console.log("Recomendações (d7):", counts);
