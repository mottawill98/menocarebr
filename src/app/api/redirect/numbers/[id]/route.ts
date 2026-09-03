import { NextRequest, NextResponse } from "next/server";
import { deleteNumber, updateNumber } from "@/lib/redirect/store";

export async function PATCH(request: NextRequest, { params }: RouteContext<"/api/redirect/numbers/[id]">) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const patch: { label?: string; phone?: string; message?: string; active?: boolean } = {};
  if (typeof body.label === "string") patch.label = body.label;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (typeof body.message === "string") patch.message = body.message;
  if (typeof body.active === "boolean") patch.active = body.active;

  const number = await updateNumber(id, patch);
  if (!number) return NextResponse.json({ error: "Número não encontrado." }, { status: 404 });
  return NextResponse.json({ number });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext<"/api/redirect/numbers/[id]">) {
  const { id } = await params;
  const ok = await deleteNumber(id);
  if (!ok) return NextResponse.json({ error: "Número não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
