// Logique métier pure (sans réseau, sans DOM) : dates, lots, fusion des lignes,
// bloc de note Shopify et calcul « colis complet ». Testée dans traca.test.ts.

export const TAG_OK = "Traça OK";
export const TAG_FORCE = "Traça forcée";
export const B_START = "--- Traça SaucBack ---";
export const B_END = "--- fin traça ---";
export const BOX_RE = /\b(box|coffret|assortiment|panier|plateau|lot de)\b/i;

export type TypeDate = "DLC" | "DDM";

export interface Ligne {
  id: number;
  produit: string;
  lot: string;
  date: string;
  typeDate: TypeDate;
  qte: number;
  doute: boolean;
  photoIds: number[];
}

export interface LigneCommande {
  title: string;
  quantity: number;
  sku: string | null;
  variantTitle: string | null;
  fiche?: string;
}

export interface Commande {
  id: string;
  name: string;
  createdAt: string;
  canal: "Site" | "Temu" | "TikTok";
  client: string;
  tags: string[];
  lines: LigneCommande[];
}

const pad = (n: number) => String(n).padStart(2, "0");

export interface DateNorm {
  v: string;
  ok: boolean;
  date?: Date;
}

/** 12.3.27, 2027-03-12, 12/03/2027 → 12/03/2027 ; 03/27 → 03/2027 (fin de mois). */
export function normDate(raw: unknown): DateNorm {
  let s = String(raw ?? "").trim();
  if (!s) return { v: "", ok: false };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) s = `${m[3]}/${m[2]}/${m[1]}`;
  m = s.match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return { v: s, ok: false };
    return { v: `${pad(d)}/${pad(mo)}/${y}`, ok: true, date: dt };
  }
  m = s.match(/^(\d{1,2})[/.\- ](\d{2}|\d{4})$/);
  if (m) {
    const mo = +m[1];
    let y = +m[2];
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12) return { v: s, ok: false };
    return { v: `${pad(mo)}/${y}`, ok: true, date: new Date(y, mo, 0) };
  }
  return { v: s, ok: false };
}

/** Majuscules, sans espace, sans préfixe « Lot », « Lote », « L: »… */
export const cleanLot = (s: unknown) =>
  String(s ?? "").toUpperCase().replace(/\s+/g, "").replace(/^(LOTE|LOTN°|LOTNO|LOT|BATCH|L:|L\.)[:.\-°]*/, "");

/** Forme indexable pour la recherche rappel : alphanumérique uniquement. */
export const searchLot = (s: unknown) => cleanLot(s).replace(/[^A-Z0-9]/g, "");

export const normName = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function today0(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type Issue = ["bad" | "warn", string];

export function lineIssues(l: Pick<Ligne, "produit" | "lot" | "date" | "typeDate" | "doute">, now = new Date()): Issue[] {
  const out: Issue[] = [];
  if (!l.produit.trim()) out.push(["bad", "Produit manquant"]);
  if (!l.lot.trim()) out.push(["bad", "Lot manquant"]);
  const d = normDate(l.date);
  if (!l.date.trim()) out.push(["bad", "Date manquante"]);
  else if (!d.ok || !d.date) out.push(["bad", "Date au mauvais format (JJ/MM/AAAA ou MM/AAAA)"]);
  else {
    const days = Math.round((d.date.getTime() - today0(now).getTime()) / 864e5);
    if (days < 0) out.push(["bad", "Date dépassée : ne pas expédier"]);
    else if (l.typeDate === "DLC" && days <= 7) out.push(["warn", `DLC dans ${days} j`]);
    if (days > 4 * 365) out.push(["warn", "Date très lointaine : vérifie"]);
  }
  if (l.doute) out.push(["bad", "Lecture douteuse : vérifie le lot et la date, puis corrige"]);
  return out;
}

/** Deux lignes même produit + même lot → une ligne, quantités additionnées. */
export function mergeLines(lines: Ligne[]): Ligne[] {
  const map = new Map<string, Ligne>();
  const out: Ligne[] = [];
  for (const l of lines) {
    const k = normName(l.produit) + "|" + cleanLot(l.lot);
    const t = l.produit && l.lot ? map.get(k) : undefined;
    if (t) {
      t.qte += l.qte;
      t.photoIds = [...new Set([...t.photoIds, ...l.photoIds])];
      t.doute = t.doute || l.doute;
    } else {
      map.set(k, l);
      out.push(l);
    }
  }
  return out;
}

export function buildBlock(lines: Pick<Ligne, "produit" | "lot" | "date" | "typeDate" | "qte">[], forced: boolean, now = new Date()): string {
  const rows = lines.map((l) => `- ${l.produit.trim()} x${l.qte} : lot ${l.lot.trim()}, ${l.typeDate || "Date"} ${normDate(l.date).v}`);
  const head = `Préparé le ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}${forced ? " (validation forcée)" : ""}`;
  return [B_START, head, ...rows, B_END].join("\n");
}

const blockRe = () => new RegExp("\\n*" + B_START.replace(/-/g, "\\-") + "[\\s\\S]*?" + B_END.replace(/-/g, "\\-") + "\\n*", "g");

/** Remplace l'ancien bloc s'il existe, sinon l'ajoute sous la note du client. */
export function mergeNote(note: string | null | undefined, block: string): string {
  const base = String(note ?? "").replace(blockRe(), "\n").trim();
  return (base ? base + "\n\n" : "") + block;
}

/** Retire le bloc de traçabilité ; renvoie la note du client seule. */
export function stripBlock(note: string | null | undefined): string {
  return String(note ?? "").replace(blockRe(), "\n").trim();
}

export interface BlockItem {
  produit: string;
  qte: number;
  lot: string;
  typeDate: string;
  date: string;
}
export interface ParsedBlock {
  prepare: string;
  forced: boolean;
  items: BlockItem[];
}

export function parseBlock(note: string | null | undefined): ParsedBlock | null {
  const s = String(note ?? "");
  const i = s.indexOf(B_START), j = s.indexOf(B_END);
  if (i < 0 || j < i) return null;
  const lines = s.slice(i + B_START.length, j).split("\n").map((x) => x.trim()).filter(Boolean);
  const head = lines.find((x) => x.startsWith("Préparé le")) ?? "";
  const items = lines.filter((x) => x.startsWith("- ")).map((x) => {
    const m = x.match(/^- (.+) x(\d+) : lot (.*?), (DLC|DDM|Date) (.*)$/);
    return m
      ? { produit: m[1], qte: +m[2], lot: m[3], typeDate: m[4], date: m[5] }
      : { produit: x.slice(2), qte: 1, lot: "", typeDate: "", date: "" };
  });
  return { prepare: head.replace("Préparé le ", "").replace(" (validation forcée)", ""), forced: head.includes("forcée"), items };
}

// ---------- contrôle de commande ----------

export interface IaAttendu { ligne: number; produit: string; qte: number; etiquettes: number[] }
export interface IaCheck { attendus: IaAttendu[]; inconnues: number[]; enTrop: number[] }

export interface LineMark { ok: boolean; text: string }
export interface CheckResult {
  complete: boolean;
  missing: string[];
  extra: string[];
  perLine: LineMark[];
}

/**
 * Recalcule « complet » depuis les indices renvoyés par l'IA : le total de
 * l'IA n'est jamais repris. Une étiquette ne sert qu'une fois ; toute
 * étiquette non attribuée compte comme « en trop ».
 */
export function evalCheck(r: IaCheck, lines: LigneCommande[], labels: Pick<Ligne, "produit" | "qte">[]): CheckResult {
  const used = new Set<number>();
  const perLine = lines.map(() => ({ need: 0, got: 0, missing: [] as string[] }));
  const missing: string[] = [];
  for (const a of r.attendus ?? []) {
    const li = Number(a.ligne);
    if (!perLine[li]) continue;
    const need = Math.max(1, Number(a.qte) || 1);
    let got = 0;
    for (const ix of a.etiquettes ?? []) {
      const n = Number(ix);
      if (labels[n] && !used.has(n)) { used.add(n); got += labels[n].qte; }
    }
    perLine[li].need += need;
    perLine[li].got += Math.min(got, need);
    if (got < need) { perLine[li].missing.push(`${need - got} × ${a.produit}`); missing.push(`${need - got} × ${a.produit}`); }
  }
  const unknown = (r.inconnues ?? []).map(Number).filter((x) => perLine[x]);
  const extra = labels.map((_, i) => i).filter((i) => !used.has(i)).map((i) => labels[i].produit);
  const marks: LineMark[] = perLine.map((p, i) => {
    if (unknown.includes(i)) return { ok: false, text: "Contenu inconnu : la fiche produit ne liste pas le contenu de la box." };
    if (!p.need) return { ok: false, text: "Non reconnu par le contrôle." };
    return p.missing.length ? { ok: false, text: "Manque : " + p.missing.join(", ") } : { ok: true, text: "Complet" };
  });
  unknown.forEach((i) => missing.push(`contenu de « ${lines[i].title} » inconnu`));
  perLine.forEach((p, i) => { if (!p.need && !unknown.includes(i)) missing.push(`« ${lines[i].title} » non reconnu`); });
  return { complete: !missing.length && !extra.length, missing, extra, perLine: marks };
}

export function csvRegistre(rows: { prepare: string; commande: string; canal: string; forced: boolean; items: BlockItem[] }[]): string {
  const cell = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out: unknown[][] = [["Date expédition", "Commande", "Canal", "Produit", "Quantité", "Lot", "Date limite", "Type date", "Contrôle"]];
  for (const r of rows) for (const i of r.items) out.push([r.prepare, r.commande, r.canal, i.produit, i.qte, i.lot, i.date, i.typeDate, r.forced ? "forcé" : "complet"]);
  return "﻿" + out.map((r) => r.map(cell).join(";")).join("\r\n");
}

export function csvFilename(now = new Date()): string {
  return `registre-expedition-saucback-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
