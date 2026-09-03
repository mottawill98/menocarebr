import { NextRequest, NextResponse } from "next/server";
import { getConfigMasked, saveConfig } from "@/lib/redirect/store";

export async function GET() {
  return NextResponse.json({ config: await getConfigMasked() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const patch: {
    pixelId?: string;
    pixelToken?: string;
    eventName?: string;
    testEventCode?: string;
    defaultMessage?: string;
  } = {};
  if (typeof body.pixelId === "string") patch.pixelId = body.pixelId.trim();
  // Só sobrescreve o token se um novo valor de fato foi enviado — o campo
  // mascarado ("••••••••") retornado pelo GET nunca deve ser regravado.
  if (typeof body.pixelToken === "string" && body.pixelToken.trim() && !/^•+$/.test(body.pixelToken.trim())) {
    patch.pixelToken = body.pixelToken.trim();
  }
  if (typeof body.eventName === "string") patch.eventName = body.eventName.trim();
  if (typeof body.testEventCode === "string") patch.testEventCode = body.testEventCode.trim();
  if (typeof body.defaultMessage === "string") patch.defaultMessage = body.defaultMessage.trim();

  const config = await saveConfig(patch);
  return NextResponse.json({ config: { ...config, pixelToken: config.pixelToken ? "•".repeat(12) : "", hasToken: !!config.pixelToken } });
}
