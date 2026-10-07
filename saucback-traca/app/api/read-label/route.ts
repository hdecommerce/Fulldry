import { NextResponse } from "next/server";
import { err, fail, guard } from "@/src/api";
import { readLabel } from "@/src/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** POST /api/read-label (multipart, champ "photo") → { items, modele } */
export async function POST(req: Request) {
  const g = await guard(); if (g) return g;
  try {
    const form = await req.formData();
    const f = form.get("photo");
    if (!(f instanceof File)) return err("Photo manquante");
    const type = f.type || "image/jpeg";
    if (!MEDIA.has(type)) return err("Format d'image non pris en charge");
    if (f.size > 8 * 1024 * 1024) return err("Photo trop lourde (8 Mo max)");
    const data = Buffer.from(await f.arrayBuffer()).toString("base64");
    const r = await readLabel(data, type as "image/jpeg");
    return NextResponse.json(r);
  } catch (e) { return fail(e); }
}
