/**
 * Gera a página única e autocontida (HTML com os dados embutidos) para
 * publicar/compartilhar: data/leads-roi/share.html.
 * Rode antes: scripts/build-leads-roi.ts (gera o agregado, sem dados pessoais).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataFile = path.join(root, "data", "leads-roi", "aggregated.json");
const template = fs.readFileSync(path.join(root, "scripts", "share-page.template.html"), "utf8");
const out = process.argv[2] ?? path.join(root, "data", "leads-roi", "share.html");

// Dentro de <script> o JSON não pode conter "<" (ex.: "</script>") nem separadores de linha Unicode.
const json = JSON.stringify(JSON.parse(fs.readFileSync(dataFile, "utf8")))
  .split("<")
  .join("\\u003c")
  .split(String.fromCharCode(0x2028))
  .join("\\u2028")
  .split(String.fromCharCode(0x2029))
  .join("\\u2029");

const planFile = path.join(root, "data", "leads-roi", "plan.json");
if (!fs.existsSync(planFile)) throw new Error("Falta data/leads-roi/plan.json: rode scripts/build-campaign-plan.ts antes.");
const planJson = JSON.stringify(JSON.parse(fs.readFileSync(planFile, "utf8"))).split("<").join("\\u003c");
const accountFile = path.join(root, "data", "account-analysis", "analysis.json");
if (!fs.existsSync(accountFile)) throw new Error("Falta data/account-analysis/analysis.json: rode scripts/build-account-analysis.ts antes.");
const accountJson = JSON.stringify(JSON.parse(fs.readFileSync(accountFile, "utf8"))).split("<").join("\\u003c");
const accountCss = fs.readFileSync(path.join(root, "scripts", "account-view.css"), "utf8");
const accountJs = fs.readFileSync(path.join(root, "scripts", "account-view.js"), "utf8");
const planCss = fs.readFileSync(path.join(root, "scripts", "plan-view.css"), "utf8");
const planJs = fs.readFileSync(path.join(root, "scripts", "plan-view.js"), "utf8");

fs.writeFileSync(
  out,
  template
    .replace("/*__ACCOUNT_CSS__*/", () => accountCss)
    .replace("/*__ACCOUNT_JS__*/", () => accountJs)
    .replace("/*__ACCOUNT__*/", () => accountJson)
    .replace("/*__PLAN_CSS__*/", () => planCss)
    .replace("/*__PLAN_JS__*/", () => planJs)
    .replace("/*__PLAN__*/", () => planJson)
    .replace("/*__DATA__*/", () => json),
);
console.log(`OK → ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
