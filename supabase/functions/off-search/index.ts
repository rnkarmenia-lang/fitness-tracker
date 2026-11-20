// Supabase Edge Function "off-search": relays Open Food Facts name search for the app.
// Open Food Facts search does not allow direct browser calls, so the app calls this instead.
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via Editor,
// name it off-search, paste this file, Deploy.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const FIELDS = "code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q && req.method === "POST") {
    try { q = (await req.json()).q ?? ""; } catch (_) { /* no body */ }
  }
  q = String(q).trim().slice(0, 80);
  if (!q) return json({ products: [] });

  const headers = { "User-Agent": "FitnessTracker/1.0 (personal nutrition app)" };
  // New search service first, classic search as a fallback.
  try {
    const r = await fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&fields=${FIELDS}`, { headers });
    if (r.ok) { const j = await r.json(); return json({ products: j.hits ?? [] }); }
  } catch (_) { /* try classic */ }
  try {
    const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`, { headers });
    if (r.ok) { const j = await r.json(); return json({ products: j.products ?? [] }); }
    return json({ error: `Open Food Facts answered ${r.status}` }, 502);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
