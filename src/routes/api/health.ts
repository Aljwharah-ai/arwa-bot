import { createFileRoute } from "@tanstack/react-router";

async function ensureWebhook() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (!process.env.VERCEL || !host) return null;
  const { TOKEN } = await import("../../../bot/index.ts");
  const url = `https://${host}/api/telegram`;
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, allowed_updates: ["message", "callback_query", "pre_checkout_query"] }),
  });
  return { url, telegram: await res.json() };
}

async function probeGrok() {
  const key =
    process.env.XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim() ||
    process.env.XAI_KEY?.trim() ||
    "";
  if (!key) return { ok: false, error: "no key", names: Object.keys(process.env).filter((k) => /XAI|GROK|OPENAI/i.test(k)) };
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || "grok-4.5",
        messages: [{ role: "user", content: "قل هاي" }],
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const raw = await res.text();
    return { ok: res.ok, status: res.status, raw: raw.slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const { getConfig, getBotStatus } = await import("@/lib/arwa/store");
        const { aiAvailable } = await import("@/lib/arwa/grok");
        const cfg = getConfig();
        const hook = await ensureWebhook().catch((err) => ({ error: String(err) }));
        const grok = await probeGrok();
        return Response.json({
          ok: true,
          ai: aiAvailable(),
          updatedAt: cfg.updatedAt,
          name: cfg.characterName,
          bot: getBotStatus().username,
          hook,
          grok,
        });
      },
    },
  },
});
