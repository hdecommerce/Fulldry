"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cleanLot, lineIssues, mergeLines, normDate, searchLot, type CheckResult, type Commande, type Ligne, type TypeDate } from "@/src/traca";

type PhotoStatus = "attente" | "lecture" | "ok" | "verifier" | "vide" | "erreur";
interface Photo { id: number; blob: Blob; url: string; status: PhotoStatus; err: string; tries: number }
interface RegItem { id: string; name: string; canal: string; client: string; prepare: string; forced: boolean; items: { produit: string; qte: number; lot: string; typeDate: string; date: string }[] }

let nextId = 1;
const uid = () => nextId++;
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignoré */ } };
const dkey = (id: string) => "traca-draft-" + id;

async function shrink(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.9));
  } catch { return file; }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.reload(); throw new Error("Connexion requise"); }
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { status: r.status });
  return j as T;
}

export default function Traca() {
  const router = useRouter();
  const [tab, setTab] = useState<"prep" | "reg">("prep");
  const [orders, setOrders] = useState<Commande[] | null>(null);
  const [ordersErr, setOrdersErr] = useState("");
  const [cur, setCur] = useState<Commande | null>(null);
  const [curAlert, setCurAlert] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lines, setLines] = useState<Ligne[]>([]);
  const [check, setCheck] = useState<CheckResult | { error: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ cls: string; text: string } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [undo, setUndo] = useState<{ id: string; name: string; left: number } | null>(null);
  const [online, setOnline] = useState(true);
  // caméra
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camErr, setCamErr] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [flash, setFlash] = useState(false);
  // registre
  const [q, setQ] = useState("");
  const [reg, setReg] = useState<{ query: string; total: number; items: RegItem[] } | null>(null);
  const [regErr, setRegErr] = useState("");

  const linesRef = useRef(lines); linesRef.current = lines;
  const curRef = useRef(cur); curRef.current = cur;
  const photosRef = useRef(photos); photosRef.current = photos;

  // ---------- commandes ----------
  const loadOrders = useCallback(async () => {
    try {
      const j = await api<{ orders: Commande[] }>("/api/orders");
      setOrders(j.orders); setOrdersErr("");
      const c = curRef.current;
      if (c && !j.orders.some((o) => o.id === c.id)) setCurAlert("Cette commande n'est plus à préparer dans Shopify (annulée, expédiée ou déjà tracée).");
    } catch (e) { setOrdersErr((e as Error).message); }
  }, []);

  useEffect(() => {
    loadOrders();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadOrders(); }, 60000);
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [loadOrders]);

  // Sélection automatique de la plus ancienne commande
  useEffect(() => { if (orders && orders.length && !cur) selectOrder(orders[0]); }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveDraft(id: string, ls: Ligne[]) { try { localStorage.setItem(dkey(id), JSON.stringify(ls.map(({ photoIds: _p, ...l }) => l))); } catch { /* ignoré */ } }
  function selectOrder(o: Commande) {
    if (cur && cur.id !== o.id) saveDraft(cur.id, linesRef.current);
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]); setCheck(null); setForce(false); setSaveMsg(null); setCurAlert(""); setCountdown(null); setPaused(false);
    let draft: Ligne[] = [];
    try { const v = JSON.parse(localStorage.getItem(dkey(o.id)) || "null"); if (Array.isArray(v)) draft = v.map((l) => ({ ...l, id: uid(), photoIds: [] })); } catch { /* ignoré */ }
    setLines(draft);
    setCur(o);
  }

  // ---------- caméra ----------
  const stopCam = useCallback(() => { setStream((s) => { s?.getTracks().forEach((t) => t.stop()); return null; }); setTorch(null); }, []);
  async function startCam() {
    setCamErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
      const adv: Record<string, unknown>[] = [];
      if (caps.focusMode?.includes("continuous")) adv.push({ focusMode: "continuous" });
      if (adv.length) track.applyConstraints({ advanced: adv } as MediaTrackConstraints).catch(() => {});
      setTorch(caps.torch ? false : null);
      setStream(s);
    } catch (e) { setCamErr(e instanceof DOMException && e.name === "NotAllowedError" ? "Autorise la caméra dans les réglages du navigateur, ou utilise « Depuis l'appareil photo »." : "Caméra indisponible : utilise « Depuis l'appareil photo »."); }
  }
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "hidden") stopCam(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); stopCam(); };
  }, [stopCam]);
  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0]; if (!track || torch === null) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { /* ignoré */ }
  }
  async function shoot() {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true); setTimeout(() => setFlash(false), 120); vibrate(40);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9));
    if (blob) addPhotos([blob]);
  }

  // Écran allumé pendant la préparation
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => { try { if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<typeof lock> } }).wakeLock.request("screen"); } catch { /* ignoré */ } };
    req(); document.addEventListener("visibilitychange", req);
    return () => { document.removeEventListener("visibilitychange", req); lock?.release().catch(() => {}); };
  }, []);

  // ---------- lecture des photos (2 en parallèle, file d'attente au-delà) ----------
  const running = useRef(0);
  function addPhotos(blobs: Blob[]) {
    if (!curRef.current) return;
    const ps = blobs.map((b) => ({ id: uid(), blob: b, url: URL.createObjectURL(b), status: "attente" as PhotoStatus, err: "", tries: 0 }));
    setPhotos((p) => [...p, ...ps]);
    vibrate(40);
  }
  const setPhoto = (id: number, patch: Partial<Photo>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  useEffect(() => {
    if (!online) return;
    const pending = photos.filter((p) => p.status === "attente");
    while (running.current < 2 && pending.length) {
      const p = pending.shift()!;
      running.current++;
      setPhoto(p.id, { status: "lecture" });
      readPhoto(p).finally(() => { running.current--; setPhotos((ps) => [...ps]); });
    }
  }, [photos, online]); // eslint-disable-line react-hooks/exhaustive-deps

  async function readPhoto(p: Photo) {
    const orderId = curRef.current?.id;
    try {
      const small = await shrink(p.blob);
      const fd = new FormData(); fd.append("photo", small, "etiquette.jpg");
      const j = await api<{ items: { produit: string; lot: string; date: string; typeDate: TypeDate; doute: boolean }[] }>("/api/read-label", { method: "POST", body: fd });
      if (curRef.current?.id !== orderId || !photosRef.current.some((x) => x.id === p.id)) return;
      if (!j.items.length) { setPhoto(p.id, { status: "vide" }); return; }
      setLines((ls) => mergeLines([...ls, ...j.items.map((it) => ({ id: uid(), ...it, qte: 1, photoIds: [p.id] }))]));
      setPhoto(p.id, { status: j.items.some((i) => i.doute) ? "verifier" : "ok" });
    } catch (e) {
      const st = (e as { status?: number }).status;
      if ((st === 429 || st === 502 || st === undefined) && p.tries < 1) {
        setPhoto(p.id, { tries: 1 });
        await new Promise((r) => setTimeout(r, 5000));
        setPhoto(p.id, { status: "attente" }); // une seule relance automatique
        return;
      }
      setPhoto(p.id, { status: "erreur", err: (e as Error).message });
    }
  }

  function removePhoto(id: number) {
    const p = photos.find((x) => x.id === id); if (p) URL.revokeObjectURL(p.url);
    setPhotos((ps) => ps.filter((x) => x.id !== id));
    setLines((ls) => ls.filter((l) => !(l.photoIds.length === 1 && l.photoIds[0] === id)).map((l) => ({ ...l, photoIds: l.photoIds.filter((x) => x !== id) })));
  }

  // ---------- lignes ----------
  useEffect(() => { if (cur) saveDraft(cur.id, lines); }, [lines, cur]);
  const patchLine = (id: number, patch: Partial<Ligne>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const names = useMemo(() => [...new Set(lines.map((l) => l.produit).filter(Boolean))], [lines]);

  // ---------- contrôle de la commande (anti-rebond 700 ms) ----------
  const checkSeq = useRef(0);
  useEffect(() => {
    if (!cur) return;
    const labels = lines.filter((l) => l.produit.trim()).map((l) => ({ produit: l.produit, lot: l.lot, qte: l.qte }));
    if (!labels.length) { setCheck(null); return; }
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const r = await api<CheckResult>("/api/check-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: cur.lines, labels }) });
        if (seq === checkSeq.current) setCheck(r);
      } catch (e) { if (seq === checkSeq.current) setCheck({ error: "Le contrôle automatique a échoué : " + (e as Error).message }); }
      finally { if (seq === checkSeq.current) setChecking(false); }
    }, 700);
    return () => clearTimeout(t);
  }, [lines, cur]);

  // ---------- état de validation ----------
  const reading = photos.some((p) => p.status === "attente" || p.status === "lecture");
  const badLines = lines.filter((l) => lineIssues(l).some((x) => x[0] === "bad")).length;
  const hard: string[] = [];
  if (curAlert) hard.push("Commande plus à préparer dans Shopify");
  if (!lines.length) hard.push("Aucune étiquette lue");
  if (reading) hard.push("Lecture des photos en cours");
  if (badLines) hard.push(`${badLines} ligne${badLines > 1 ? "s" : ""} à corriger`);
  const complete = !!check && !("error" in check) && check.complete;
  const needForce = !hard.length && (checking || !complete);
  const canSave = !saving && !hard.length && !checking && (complete || force);

  // Validation automatique : 2 s quand tout est bon
  useEffect(() => {
    if (!canSave || force || paused || saving || countdown !== null) return;
    setCountdown(2);
  }, [canSave, force, paused, saving]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (countdown === null) return;
    if (!canSave || paused) { setCountdown(null); return; }
    if (countdown === 0) { setCountdown(null); save(); return; }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, canSave, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const o = cur; if (!o || saving) return;
    setSaving(true); setCountdown(null); setSaveMsg({ cls: "info", text: "Écriture dans Shopify…" });
    try {
      const j = await api<{ name: string; tag: string; tagWarning: string }>("/api/shipments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: o.id, forced: force || !complete, lines: lines.map(({ id: _i, photoIds: _p, ...l }) => l) }) });
      try { localStorage.removeItem(dkey(o.id)); } catch { /* ignoré */ }
      vibrate([60, 60, 120]);
      const rest = (orders ?? []).filter((x) => x.id !== o.id);
      const idx = (orders ?? []).findIndex((x) => x.id === o.id);
      setOrders(rest);
      const next = rest[idx] ?? rest[0] ?? null;
      setCur(null); setLines([]); setPhotos([]); setCheck(null); setForce(false); setPaused(false);
      if (next) selectOrder(next);
      setSaveMsg({ cls: j.tagWarning ? "warn" : "ok", text: `✓ ${j.name} enregistrée dans Shopify (note + tag « ${j.tag} »)${j.tagWarning ? " — tag non posé : " + j.tagWarning : ""}${next ? ". Commande suivante : " + next.name : ""}` });
      setUndo({ id: o.id, name: j.name, left: 8 });
    } catch (e) {
      setSaveMsg({ cls: "bad", text: (e as Error).message + " — rien n'est perdu, corrige puis réessaie." });
      setPaused(true);
    } finally { setSaving(false); }
  }

  useEffect(() => {
    if (!undo) return;
    if (undo.left <= 0) { setUndo(null); return; }
    const t = setTimeout(() => setUndo((u) => (u ? { ...u, left: u.left - 1 } : null)), 1000);
    return () => clearTimeout(t);
  }, [undo]);
  async function undoSave() {
    const u = undo; if (!u) return; setUndo(null);
    try { await api(`/api/shipments?id=${encodeURIComponent(u.id)}`, { method: "DELETE" }); setSaveMsg({ cls: "info", text: `Validation de ${u.name} annulée : bloc de note et tag retirés.` }); loadOrders(); }
    catch (e) { setSaveMsg({ cls: "bad", text: "Annulation impossible : " + (e as Error).message }); }
  }

  // ---------- registre ----------
  async function loadReg(query = "") {
    setRegErr("");
    try { setReg(await api(`/api/registry?q=${encodeURIComponent(query)}`)); } catch (e) { setRegErr((e as Error).message); }
  }
  useEffect(() => { if (tab === "reg" && !reg) loadReg(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function logout() { await fetch("/api/login", { method: "DELETE" }); router.refresh(); }

  // ---------- rendu ----------
  const marks = check && !("error" in check) ? check.perLine : [];
  const hl = reg ? searchLot(reg.query) : "";

  return (
    <div className="wrap">
      <header className="top">
        <h1>Traçabilité colis</h1>
        <div className="row">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "prep"} onClick={() => setTab("prep")}>Préparer</button>
            <button role="tab" aria-selected={tab === "reg"} onClick={() => setTab("reg")}>Registre</button>
          </div>
          <button className="btn small" onClick={logout} aria-label="Se déconnecter">Quitter</button>
        </div>
      </header>

      {!online && <div className="banner warn">Hors ligne : les photos sont gardées sur la tablette et seront lues au retour du réseau.</div>}

      {tab === "prep" && (
        <>
          <section className="panel">
            <div className="row between"><span className="label">Commandes à préparer</span><button className="btn small" onClick={loadOrders}>Actualiser</button></div>
            {ordersErr ? <div className="banner bad">{ordersErr}</div>
              : orders === null ? <span className="muted">Chargement des commandes Shopify…</span>
              : !orders.length ? <div className="banner ok">Aucune commande à préparer. Tout est tracé.</div>
              : <div className="orders">{orders.map((o) => {
                const n = o.lines.reduce((a, l) => a + l.quantity, 0);
                return <button key={o.id} className="order" aria-pressed={cur?.id === o.id} onClick={() => selectOrder(o)}>
                  <span className="row" style={{ gap: 8 }}><span className="num">{o.name}</span><span className={"chip " + o.canal.toLowerCase()}>{o.canal}</span></span>
                  <span>{o.client}</span>
                  <span className="muted" style={{ fontSize: ".9rem" }}>{n} article{n > 1 ? "s" : ""} · {new Date(o.createdAt).toLocaleDateString("fr-FR")}</span>
                </button>;
              })}</div>}
          </section>

          {cur && <>
            <section className="panel">
              <div className="row between"><h2>Commande {cur.name}</h2><span className="muted">{cur.canal} · {cur.client}</span></div>
              {curAlert && <div className="banner warn">{curAlert}</div>}
              <span className="label">À flasher</span>
              <ul className="expect">{cur.lines.map((l, i) => {
                const m = marks[i];
                return <li key={i} className={m ? (m.ok ? "ok" : "miss") : ""}>
                  <span className="mark">{m ? (m.ok ? "✓" : "✗") : l.quantity}</span>
                  <div>
                    <div><strong>{l.quantity} ×</strong> {l.title}{l.variantTitle ? " – " + l.variantTitle : ""}</div>
                    {l.fiche && <div className="sub muted">Fiche produit : {l.fiche.slice(0, 260)}{l.fiche.length > 260 ? "…" : ""}</div>}
                    {m && <div className="sub">{m.text}</div>}
                  </div>
                </li>;
              })}</ul>
            </section>

            <section className="panel">
              <span className="label">Photos des étiquettes</span>
              {stream ? <>
                <div className="cam">
                  <video ref={videoRef} autoPlay playsInline muted />
                  <div className={"flash" + (flash ? " on" : "")} />
                  <span className="count">{photos.length} photo{photos.length > 1 ? "s" : ""}</span>
                  {torch !== null && <button className="torch" onClick={toggleTorch}>{torch ? "Lampe ✓" : "Lampe"}</button>}
                </div>
                <div className="shutter">
                  <button className="btn primary" onClick={shoot}>📷 Déclencher</button>
                  <button className="btn" onClick={stopCam}>Fermer la caméra</button>
                </div>
              </> : <>
                <div className="capture">
                  <button className="btn primary" onClick={startCam}>📷 Ouvrir la caméra</button>
                  <label className="btn" htmlFor="cam-file">Depuis l&apos;appareil photo</label>
                </div>
                {camErr && <div className="banner warn">{camErr}</div>}
              </>}
              <div className="row">
                <label className="btn small" htmlFor="gal-file">Depuis la galerie (plusieurs)</label>
              </div>
              <input className="sr" type="file" id="cam-file" accept="image/*" capture="environment" onChange={(e) => { addPhotos([...(e.target.files ?? [])]); e.target.value = ""; }} />
              <input className="sr" type="file" id="gal-file" accept="image/*" multiple onChange={(e) => { addPhotos([...(e.target.files ?? [])]); e.target.value = ""; }} />
              {photos.length > 0 && <div className="thumbs">{photos.map((p) => {
                const lab: Record<PhotoStatus, [string, string]> = { attente: ["busy", online ? "En attente" : "Hors ligne"], lecture: ["busy", "Lecture…"], ok: ["ok", "✓ Lu"], verifier: ["warn", "À vérifier"], vide: ["warn", "Aucune étiquette vue"], erreur: ["bad", p.err] };
                const [c, t] = lab[p.status];
                return <div key={p.id} className="thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`Photo ${p.id}`} />
                  <button className="x" onClick={() => removePhoto(p.id)} aria-label="Retirer la photo">✕</button>
                  <div className={"st " + c}>{t}</div>
                  {(p.status === "erreur" || p.status === "vide") && <button className="retry" onClick={() => setPhoto(p.id, { status: "attente", tries: 0, err: "" })}>Réessayer</button>}
                </div>;
              })}</div>}
            </section>

            <section className="panel">
              <div className="row between"><span className="label">Contenu du colis (lu sur les étiquettes)</span>
                <button className="btn small" onClick={() => setLines((ls) => [...ls, { id: uid(), produit: "", lot: "", date: "", typeDate: "DDM", qte: 1, doute: false, photoIds: [] }])}>+ Ajouter une ligne</button></div>
              {!lines.length ? <p className="muted" style={{ margin: 0 }}>Aucune étiquette lue pour l&apos;instant. Photographie chaque produit mis dans le colis.</p>
                : <div className="tablewrap"><table>
                  <thead><tr><th>Produit</th><th>Lot</th><th>Date limite</th><th>Type</th><th>Qté</th><th></th></tr></thead>
                  <tbody>{lines.map((l) => {
                    const iss = lineIssues(l);
                    const bad = (k: "produit" | "lot" | "date") => (k === "produit" && !l.produit) || (k === "lot" && (!l.lot || l.doute)) || (k === "date" && (l.doute || iss.some((x) => x[0] === "bad" && /Date/.test(x[1]))));
                    return <tr key={l.id}>
                      <td><input id={`p-${l.id}`} list="names" className={bad("produit") ? "bad" : ""} value={l.produit} onChange={(e) => patchLine(l.id, { produit: e.target.value })} aria-label="Produit" />
                        {iss.map((x, i) => <div key={i} className={"msg " + x[0]}>{x[1]}</div>)}</td>
                      <td><input id={`l-${l.id}`} className={"lot" + (bad("lot") ? " bad" : "")} value={l.lot} onChange={(e) => patchLine(l.id, { lot: e.target.value, doute: false })} onBlur={() => patchLine(l.id, { lot: cleanLot(l.lot) })} aria-label="Lot" /></td>
                      <td><input id={`d-${l.id}`} className={bad("date") ? "bad" : ""} value={l.date} placeholder="JJ/MM/AAAA" inputMode="numeric" onChange={(e) => patchLine(l.id, { date: e.target.value, doute: false })} onBlur={() => { const d = normDate(l.date); if (d.ok) patchLine(l.id, { date: d.v }); }} aria-label="Date limite" /></td>
                      <td><select id={`t-${l.id}`} value={l.typeDate} onChange={(e) => patchLine(l.id, { typeDate: e.target.value as TypeDate })} aria-label="Type de date"><option>DDM</option><option>DLC</option></select></td>
                      <td className="qte"><input id={`q-${l.id}`} type="number" min={1} value={l.qte} onChange={(e) => patchLine(l.id, { qte: Math.max(1, parseInt(e.target.value, 10) || 1) })} aria-label="Quantité" /></td>
                      <td><button className="del" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} aria-label="Supprimer la ligne">✕</button></td>
                    </tr>;
                  })}</tbody>
                </table><datalist id="names">{names.map((n) => <option key={n} value={n} />)}</datalist></div>}
            </section>

            <section className="panel savebar">
              <div className={"banner " + (checking ? "info" : !check ? "info" : "error" in check ? "warn" : check.complete ? "ok" : "bad")}>
                {checking ? "Contrôle de la commande en cours…"
                  : !check ? "Le contrôle de la commande démarre dès la première étiquette lue."
                  : "error" in check ? check.error
                  : check.complete ? "✓ Tous les produits de la commande sont dans le colis."
                  : [check.missing.length ? "Il manque : " + check.missing.join(" ; ") : "", check.extra.length ? "En trop : " + check.extra.join(", ") : ""].filter(Boolean).join(" — ")}
              </div>
              {countdown !== null && <div className="banner ok">Tout est bon, validation dans {countdown} s…<div className="row"><button className="btn small" onClick={() => { setPaused(true); setCountdown(null); }}>Attendre</button></div></div>}
              {needForce && <label className="force"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Forcer la validation (rupture, remplacement, produit vérifié à la main)</label>}
              <button className="btn go" disabled={!canSave} onClick={save}>
                {saving ? "Enregistrement…" : hard[0] ?? (needForce && !force ? "Colis incomplet — coche pour forcer" : force ? "Enregistrer quand même dans Shopify" : "Enregistrer dans Shopify")}
              </button>
              {saveMsg && <div className={"banner " + saveMsg.cls}>{saveMsg.text}</div>}
            </section>
          </>}
          {cur === null && saveMsg && <div className={"banner " + saveMsg.cls}>{saveMsg.text}</div>}
        </>
      )}

      {tab === "reg" && (
        <>
          <section className="panel">
            <span className="label">Recherche rappel produit</span>
            <form className="search" onSubmit={(e) => { e.preventDefault(); loadReg(q); }}>
              <input className="field" id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° de lot (ex. L24158) ou n° de commande" autoComplete="off" />
              <button className="btn primary" type="submit">Rechercher</button>
              <button className="btn" type="button" onClick={() => { setQ(""); loadReg(""); }}>Tout</button>
              <a className="btn" href="/api/export" download>Exporter CSV</a>
            </form>
            {regErr && <div className="banner bad">{regErr}</div>}
            {reg?.query && <div className={"banner " + (reg.items.length ? "warn" : "ok")}>{reg.items.length ? `${reg.items.length} colis concerné${reg.items.length > 1 ? "s" : ""} par « ${reg.query} »` : `Aucun colis tracé avec « ${reg.query} » parmi les ${reg.total} commandes tracées.`}</div>}
          </section>
          <section className="panel">
            <span className="label">{reg?.query ? "Résultats" : "Derniers colis tracés"}</span>
            {!reg && !regErr ? <span className="muted">Chargement du registre depuis Shopify…</span>
              : <ul className="reg">{(reg?.items ?? []).map((x) => <li key={x.id}>
                <div className="row between"><strong>{x.name} · {x.client}</strong><span className="row" style={{ gap: 6 }}><span className={"chip " + x.canal.toLowerCase()}>{x.canal}</span>{x.forced && <span className="chip temu">forcée</span>}</span></div>
                <span className="muted" style={{ fontSize: ".9rem" }}>Préparé le {x.prepare}</span>
                <div className="items">{x.items.map((i, k) => <div key={k}>{i.produit} ×{i.qte} · lot {hl && searchLot(i.lot).includes(hl) ? <mark>{i.lot}</mark> : i.lot} · {i.typeDate} {i.date}</div>)}</div>
                <div className="row"><button className="btn small" onClick={async () => { if (!confirm(`Retirer la traçabilité de ${x.name} dans Shopify ?`)) return; try { await api(`/api/shipments?id=${encodeURIComponent(x.id)}`, { method: "DELETE" }); loadReg(reg?.query ?? ""); loadOrders(); } catch (e) { setRegErr((e as Error).message); } }}>Supprimer</button></div>
              </li>)}{reg && !reg.items.length && !reg.query && <li className="muted">Aucun colis tracé pour l&apos;instant.</li>}</ul>}
          </section>
        </>
      )}

      {undo && <div className="undo"><span>{undo.name} validée.</span><button className="btn small" onClick={undoSave}>Annuler ({undo.left} s)</button></div>}
    </div>
  );
}
