// Aides communes aux routes API : garde de session, réponses d'erreur.
import "server-only";
import { NextResponse } from "next/server";
import { isLoggedIn } from "./session";
import { ShopifyError } from "./shopify";
import { claudeErrorMessage } from "./claude";

export const err = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status });

export async function guard(): Promise<NextResponse | null> {
  return (await isLoggedIn()) ? null : err("Connexion requise", 401);
}

export function fail(e: unknown): NextResponse {
  if (e instanceof ShopifyError) return err(e.message, e.status, e.retryAfter ? { retryAfter: e.retryAfter } : {});
  const c = claudeErrorMessage(e);
  console.error(e);
  return err(c.message, c.status);
}
