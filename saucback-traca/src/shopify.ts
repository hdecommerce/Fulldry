// Accès Shopify Admin GraphQL, côté serveur uniquement.
// Deux modes d'authentification :
//  - SHOPIFY_ADMIN_TOKEN : token d'une app personnalisée existante (shpat_…)
//  - SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET : app créée dans le Dev Dashboard
//    (client credentials grant, token renouvelé automatiquement toutes les 24 h)
import "server-only";
import { BOX_RE, TAG_FORCE, TAG_OK, type Commande, type LigneCommande } from "./traca";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";

function shopDomain(): string {
  const d = (process.env.SHOPIFY_STORE_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) throw new ShopifyError("SHOPIFY_STORE_DOMAIN manquant", 500);
  return d.includes(".") ? d : `${d}.myshopify.com`;
}

// Base des URLs Shopify ; surchargée uniquement par les tests de bout en bout (serveur simulé).
const base = () => process.env.SHOPIFY_BASE_URL || `https://${shopDomain()}`;

export class ShopifyError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) {
    super(message);
  }
}

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  const id = process.env.SHOPIFY_CLIENT_ID, secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!id || !secret) throw new ShopifyError("Configure SHOPIFY_ADMIN_TOKEN ou SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET", 500);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const r = await fetch(`${base()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    cache: "no-store",
  });
  if (!r.ok) throw new ShopifyError(`Token Shopify refusé (${r.status}) : vérifie SHOPIFY_CLIENT_ID / SECRET et que l'app est installée sur la boutique`, 401);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export async function gql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${base()}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken() },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (r.status === 401 || r.status === 403) throw new ShopifyError("Token Shopify invalide ou droits insuffisants", r.status);
  if (r.status === 429) throw new ShopifyError("Shopify limite le débit, réessaie dans un instant", 429, Number(r.headers.get("Retry-After") || 2));
  if (!r.ok) throw new ShopifyError(`Shopify a répondu ${r.status}`, 502);
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
  if (j.errors?.length) throw new ShopifyError("Shopify : " + j.errors.map((e) => e.message).join(" ; "), 502);
  return j.data as T;
}

// ---------- requêtes ----------

const Q_ORDERS = `query Orders($q: String!) { orders(first: 50, query: $q, sortKey: CREATED_AT) { nodes {
  id name createdAt cancelledAt closed displayFulfillmentStatus sourceName tags
  shippingAddress { firstName lastName }
  lineItems(first: 50) { nodes { title quantity sku variantTitle product { descriptionHtml } } } } } }`;
const Q_ONE = `query One($id: ID!) { order(id: $id) { id name note tags cancelledAt closed displayFulfillmentStatus } }`;
const M_NOTE = `mutation Note($input: OrderInput!) { orderUpdate(input: $input) { order { id note } userErrors { field message } } }`;
const M_TAG_ADD = `mutation Tag($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } } }`;
const M_TAG_DEL = `mutation Tag($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { node { id } userErrors { field message } } }`;
const Q_TRACED = `query Traced($q: String!, $after: String) { orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT, reverse: true) {
  pageInfo { hasNextPage endCursor }
  nodes { id name createdAt sourceName tags note shippingAddress { firstName lastName } } } }`;

interface RawOrder {
  id: string; name: string; createdAt: string; cancelledAt: string | null; closed: boolean;
  displayFulfillmentStatus: string; sourceName: string | null; tags: string[]; note?: string | null;
  shippingAddress: { firstName: string | null; lastName: string | null } | null;
  lineItems?: { nodes: { title: string; quantity: number; sku: string | null; variantTitle: string | null; product: { descriptionHtml: string | null } | null }[] };
}

export const canalOf = (o: Pick<RawOrder, "sourceName" | "tags">): Commande["canal"] => {
  const s = `${o.sourceName ?? ""} ${(o.tags ?? []).join(" ")}`.toLowerCase();
  return s.includes("temu") ? "Temu" : s.includes("tiktok") ? "TikTok" : "Site";
};

/** Prénom + initiale du nom : jamais l'adresse ni l'email. */
export const clientOf = (o: Pick<RawOrder, "shippingAddress">): string => {
  const a = o.shippingAddress ?? { firstName: "", lastName: "" };
  const f = (a.firstName ?? "").trim().split(/\s+/)[0] ?? "";
  const l = (a.lastName ?? "").trim();
  return (f + (l ? " " + l[0] + "." : "")).trim() || "Client";
};

const stripHtml = (h: string | null | undefined) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function toCommande(o: RawOrder): Commande {
  const lines: LigneCommande[] = (o.lineItems?.nodes ?? []).map((l) => ({
    title: l.title,
    quantity: l.quantity,
    sku: l.sku,
    variantTitle: l.variantTitle,
    fiche: BOX_RE.test(l.title) ? stripHtml(l.product?.descriptionHtml).slice(0, 700) : undefined,
  }));
  return { id: o.id, name: o.name, createdAt: o.createdAt, canal: canalOf(o), client: clientOf(o), tags: o.tags ?? [], lines };
}

/** Commandes ouvertes, non expédiées, non annulées, pas encore tracées. */
export async function openOrders(): Promise<Commande[]> {
  const d = await gql<{ orders: { nodes: RawOrder[] } }>(Q_ORDERS, { q: "fulfillment_status:unfulfilled status:open" });
  return d.orders.nodes
    .filter((o) => !o.cancelledAt && !o.closed && !o.tags.some((t) => t === TAG_OK || t === TAG_FORCE))
    .map(toCommande);
}

export interface OrderState { id: string; name: string; note: string | null; tags: string[]; cancelledAt: string | null; closed: boolean; displayFulfillmentStatus: string }

export async function orderState(id: string): Promise<OrderState | null> {
  const d = await gql<{ order: OrderState | null }>(Q_ONE, { id });
  return d.order;
}

function userErrors(x: { userErrors?: { message: string }[] } | null | undefined): string {
  return (x?.userErrors ?? []).map((e) => e.message).join(" ; ");
}

export async function setNote(id: string, note: string): Promise<void> {
  const d = await gql<{ orderUpdate: { userErrors: { message: string }[] } }>(M_NOTE, { input: { id, note } });
  const e = userErrors(d.orderUpdate);
  if (e) throw new ShopifyError("Note refusée : " + e, 422);
}

export async function addTags(id: string, tags: string[]): Promise<void> {
  const d = await gql<{ tagsAdd: { userErrors: { message: string }[] } }>(M_TAG_ADD, { id, tags });
  const e = userErrors(d.tagsAdd);
  if (e) throw new ShopifyError("Tag refusé : " + e, 422);
}

export async function removeTags(id: string, tags: string[]): Promise<void> {
  const d = await gql<{ tagsRemove: { userErrors: { message: string }[] } }>(M_TAG_DEL, { id, tags });
  const e = userErrors(d.tagsRemove);
  if (e) throw new ShopifyError("Tag non retiré : " + e, 422);
}

export interface TracedOrder { id: string; name: string; createdAt: string; canal: Commande["canal"]; client: string; tags: string[]; note: string | null }

/** Commandes portant un tag de traçabilité, les plus récentes d'abord (max 300). */
export async function tracedOrders(): Promise<TracedOrder[]> {
  const out: TracedOrder[] = [];
  let after: string | null = null;
  for (let page = 0; page < 3; page++) {
    const d: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawOrder[] } } =
      await gql(Q_TRACED, { q: `tag:'${TAG_OK}' OR tag:'${TAG_FORCE}'`, after });
    for (const o of d.orders.nodes) out.push({ id: o.id, name: o.name, createdAt: o.createdAt, canal: canalOf(o), client: clientOf(o), tags: o.tags, note: o.note ?? null });
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  return out;
}
