// Accès par code PIN : vérifié côté serveur, 5 essais puis blocage 15 min,
// cookie de session signé (HMAC) httpOnly valable 30 jours.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE = "traca_session";
const DAYS_30 = 30 * 24 * 3600;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET manquant (16 caractères minimum)");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function makeToken(now = Date.now()): string {
  const payload = String(now + DAYS_30 * 1000);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(payload) > now;
}

export async function isLoggedIn(): Promise<boolean> {
  const c = await cookies();
  return verifyToken(c.get(COOKIE)?.value);
}

// Anti-brute-force en mémoire (une instance serveur ; suffisant pour une tablette).
const attempts = new Map<string, { n: number; until: number }>();

export function checkPin(pin: string, ip: string, now = Date.now()): { ok: boolean; blockedMinutes?: number; left?: number } {
  const a = attempts.get(ip) ?? { n: 0, until: 0 };
  if (a.until > now) return { ok: false, blockedMinutes: Math.ceil((a.until - now) / 60000) };
  const expected = process.env.APP_PIN ?? "";
  const ok = expected.length >= 4 && pin.length === expected.length && timingSafeEqual(Buffer.from(pin), Buffer.from(expected));
  if (ok) { attempts.delete(ip); return { ok: true }; }
  a.n += 1;
  if (a.n >= 5) { a.n = 0; a.until = now + 15 * 60000; attempts.set(ip, a); return { ok: false, blockedMinutes: 15 }; }
  attempts.set(ip, a);
  return { ok: false, left: 5 - a.n };
}
