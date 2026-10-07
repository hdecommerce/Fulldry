// Appels Claude côté serveur : lecture d'une étiquette (vision) et contrôle
// de la commande. Sorties structurées validées par Zod ; rien n'est renvoyé
// au client sans passer par cette validation.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { cleanLot, normDate, type IaCheck, type LigneCommande, type TypeDate } from "./traca";

const MODEL_FAST = process.env.CLAUDE_MODEL_FAST || "claude-sonnet-5-5";
const MODEL_PRECISE = process.env.CLAUDE_MODEL_PRECISE || "claude-opus-5-5";

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic({ maxRetries: 2, timeout: 90_000 }));

export const READ_PROMPT = `Tu lis la ou les étiquettes de charcuterie (saucisson, fuet, chorizo, lomo, jambon, coffret) sur cette photo, pour la traçabilité d'un colis.
Pour CHAQUE produit dont l'étiquette est visible, relève :
- "produit" : nom court tel qu'écrit, avec le poids s'il figure (ex. "Chorizo doux 280 g")
- "lot" : le numéro de lot exact, celui qui suit "Lot", "L", "Lote", "LOT n°", "Batch" ou l'identifiant GS1 (10). Recopie-le caractère par caractère, sans espace ni mot "Lot". N'invente rien.
  Ce n'est PAS le code-barres (EAN à 13 chiffres), ni le SSCC (00), ni l'estampille sanitaire ovale (ex. "FR 63.xxx.xxx CE", "ES 10.xxxxx/B CE"), ni le poids, ni le prix.
- "date" : la date limite au format JJ/MM/AAAA. Si seuls le mois et l'année sont indiqués, MM/AAAA. Année sur 2 chiffres → 20xx. En GS1 : (17)AAMMJJ = DLC, (15)AAMMJJ = DDM ; ignore (11) et (13).
- "typeDate" : "DLC" (à consommer jusqu'au / fecha de caducidad) ou "DDM" (à consommer de préférence avant / consumir preferentemente antes de / best before)
- "doute" : true si un seul caractère du lot ou de la date est flou, coupé, masqué ou incertain, sinon false
Si une information est absente ou illisible, chaîne vide et doute true.`;

const LabelSchema = z.object({
  produits: z.array(z.object({
    produit: z.string(),
    lot: z.string(),
    date: z.string(),
    typeDate: z.enum(["DLC", "DDM", ""]),
    doute: z.boolean(),
  })),
});

export interface LabelItem { produit: string; lot: string; date: string; typeDate: TypeDate; doute: boolean }
export interface LabelResult { items: LabelItem[]; modele: string }

type Media = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

async function readOnce(model: string, data: string, mediaType: Media): Promise<LabelItem[]> {
  const r = await client().messages.parse({
    model,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(LabelSchema) },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data } },
        { type: "text", text: READ_PROMPT },
      ],
    }],
  });
  if (r.stop_reason === "refusal") throw new Error("Lecture refusée par le modèle");
  const parsed = r.parsed_output;
  if (!parsed) throw new Error("Réponse illisible");
  // Post-traitement obligatoire : dates normalisées, lots nettoyés, doute si manque.
  return parsed.produits.map((p) => {
    const d = normDate(p.date);
    const lot = cleanLot(p.lot);
    return {
      produit: p.produit.trim().slice(0, 120),
      lot,
      date: d.v,
      typeDate: p.typeDate === "DLC" ? "DLC" : "DDM",
      doute: p.doute || !lot || !d.ok,
    };
  });
}

/** Première passe rapide ; relecture avec le modèle précis dès qu'un doute subsiste. */
export async function readLabel(data: string, mediaType: Media): Promise<LabelResult> {
  let items = await readOnce(MODEL_FAST, data, mediaType);
  let modele = MODEL_FAST;
  if (!items.length || items.some((i) => i.doute)) {
    try {
      const again = await readOnce(MODEL_PRECISE, data, mediaType);
      const doubts = (a: LabelItem[]) => a.filter((i) => i.doute).length;
      if (again.length && (!items.length || doubts(again) <= doubts(items))) { items = again; modele = MODEL_PRECISE; }
    } catch { /* on garde la première lecture */ }
  }
  return { items, modele };
}

const CheckSchema = z.object({
  attendus: z.array(z.object({ ligne: z.number().int(), produit: z.string(), qte: z.number().int(), etiquettes: z.array(z.number().int()) })),
  inconnues: z.array(z.number().int()),
  enTrop: z.array(z.number().int()),
});

export async function checkOrder(lines: LigneCommande[], labels: { produit: string; lot: string; qte: number }[]): Promise<IaCheck> {
  const lignes = lines.map((l, i) => ({ ligne: i, titre: l.title + (l.variantTitle ? " – " + l.variantTitle : ""), sku: l.sku ?? "", qte: l.quantity, ficheProduit: l.fiche ?? "" }));
  const etiq = labels.map((l, i) => ({ etiquette: i, produit: l.produit, lot: l.lot, qte: l.qte }));
  const prompt = `Tu contrôles la préparation d'un colis de charcuterie SaucBack avant expédition.
Lignes de la commande Shopify : ${JSON.stringify(lignes)}
Étiquettes flashées dans le colis : ${JSON.stringify(etiq)}
Règles :
- Une ligne simple attend "qte" unités de ce produit.
- Une box / coffret / assortiment contient plusieurs produits : utilise la liste écrite dans le titre après "–", ":" ou "avec" (séparée par virgules, "+" ou "et"), sinon le contenu décrit dans "ficheProduit". Multiplie par "qte" de la ligne.
- Si le contenu d'une box n'est ni dans le titre ni dans la fiche produit, mets l'indice de la ligne dans "inconnues".
- Associe chaque produit attendu aux étiquettes par le sens du nom (ex. "1/4 Serrano ETG" = jambon serrano, "Chorizo IGP" = chorizo). Ignore les écarts de poids et de marque. Une étiquette ne sert qu'une fois (sa "qte" compte pour plusieurs unités). Ne force jamais une correspondance douteuse.
- "enTrop" : indices des étiquettes qui ne correspondent à rien dans la commande.
- Pour une box, renvoie un élément "attendus" par produit de la box (ligne = indice de la box).`;
  const r = await client().messages.parse({
    model: MODEL_FAST,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(CheckSchema) },
    messages: [{ role: "user", content: prompt }],
  });
  if (!r.parsed_output) throw new Error("Contrôle illisible");
  return r.parsed_output;
}

export function claudeErrorMessage(e: unknown): { message: string; status: number } {
  if (e instanceof Anthropic.AuthenticationError) return { message: "Clé API Anthropic invalide", status: 500 };
  if (e instanceof Anthropic.RateLimitError) return { message: "Trop de lectures en même temps, réessaie dans quelques secondes", status: 429 };
  if (e instanceof Anthropic.APIError) return { message: `Claude a répondu ${e.status}`, status: 502 };
  return { message: e instanceof Error ? e.message : "Erreur inconnue", status: 500 };
}
