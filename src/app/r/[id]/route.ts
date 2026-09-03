import { NextRequest, NextResponse, after } from "next/server";
import { notFound } from "next/navigation";
import { getNumber, getConfig } from "@/lib/redirect/store";
import { sendCapiEvent, buildFbc } from "@/lib/redirect/capi";

/**
 * Redirect público para WhatsApp. Prioridade máxima de velocidade: responde
 * o 302 imediatamente, sem renderizar HTML nem esperar nenhum script no
 * navegador. O evento do pixel é enviado ao Conversions API server-side em
 * segundo plano (via `after`) depois que o redirect já foi enviado ao
 * usuário — captura o evento sem atrasar a navegação em nada.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/r/[id]">) {
  const { id } = await params;
  const number = await getNumber(id);
  if (!number || !number.active) {
    notFound();
  }

  const waUrl = new URL(`https://wa.me/${number.phone}`);
  if (number.message) waUrl.searchParams.set("text", number.message);

  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  const fbp = request.cookies.get("_fbp")?.value;
  const fbclid = request.nextUrl.searchParams.get("fbclid") || undefined;
  const fbc = buildFbc(fbclid, request.cookies.get("_fbc")?.value);
  const config = await getConfig();
  const eventSourceUrl = request.url;

  after(() => {
    sendCapiEvent({ config, eventSourceUrl, clientIp, userAgent, fbp, fbc, contentName: number.label });
  });

  return NextResponse.redirect(waUrl.toString(), { status: 302 });
}
