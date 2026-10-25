export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") return res.status(405).json({ error: "method" });

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Public Supabase configuration is missing.");
    return res.status(503).json({ error: "configuration" });
  }

  return res.status(200).json({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
}
