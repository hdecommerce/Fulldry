import { NextResponse } from "next/server";
import { fail, guard } from "@/src/api";
import { tracedOrders } from "@/src/shopify";
import { parseBlock, searchLot } from "@/src/traca";

export const dynamic = "force-dynamic";

/** GET /api/registry?q=lot-ou-commande → colis tracés (lus depuis les notes Shopify). */
export async function GET(req: Request) {
  const g = await guard(); if (g) return g;
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    const all = (await tracedOrders()).map((o) => ({ ...o, block: parseBlock(o.note) })).filter((x) => x.block);
    const hl = searchLot(q), num = q.replace(/^#/, "");
    const items = q
      ? all.filter((x) => x.name.replace(/^#/, "") === num || (hl && x.block!.items.some((i) => searchLot(i.lot).includes(hl))))
      : all.slice(0, 40);
    return NextResponse.json({
      query: q, total: all.length,
      items: items.map((x) => ({ id: x.id, name: x.name, canal: x.canal, client: x.client, createdAt: x.createdAt, forced: x.block!.forced, prepare: x.block!.prepare, items: x.block!.items })),
    });
  } catch (e) { return fail(e); }
}
