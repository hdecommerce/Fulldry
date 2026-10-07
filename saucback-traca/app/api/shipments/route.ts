import { NextResponse } from "next/server";
import { z } from "zod";
import { err, fail, guard } from "@/src/api";
import { addTags, orderState, removeTags, setNote } from "@/src/shopify";
import { buildBlock, lineIssues, mergeNote, stripBlock, TAG_FORCE, TAG_OK } from "@/src/traca";

export const dynamic = "force-dynamic";

const Body = z.object({
  orderId: z.string().startsWith("gid://shopify/Order/"),
  forced: z.boolean(),
  lines: z.array(z.object({
    produit: z.string().min(1), lot: z.string().min(1), date: z.string().min(1),
    typeDate: z.enum(["DLC", "DDM"]), qte: z.number().int().min(1), doute: z.boolean().optional(),
  })).min(1).max(60),
});

/** POST /api/shipments → écrit le bloc dans la note et pose le tag. */
export async function POST(req: Request) {
  const g = await guard(); if (g) return g;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Requête invalide : " + p.error.issues[0]?.message);
  const { orderId, forced, lines } = p.data;
  // Jamais de validation avec une ligne bloquante, même forcée (date dépassée, lot manquant…).
  const bad = lines.map((l) => lineIssues({ ...l, doute: false }).filter((x) => x[0] === "bad")).flat();
  if (bad.length) return err("Ligne bloquante : " + bad[0][1], 422);
  try {
    const cur = await orderState(orderId);
    if (!cur) return err("Commande introuvable dans Shopify", 404);
    if (cur.cancelledAt) return err("La commande a été annulée dans Shopify : ne pas expédier", 409);
    if (cur.displayFulfillmentStatus === "FULFILLED") return err("La commande est déjà marquée expédiée dans Shopify", 409);
    const block = buildBlock(lines, forced);
    await setNote(orderId, mergeNote(cur.note, block));
    const tag = forced ? TAG_FORCE : TAG_OK;
    let tagWarning = "";
    try {
      await removeTags(orderId, [forced ? TAG_OK : TAG_FORCE]).catch(() => {});
      await addTags(orderId, [tag]);
    } catch (e) { tagWarning = e instanceof Error ? e.message : "tag non posé"; }
    return NextResponse.json({ ok: true, name: cur.name, tag, block, tagWarning });
  } catch (e) { return fail(e); }
}

/** DELETE /api/shipments?id=gid → retire le bloc et les tags (annulation). */
export async function DELETE(req: Request) {
  const g = await guard(); if (g) return g;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id.startsWith("gid://shopify/Order/")) return err("Commande invalide");
  try {
    const cur = await orderState(id);
    if (!cur) return err("Commande introuvable", 404);
    await setNote(id, stripBlock(cur.note));
    await removeTags(id, [TAG_OK, TAG_FORCE]);
    return NextResponse.json({ ok: true, name: cur.name });
  } catch (e) { return fail(e); }
}
