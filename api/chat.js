const hits = new Map();
const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 15;

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    if (allowedOrigin && origin && origin !== allowedOrigin) {
      return res.status(403).end();
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const required = ["OPENROUTER_API_KEY", "OPENROUTER_MODEL", "SUPABASE_URL", "SUPABASE_ANON_KEY"];
  if (required.some(name => !process.env[name])) {
    console.error("Chat API is missing required environment variables.");
    return res.status(503).json({ error: "configuration" });
  }

  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return res.status(401).json({ error: "auth" });

  let userResponse;
  try {
    userResponse = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${match[1]}`,
        apikey: process.env.SUPABASE_ANON_KEY
      },
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    console.error("Supabase authentication request failed:", error);
    return res.status(502).json({ error: "auth service" });
  }
  if (userResponse.status === 401 || userResponse.status === 403) {
    return res.status(401).json({ error: "auth" });
  }
  if (!userResponse.ok) {
    console.error("Supabase authentication returned status", userResponse.status);
    return res.status(502).json({ error: "auth service" });
  }

  let user;
  try {
    user = await userResponse.json();
  } catch (error) {
    console.error("Supabase returned an invalid user response:", error);
    return res.status(502).json({ error: "auth service" });
  }
  if (!user || typeof user.id !== "string" || !user.id) {
    return res.status(401).json({ error: "auth" });
  }

  const now = Date.now();
  const recent = (hits.get(user.id) || []).filter(time => now - time < WINDOW_MS);
  if (recent.length >= REQUEST_LIMIT) return res.status(429).json({ error: "rate" });

  const messages = req.body?.messages;
  const validMessages = Array.isArray(messages)
    && messages.length > 0
    && messages.length <= 20
    && messages.every(message =>
      message
      && ["user", "assistant"].includes(message.role)
      && typeof message.content === "string"
      && message.content.trim().length > 0
      && message.content.length <= 4000
    );
  if (!validMessages) return res.status(400).json({ error: "bad request" });

  recent.push(now);
  hits.set(user.id, recent);
  if (hits.size > 5000) {
    for (const [id, timestamps] of hits) {
      if (!timestamps.some(time => now - time < WINDOW_MS)) hits.delete(id);
    }
  }

  let upstream;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL,
        max_tokens: 800,
        temperature: 0.7,
        messages: [
          { role: "system", content: "Eres PERSONAL AI, un asistente útil y claro. Responde en el idioma del usuario." },
          ...messages.map(({ role, content }) => ({ role, content: content.trim() }))
        ]
      }),
      signal: AbortSignal.timeout(25_000)
    });
  } catch (error) {
    console.error("OpenRouter request failed:", error);
    return res.status(502).json({ error: "upstream" });
  }
  if (!upstream.ok) {
    console.error("OpenRouter returned status", upstream.status);
    return res.status(502).json({ error: "upstream" });
  }

  let result;
  try {
    result = await upstream.json();
  } catch (error) {
    console.error("OpenRouter returned an invalid response:", error);
    return res.status(502).json({ error: "upstream" });
  }
  const reply = result?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    console.error("OpenRouter response did not contain a message.");
    return res.status(502).json({ error: "upstream" });
  }
  return res.status(200).json({ reply });
}
