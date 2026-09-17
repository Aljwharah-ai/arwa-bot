import type { BotConfig, ChatMessage } from "./types";
import { ARWA_LOOK } from "./personality";

const CHAT_URL = "https://api.x.ai/v1/chat/completions";
const IMAGE_URL = "https://api.x.ai/v1/images/generations";
const MODEL = (process.env.XAI_MODEL || "grok-4.5").trim();

function apiKey(): string | undefined {
  return (
    process.env.XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim() ||
    process.env.XAI_KEY?.trim() ||
    undefined
  );
}

export function aiAvailable(): boolean {
  return Boolean(apiKey());
}

type GrokContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

async function postChat(key: string, body: Record<string, unknown>) {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const raw = await res.text();
  return { ok: res.ok, status: res.status, raw };
}

function parseContent(raw: string): string {
  const json = JSON.parse(raw) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[];
  };
  const msg = json.choices?.[0]?.message;
  return (msg?.content || msg?.reasoning_content || "").trim();
}

export async function grokChat(opts: {
  system: string;
  history: ChatMessage[];
  userText: string;
  imageDataUrl?: string;
  config: BotConfig;
}): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw new Error("XAI_API_KEY missing");
  }

  const messages: { role: string; content: GrokContent }[] = [
    { role: "system", content: opts.system.slice(0, 6000) },
  ];

  for (const m of opts.history.slice(-6)) {
    messages.push({ role: m.role, content: m.content.slice(0, 500) });
  }

  if (opts.imageDataUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: opts.imageDataUrl } },
        { type: "text", text: opts.userText || "وش تشوفين؟" },
      ],
    });
  } else {
    messages.push({ role: "user", content: opts.userText });
  }

  const maxTokens = 280;
  const attempts: Record<string, unknown>[] = [
    { model: MODEL, messages, max_tokens: maxTokens },
    { model: MODEL, messages, max_tokens: maxTokens, reasoning_effort: "low" },
  ];

  let last = "";
  for (const body of attempts) {
    try {
      const r = await postChat(key, body);
      last = `xAI ${r.status}: ${r.raw.slice(0, 180)}`;
      if (!r.ok) continue;
      const text = parseContent(r.raw);
      if (text) return text;
      last = "xAI empty content";
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(last || "xAI failed");
}

export async function grokImage(prompt: string, selfPortrait: boolean, look?: string): Promise<Buffer> {
  const key = apiKey();
  if (!key) throw new Error("AI is not available");

  const face = look?.trim() || ARWA_LOOK;
  const full = selfPortrait
    ? `Photorealistic photograph of ${face}. Scene: ${prompt}. Natural light, highly erotic, seductive pose, revealing or lingerie, slutty vibe.`
    : prompt;

  const res = await fetch(IMAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "grok-imagine-image",
      prompt: full,
      n: 1,
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`imagine ${res.status}: ${err.slice(0, 240)}`);
  }

  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");

  const url = json.data?.[0]?.url;
  if (!url) throw new Error("empty image");
  const img = await fetch(url);
  if (!img.ok) throw new Error("image download failed");
  return Buffer.from(await img.arrayBuffer());
}
