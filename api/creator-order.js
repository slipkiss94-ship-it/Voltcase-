// Vercel serverless function. Uses SECRET keys from Vercel Environment Variables only.
// Prices are re-read from the database here, so customers cannot change them.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) return res.status(500).json({ error: "Store is not configured yet." });
  const b = req.body || {};
  const clean = (s, n) => String(s || "").trim().slice(0, n);
  const name = clean(b.name, 100), phone = clean(b.phone, 30), email = clean(b.email, 120), address = clean(b.address, 500);
  const items = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!name || !/^[0-9+() \-]{7,30}$/.test(phone) || !/^\S+@\S+\.\S+$/.test(email) || address.length < 10 ||
      !items.length || !items.every(i => uuid.test(String(i.variant_id))))
    return res.status(400).json({ error: "Please complete all fields correctly." });
  const H = { apikey: KEY, "Content-Type": "application/json" };
  if (KEY.startsWith("eyJ")) H.Authorization = "Bearer " + KEY; // only old-style JWT keys use this header
  try {
    const ids = [...new Set(items.map(i => i.variant_id))].join(",");
    const vr = await fetch(`${URL}/rest/v1/variants?id=in.(${ids})&select=id,label,price_zar,products(name,active)`, { headers: H });
    const vars = await vr.json();
    let total = 0; const lines = [];
    for (const i of items) {
      const v = Array.isArray(vars) && vars.find(x => x.id === i.variant_id), q = Math.floor(+i.qty);
      if (!v || !v.products || !v.products.active || !(q >= 1 && q <= 20))
        return res.status(400).json({ error: "An item in your cart is no longer available." });
      total += v.price_zar * q;
      lines.push({ product_name: v.products.name, variant_label: v.label, qty: q, price_zar: v.price_zar });
    }
    total = Math.round(total * 100) / 100;
    const or = await fetch(`${URL}/rest/v1/orders`, { method: "POST", headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ name, phone, email, address, total_zar: total }) });
    if (!or.ok) throw new Error("order");
    const [order] = await or.json();
    const ir = await fetch(`${URL}/rest/v1/order_items`, { method: "POST", headers: H,
      body: JSON.stringify(lines.map(l => ({ ...l, order_id: order.id }))) });
    if (!ir.ok) throw new Error("items");
    return res.status(200).json({ ref: order.ref, total });
  } catch (e) {
    return res.status(500).json({ error: "Could not save your order. Please try again." });
  }
};
