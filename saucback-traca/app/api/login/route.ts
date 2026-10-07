import { NextResponse } from "next/server";
import { checkPin, COOKIE, makeToken } from "@/src/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const pin = String(body.pin ?? "").replace(/\D/g, "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const r = checkPin(pin, ip);
  if (!r.ok) {
    const msg = r.blockedMinutes ? `Trop d'essais : réessaie dans ${r.blockedMinutes} min` : `Code incorrect (${r.left} essai${r.left === 1 ? "" : "s"} restant${r.left === 1 ? "" : "s"})`;
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 30 * 24 * 3600, path: "/" });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
