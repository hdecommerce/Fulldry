"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) router.refresh();
    else { setErr(j.error || "Code incorrect"); setPin(""); }
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="SaucBack" className="logo big" />
        <h1>Traçabilité colis</h1>
        <p className="muted">Entre le code PIN de la tablette. Il n&apos;est demandé qu&apos;une fois.</p>
        <input id="pin" inputMode="numeric" autoComplete="one-time-code" pattern="\d*" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus aria-label="Code PIN" />
        {err && <div className="banner bad">{err}</div>}
        <button className="btn primary" disabled={busy || pin.length < 4}>{busy ? "Vérification…" : "Entrer"}</button>
      </form>
    </main>
  );
}
