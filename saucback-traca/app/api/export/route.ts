import { fail, guard } from "@/src/api";
import { tracedOrders } from "@/src/shopify";
import { csvFilename, csvRegistre, parseBlock } from "@/src/traca";

export const dynamic = "force-dynamic";

/** GET /api/export → CSV du registre complet (séparateur ; BOM UTF-8). */
export async function GET() {
  const g = await guard(); if (g) return g;
  try {
    const rows = (await tracedOrders())
      .map((o) => ({ o, b: parseBlock(o.note) }))
      .filter((x) => x.b)
      .map((x) => ({ prepare: x.b!.prepare, commande: x.o.name.replace(/^#/, ""), canal: x.o.canal, forced: x.b!.forced, items: x.b!.items }));
    return new Response(csvRegistre(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${csvFilename()}"` },
    });
  } catch (e) { return fail(e); }
}
