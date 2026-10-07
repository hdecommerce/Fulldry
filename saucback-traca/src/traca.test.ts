import { describe, expect, it } from "vitest";
import { buildBlock, cleanLot, csvRegistre, evalCheck, lineIssues, mergeLines, mergeNote, normDate, parseBlock, searchLot, stripBlock, type Ligne } from "./traca";

const L = (p: Partial<Ligne>): Ligne => ({ id: 1, produit: "Chorizo", lot: "L1", date: "12/03/2027", typeDate: "DDM", qte: 1, doute: false, photoIds: [], ...p });

describe("normDate", () => {
  it("normalise les formats courants", () => {
    expect(normDate("12.3.27").v).toBe("12/03/2027");
    expect(normDate("2027-03-12").v).toBe("12/03/2027");
    expect(normDate("1/3/2027").v).toBe("01/03/2027");
    expect(normDate("03/27")).toMatchObject({ v: "03/2027", ok: true });
  });
  it("rejette les dates impossibles", () => {
    expect(normDate("31/02/2027").ok).toBe(false);
    expect(normDate("13/2027").ok).toBe(false);
    expect(normDate("bientôt").ok).toBe(false);
    expect(normDate("").ok).toBe(false);
  });
});

describe("lots", () => {
  it("nettoie majuscules, espaces et préfixes", () => {
    expect(cleanLot("Lot L 24158")).toBe("L24158");
    expect(cleanLot("LOTE: 2415b")).toBe("2415B");
    expect(cleanLot("L24158")).toBe("L24158");
    expect(searchLot("l-24/158")).toBe("L24158");
  });
});

describe("lineIssues", () => {
  const now = new Date(2026, 9, 7);
  it("bloque date dépassée, lot manquant, doute", () => {
    expect(lineIssues(L({ date: "01/10/2026" }), now).map((x) => x[1])).toContain("Date dépassée : ne pas expédier");
    expect(lineIssues(L({ lot: "" }), now)[0][1]).toBe("Lot manquant");
    expect(lineIssues(L({ doute: true }), now).some((x) => x[0] === "bad")).toBe(true);
  });
  it("avertit DLC proche et date lointaine", () => {
    expect(lineIssues(L({ typeDate: "DLC", date: "10/10/2026" }), now)).toEqual([["warn", "DLC dans 3 j"]]);
    expect(lineIssues(L({ date: "01/01/2032" }), now)).toEqual([["warn", "Date très lointaine : vérifie"]]);
    expect(lineIssues(L({}), now)).toEqual([]);
  });
});

describe("mergeLines", () => {
  it("fusionne même produit + même lot", () => {
    const out = mergeLines([L({ id: 1, photoIds: [1] }), L({ id: 2, lot: "l1", produit: "chorizo ", photoIds: [2] }), L({ id: 3, lot: "L2" })]);
    expect(out).toHaveLength(2);
    expect(out[0].qte).toBe(2);
    expect(out[0].photoIds).toEqual([1, 2]);
  });
});

describe("note Shopify", () => {
  const now = new Date(2026, 9, 7, 11, 36);
  const block = buildBlock([{ produit: "Chorizo doux 280 g", qte: 2, lot: "L123", typeDate: "DDM", date: "12.3.27" }], false, now);
  it("construit le bloc", () => {
    expect(block).toBe("--- Traça SaucBack ---\nPréparé le 07/10/2026 11:36\n- Chorizo doux 280 g x2 : lot L123, DDM 12/03/2027\n--- fin traça ---");
  });
  it("garde la note client et remplace l'ancien bloc", () => {
    const n1 = mergeNote("Merci de livrer après 18h", block);
    expect(n1.startsWith("Merci de livrer après 18h\n\n")).toBe(true);
    const n2 = mergeNote(n1, buildBlock([{ produit: "Fuet", qte: 1, lot: "F9", typeDate: "DLC", date: "01/01/2027" }], true, now));
    expect(n2.split("--- Traça SaucBack ---")).toHaveLength(2);
    expect(n2).toContain("(validation forcée)");
    expect(stripBlock(n2)).toBe("Merci de livrer après 18h");
    expect(mergeNote(null, block)).toBe(block);
  });
  it("relit le bloc", () => {
    const p = parseBlock(mergeNote("note", block))!;
    expect(p.prepare).toBe("07/10/2026 11:36");
    expect(p.forced).toBe(false);
    expect(p.items).toEqual([{ produit: "Chorizo doux 280 g", qte: 2, lot: "L123", typeDate: "DDM", date: "12/03/2027" }]);
    expect(parseBlock("rien")).toBeNull();
  });
});

describe("evalCheck", () => {
  const lines = [{ title: "Box Ibérique – Chorizo IGP, Lomo, 1/4 Serrano ETG, Fuet Catalan", quantity: 1, sku: "SB-PDA-15", variantTitle: null }];
  const labels = [{ produit: "Chorizo", qte: 1 }, { produit: "Lomo", qte: 1 }, { produit: "Serrano", qte: 1 }, { produit: "Fuet", qte: 1 }];
  const ia = { attendus: [0, 1, 2, 3].map((i) => ({ ligne: 0, produit: ["Chorizo IGP", "Lomo", "1/4 Serrano ETG", "Fuet Catalan"][i], qte: 1, etiquettes: [i] })), inconnues: [], enTrop: [] };
  it("complet quand les 4 étiquettes sont là", () => {
    const r = evalCheck(ia, lines, labels);
    expect(r.complete).toBe(true);
    expect(r.perLine[0]).toEqual({ ok: true, text: "Complet" });
  });
  it("manquant si une étiquette est absente, et ne fait pas confiance au total IA", () => {
    const r = evalCheck({ ...ia, attendus: ia.attendus.map((a) => (a.produit === "Lomo" ? { ...a, etiquettes: [9] } : a)) }, lines, labels);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(["1 × Lomo"]);
    expect(r.extra).toEqual(["Lomo"]); // l'étiquette 1 n'a été attribuée nulle part
  });
  it("une étiquette ne sert qu'une fois", () => {
    const r = evalCheck({ ...ia, attendus: [{ ligne: 0, produit: "Chorizo", qte: 2, etiquettes: [0, 0] }] }, lines, labels.slice(0, 1));
    expect(r.missing).toEqual(["1 × Chorizo"]);
  });
  it("box inconnue", () => {
    const r = evalCheck({ attendus: [], inconnues: [0], enTrop: [] }, lines, labels);
    expect(r.complete).toBe(false);
    expect(r.perLine[0].text).toMatch(/Contenu inconnu/);
  });
});

describe("csv", () => {
  it("BOM, point-virgule, échappement", () => {
    const csv = csvRegistre([{ prepare: "07/10/2026 11:36", commande: "2570", canal: "Site", forced: false, items: [{ produit: 'Fuet "extra"', qte: 1, lot: "L1", typeDate: "DDM", date: "01/01/2027" }] }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[1]).toBe('07/10/2026 11:36;2570;Site;"Fuet ""extra""";1;L1;01/01/2027;DDM;complet');
  });
});
