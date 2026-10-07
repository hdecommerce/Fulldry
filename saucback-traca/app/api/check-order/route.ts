import { NextResponse } from "next/server";
import { z } from "zod";
import { err, fail, guard } from "@/src/api";
import { checkOrder } from "@/src/claude";
import { evalCheck } from "@/src/traca";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  lines: z.array(z.object({ title: z.string(), quantity: z.number().int().min(1), sku: z.string().nullable(), variantTitle: z.string().nullable(), fiche: z.string().optional() })).min(1),
  labels: z.array(z.object({ produit: z.string().min(1), lot: z.string(), qte: z.number().int().min(1) })).min(1).max(60),
});

/** POST /api/check-order → résultat recalculé côté serveur depuis les indices de l'IA. */
export async function POST(req: Request) {
  const g = await guard(); if (g) return g;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Requête invalide");
  try {
    const ia = await checkOrder(p.data.lines, p.data.labels);
    return NextResponse.json(evalCheck(ia, p.data.lines, p.data.labels));
  } catch (e) { return fail(e); }
}
