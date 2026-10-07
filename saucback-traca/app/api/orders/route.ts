import { NextResponse } from "next/server";
import { fail, guard } from "@/src/api";
import { openOrders, orderState } from "@/src/shopify";

export const dynamic = "force-dynamic";

/** GET /api/orders → commandes à préparer ; GET /api/orders?id=gid → état d'une commande. */
export async function GET(req: Request) {
  const g = await guard(); if (g) return g;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) return NextResponse.json({ order: await orderState(id) });
    return NextResponse.json({ orders: await openOrders() });
  } catch (e) { return fail(e); }
}
