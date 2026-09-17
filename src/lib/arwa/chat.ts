import fs from "node:fs";
import path from "node:path";
import { grokChat, grokImage } from "./grok";
import { buildSystemPrompt } from "./personality";
import {
  bumpStat,
  diskPhotoPath,
  generatedDir,
  getConfig,
  getUser,
  OWNER_ID,
  publicPhotoPath,
  rollDaily,
  saveUser,
} from "./store";
import type { ChatResult, UserRecord } from "./types";

const MEMORY_RE = /<!--memory\s*([\s\S]*?)-->/i;
const PHOTO_RE = /<!--photo:([a-zA-Z0-9_-]+)-->/i;
const GEN_RE = /<!--generate:([\s\S]*?)-->/i;

function wantsPhoto(text: string): boolean {
  return /صورتك|صورتكِ|صوره لك|صورة لك|سوي سيلفي|أرسلي صورة|ارسلي صوره|ارسلي صورة|صورج|صورتي|selfie|your photo/i.test(
    text,
  );
}

function wantsGenerate(text: string): boolean {
  return /ولد|ولّد|ارسم|ارسمي|سوي صورة|سوي صوره|generate|تخيليني|طلعيني/i.test(text);
}

function isSelfRequest(text: string, name = "أروى"): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`أنتِ|انتي|صورتك|مثلج|مثلِك|نفسك|${n}|arwa`, "i").test(text);
}

function stripTags(text: string): string {
  return text
    .replace(MEMORY_RE, "")
    .replace(PHOTO_RE, "")
    .replace(GEN_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseFacts(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function pickPhoto(userText: string, ids: string[]): string | undefined {
  const lower = userText.toLowerCase();
  for (const id of ids) {
    if (lower.includes(id)) return id;
  }
  if (/كافيه|قهوة|قهوه|cafe/.test(lower)) return ids.find((i) => i.includes("cafe"));
  if (/بيت|منزل|كتاب|home/.test(lower)) return ids.find((i) => i.includes("home"));
  if (/ليل|مساء|شارع|evening/.test(lower)) return ids.find((i) => i.includes("evening"));
  if (/وجه|قريب|avatar|profile/.test(lower)) return ids.find((i) => i.includes("avatar"));
  return ids.find((i) => i.includes("portrait")) ?? ids[0];
}

function isPremium(user: UserRecord, isOwner: boolean): boolean {
  if (isOwner) return true;
  return Boolean(user.subscribed && user.subscribedUntil && user.subscribedUntil > Date.now());
}

export async function chatWithArwa(opts: {
  userId: string;
  text: string;
  name?: string;
  username?: string;
  telegramId?: number;
  imageDataUrl?: string;
  isOwner?: boolean;
}): Promise<ChatResult> {
  const config = getConfig();
  console.log("[arwa] brain", config.updatedAt, (config.instructions || "").slice(0, 80));
  const isOwner = Boolean(opts.isOwner) || opts.telegramId === OWNER_ID || opts.userId === String(OWNER_ID);
  const user = rollDaily(getUser(opts.userId));

  if (opts.name && !user.name) user.name = opts.name;
  if (opts.username) user.username = opts.username;
  if (opts.telegramId) user.telegramId = opts.telegramId;

  if (user.blocked && !isOwner) {
    return { text: "", blocked: true };
  }

  if ((!config.botEnabled || config.maintenance) && !isOwner) {
    return { text: config.maintenanceMessage || "أروى مو موجودة الحين، ترجع بعد شوي 🤍" };
  }

  user.messagesToday += 1;
  if (!isPremium(user, isOwner) && user.messagesToday > config.freeMessagesPerDay) {
    saveUser(user);
    return {
      text: "وصلت حد الرسائل اليوم. اشترك بريميوم عشان نكمل بدون حد 🤍",
      needSubscribe: true,
    };
  }

  const photoIds = config.photos.map((p) => p.id);
  const system = buildSystemPrompt({ config, user, isOwner, photoIds });

  let raw: string;
  try {
    raw = await grokChat({
      system,
      history: user.messages,
      userText: opts.text,
      imageDataUrl: opts.imageDataUrl,
      config,
    });
  } catch (err) {
    console.error("[arwa] grok", err);
    const text = config.fallbackReply || "ثانية واحدة… الشبكة تلخبطت. أعد اللي قلته.";
    user.messages.push({ role: "user", content: opts.text, ts: Date.now() });
    user.messages.push({ role: "assistant", content: text, ts: Date.now() });
    user.messages = user.messages.slice(-40);
    saveUser(user);
    return { text };
  }

  const mem = raw.match(MEMORY_RE)?.[1];
  if (mem && config.autoMemory !== false) {
    for (const fact of parseFacts(mem)) {
      if (!user.facts.includes(fact)) user.facts.push(fact);
    }
    user.facts = user.facts.slice(-(config.maxFacts || 40));
  }

  let photoFile: string | undefined;
  let photoCaption: string | undefined;
  let generatedPath: string | undefined;

  const photoTag = raw.match(PHOTO_RE)?.[1];
  const genTag = raw.match(GEN_RE)?.[1]?.trim();
  const shouldPhoto = Boolean(photoTag) || wantsPhoto(opts.text);
  const shouldGen = Boolean(genTag) || wantsGenerate(opts.text);
  const mode = config.photoMode || "both";
  const allowAlbum = (mode === "album" || mode === "both") && config.autoSendPhotos !== false;
  const allowGen = (mode === "generate" || mode === "both") && config.allowUserGenerate !== false;

  if (shouldGen && allowGen) {
    if (!isPremium(user, isOwner) && user.imagesToday >= config.freeImagesPerDay) {
      const text = stripTags(raw) || "هالصورة تحتاج اشتراك بريميوم 🤍";
      user.messages.push({ role: "user", content: opts.text, ts: Date.now() });
      user.messages.push({ role: "assistant", content: text, ts: Date.now() });
      user.messages = user.messages.slice(-40);
      saveUser(user);
      bumpStat("messages");
      return { text, needSubscribe: true };
    }
    try {
      const prompt = [genTag || opts.text, config.imageStyle].filter(Boolean).join(". ");
      const buf = await grokImage(prompt, isSelfRequest(opts.text, config.characterName) || Boolean(genTag), config.lookPrompt);
      const name = `gen-${Date.now()}.jpg`;
      const abs = path.join(generatedDir(), name);
      fs.writeFileSync(abs, buf);
      generatedPath = `/arwa/generated/${name}`;
      user.imagesToday += 1;
      bumpStat("images");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      raw += `\n\nما قدرت أطلع الصورة الحين. ${msg.slice(0, 80)}`;
    }
  } else if (shouldGen && !allowGen) {
    raw += "\n\nتوليد الصور مقفل من المالك. أقدر أرسل من الألبوم.";
    if (config.photos.length > 0 && config.autoSendPhotos !== false) {
      const meta = config.photos[0];
      photoFile = publicPhotoPath(meta.file);
      photoCaption = meta.caption || undefined;
    }
  } else if (shouldPhoto && config.photos.length > 0 && allowAlbum) {
    const id = photoTag && photoIds.includes(photoTag) ? photoTag : pickPhoto(opts.text, photoIds);
    const meta = config.photos.find((p) => p.id === id) ?? config.photos[0];
    if (meta && fs.existsSync(diskPhotoPath(meta.file))) {
      photoFile = publicPhotoPath(meta.file);
      photoCaption = meta.caption || undefined;
    }
  }

  let text = stripTags(raw) || "…";
  const cap = config.maxReplyChars || 0;
  if (cap > 80 && text.length > cap) text = text.slice(0, cap).trim();

  user.messages.push({ role: "user", content: opts.text, ts: Date.now() });
  user.messages.push({
    role: "assistant",
    content: text,
    ts: Date.now(),
    photo: generatedPath || photoFile,
  });
  user.messages = user.messages.slice(-40);

  if (user.messages.length === 2 && !user.summary) {
    user.summary = "بدأنا نتكلم لتو.";
  } else if (user.messages.length % 12 === 0) {
    user.summary = user.messages
      .slice(-8)
      .map((m) => `${m.role === "user" ? "هو" : "أروى"}: ${m.content.slice(0, 80)}`)
      .join(" · ")
      .slice(0, 400);
  }

  const firstTouch = user.messages.length <= 2;
  saveUser(user);
  bumpStat("messages");
  if (firstTouch) bumpStat("users");

  return { text, photoFile, photoCaption, generatedPath };
}

export async function generateStudioPhoto(prompt: string, caption: string) {
  const { photoDir, getConfig, saveConfig } = await import("./store");
  const config = getConfig();
  const buf = await grokImage([prompt, config.imageStyle].filter(Boolean).join(". "), true, config.lookPrompt);
  const id = `shot-${Date.now()}`;
  const file = `${id}.jpg`;
  fs.writeFileSync(path.join(photoDir(), file), buf);
  config.photos.push({ id, file, caption, createdAt: Date.now() });
  saveConfig(config);
  bumpStat("images");
  return { id, file, caption, url: `/arwa/${file}` };
}
