import { NextRequest, NextResponse } from "next/server";
import { createNumber, listNumbers } from "@/lib/redirect/store";

export async function GET() {
  return NextResponse.json({ numbers: await listNumbers() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const message = typeof body?.message === "string" ? body.message : "";

  if (!phone) {
    return NextResponse.json({ error: "Informe um número de WhatsApp válido." }, { status: 400 });
  }
  if (phone.length < 10) {
    return NextResponse.json(
      { error: "Número inválido — inclua o código do país (ex: 55) e o DDD." },
      { status: 400 }
    );
  }

  const number = await createNumber({ label, phone, message });
  return NextResponse.json({ number }, { status: 201 });
}
