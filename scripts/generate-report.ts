import path from "node:path";
import { writeReport } from "../src/lib/analysis/report";

const outPath = path.join(process.cwd(), "reports", "meta-ads-analysis.md");
await writeReport(outPath);
console.log(`Relatório gerado em ${outPath}`);
