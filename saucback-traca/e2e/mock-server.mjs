// Shopify et Claude simulés pour le test de bout en bout.
// Shopify : une commande Box Ibérique (4 produits). Claude : chaque photo = 1 produit de la box.
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const state = { note: "Merci de livrer après 18h", tags: [], calls: [] };
const order = {
  id: "gid://shopify/Order/1", name: "#2570", createdAt: "2026-10-07T07:59:09Z", cancelledAt: null, closed: false,
  displayFulfillmentStatus: "UNFULFILLED", sourceName: "web", tags: [], shippingAddress: { firstName: "Andrea", lastName: "Martin" },
  lineItems: { nodes: [{ title: "Box Ibérique – Chorizo IGP, Lomo, 1/4 Serrano ETG, Fuet Catalan", quantity: 1, sku: "SB-PDA-15", variantTitle: null, product: { descriptionHtml: "<p>Chorizo, lomo, serrano, fuet.</p>" } }] },
};
const products = ["Chorizo IGP 200 g", "Lomo 150 g", "1/4 Serrano 1,2 kg", "Fuet Catalan 160 g"];
let photo = 0;

const body = (req) => new Promise((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });
const json = (res, status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const raw = await body(req);
  const url = req.url || "";
  if (url === "/__state") return json(res, 200, state);
  if (url.endsWith("/oauth/access_token")) return json(res, 200, { access_token: "mock", scope: "read_orders", expires_in: 86399 });
  if (url.includes("/graphql.json")) {
    if (req.headers["x-shopify-access-token"] !== "mock" && req.headers["x-shopify-access-token"] !== "shpat_test") return json(res, 401, { errors: "unauthorized" });
    const { query, variables } = JSON.parse(raw);
    state.calls.push(query.slice(0, 40));
    if (query.startsWith("query Orders")) return json(res, 200, { data: { orders: { nodes: state.tags.includes("Traça OK") ? [] : [order] } } });
    if (query.startsWith("query One")) return json(res, 200, { data: { order: { id: order.id, name: order.name, note: state.note, tags: state.tags, cancelledAt: null, closed: false, displayFulfillmentStatus: "UNFULFILLED" } } });
    if (query.startsWith("mutation Note")) { state.note = variables.input.note; return json(res, 200, { data: { orderUpdate: { order: { id: order.id, note: state.note }, userErrors: [] } } }); }
    if (query.includes("tagsAdd")) { state.tags = [...new Set([...state.tags, ...variables.tags])]; return json(res, 200, { data: { tagsAdd: { node: { id: order.id }, userErrors: [] } } }); }
    if (query.includes("tagsRemove")) { state.tags = state.tags.filter((t) => !variables.tags.includes(t)); return json(res, 200, { data: { tagsRemove: { node: { id: order.id }, userErrors: [] } } }); }
    if (query.startsWith("query Traced")) return json(res, 200, { data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: state.tags.length ? [{ ...order, note: state.note, tags: state.tags }] : [] } } });
    return json(res, 400, { errors: [{ message: "requête inconnue : " + query.slice(0, 30) }] });
  }
  if (url.startsWith("/v1/messages")) {
    const b = JSON.parse(raw);
    const hasImage = JSON.stringify(b.messages).includes('"type":"image"');
    let out;
    if (hasImage) { out = { produits: [{ produit: products[photo++ % 4], lot: `L2415${photo}`, date: "12/03/2027", typeDate: "DDM", doute: false }] }; }
    else {
      const m = b.messages[0].content.match(/Étiquettes flashées dans le colis : (\[.*?\])\n/s);
      const etiq = JSON.parse(m[1]);
      const find = (w) => etiq.filter((e) => e.produit.toLowerCase().includes(w)).map((e) => e.etiquette);
      out = { attendus: [["Chorizo IGP", "chorizo"], ["Lomo", "lomo"], ["1/4 Serrano ETG", "serrano"], ["Fuet Catalan", "fuet"]].map(([p, w]) => ({ ligne: 0, produit: p, qte: 1, etiquettes: find(w) })), inconnues: [], enTrop: [] };
    }
    return json(res, 200, { id: "msg_1", type: "message", role: "assistant", model: b.model, stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 10, output_tokens: 10 } });
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, () => console.log("mock on", PORT));
