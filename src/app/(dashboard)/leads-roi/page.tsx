import { getLeadsRoiData } from "@/lib/leads-roi";
import { LeadsRoiTable } from "@/components/LeadsRoiTable";

export const dynamic = "force-dynamic";

export default async function LeadsRoiPage() {
  const data = await getLeadsRoiData();

  if (!data) {
    return (
      <div className="space-y-2 text-sm text-ink-muted">
        <p>Os dados das planilhas ainda não foram processados.</p>
        <p>
          Rode no terminal:{" "}
          <code className="rounded bg-surface px-1.5 py-0.5 text-ink">node_modules/.bin/tsx scripts/build-leads-roi.ts</code>
        </p>
      </div>
    );
  }

  return <LeadsRoiTable data={data} />;
}
