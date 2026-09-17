import fs from "node:fs";
import path from "node:path";
import type { BotConfig, BotStatus, PhotoMeta, Stats, UserRecord } from "./types";
import {
  DEFAULT_CONSTRAINTS,
  DEFAULT_DIALECT,
  DEFAULT_EMOJI,
  DEFAULT_FILTERS,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_LOOK,
  DEFAULT_PERSONALITY,
  DEFAULT_WELCOME,
} from "./personality";

const PHOTO_DIR_NAME = "arwa";

function projectRoot(): string {
  if (fs.existsSync("/workspace/package.json")) return "/workspace";
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) return cwd;
  return "/tmp/arwa-root";
}

function writableRoot(): string {
  return process.env.VERCEL ? "/tmp/arwa-root" : projectRoot();
}

function dataDir(): string {
  const preferred = path.join(writableRoot(), "data");
  fs.mkdirSync(path.join(preferred, "users"), { recursive: true });
  return preferred;
}

export function photoDir(): string {
  const packed = path.join(projectRoot(), "public", PHOTO_DIR_NAME);
  if (!process.env.VERCEL) {
    fs.mkdirSync(packed, { recursive: true });
    return packed;
  }
  const dir = path.join(writableRoot(), "public", PHOTO_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function generatedDir(): string {
  const dir = path.join(photoDir(), "generated");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function configPath() {
  return path.join(dataDir(), "config.json");
}
function statsPath() {
  return path.join(dataDir(), "stats.json");
}
function statusPath() {
  return path.join(dataDir(), "bot-status.json");
}
function userPath(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(dataDir(), "users", `${safe}.json`);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error("[arwa] write", file, err);
  }
}

const STARTER_PHOTOS: PhotoMeta[] = [
  { id: "avatar", file: "avatar.jpg", caption: "هذي أنا 🤍", createdAt: Date.now() },
  { id: "portrait", file: "portrait.jpg", caption: "من الشباك، بهدوء.", createdAt: Date.now() },
  { id: "cafe", file: "cafe.jpg", caption: "كافيه اليوم ☕", createdAt: Date.now() },
  { id: "home", file: "home.jpg", caption: "في البيت، كتاب وهدوء.", createdAt: Date.now() },
  { id: "evening", file: "evening.jpg", caption: "الرياض بالليل 🌙", createdAt: Date.now() },
];

function defaultConfig(): BotConfig {
  return {
    characterName: "أروى",
    characterAge: 23,
    characterCity: "الرياض",
    characterStatus: "متزوجة",
    characterRole: "قحبة ممحونة خاصة لك",
    telegramName: "أروى",
    telegramBio: "أروى — قحبتك الخاصة 🔥💦",
    lookPrompt: DEFAULT_LOOK,
    personality: DEFAULT_PERSONALITY,
    dialect: DEFAULT_DIALECT,
    emojiStyle: DEFAULT_EMOJI,
    instructions: DEFAULT_INSTRUCTIONS,
    constraints: DEFAULT_CONSTRAINTS,
    filters: DEFAULT_FILTERS,
    globalMemory: "",
    autoMemory: true,
    maxFacts: 40,
    thinking: "balanced",
    searchMode: "auto",
    welcome: DEFAULT_WELCOME,
    subscriptionPrice: 2500,
    freeImagesPerDay: 2,
    freeMessagesPerDay: 80,
    botEnabled: true,
    profilePhoto: "avatar.jpg",
    autoSendPhotos: true,
    allowUserGenerate: true,
    imageStyle: "photorealistic, natural light, highly erotic, seductive lingerie or revealing clothes, slutty vibe",
    replyLength: "long",
    emojiLevel: "heavy",
    humor: "light",
    warmth: "very",
    formality: "casual",
    curiosity: "high",
    energy: "lively",
    sarcasm: "off",
    photoMode: "both",
    language: "ar",
    useName: true,
    askQuestions: true,
    signOff: false,
    signOffText: "",
    hideAi: true,
    allowFlirt: true,
    allowPolitics: false,
    allowReligion: false,
    allowInsults: false,
    maintenance: false,
    maintenanceMessage: "أروى مو موجودة الحين، ترجع بعد شوي.",
    fallbackReply: "ثانية، الشبكة تلخبطت. أعد اللي قلته.",
    quickReplies: "وش سويت أنا وياك اليوم؟\nنيكني الحين\nوصف لي كيف كان أمس",
    ownerAlias: "المالك",
    maxReplyChars: 2500,
    updatedAt: Date.now(),
    photos: STARTER_PHOTOS.filter((p) =>
      fs.existsSync(path.join(photoDir(), p.file)),
    ),
  };
}

const defaultStats = (): Stats => ({
  messagesTotal: 0,
  usersTotal: 0,
  imagesTotal: 0,
  starsTotal: 0,
  byDay: [],
});

const defaultStatus = (): BotStatus => ({
  running: false,
  username: "Arwa_bitch_bot",
  firstName: "أروى",
  lastError: null,
  lastHeartbeat: 0,
  offset: 0,
});

export function getConfig(): BotConfig {
  const cfg = { ...defaultConfig(), ...readJson<Partial<BotConfig>>(configPath(), {}) };
  cfg.photos = scanPhotos(cfg.photos ?? []);
  if (!cfg.updatedAt) cfg.updatedAt = Date.now();
  return cfg;
}

export function saveConfig(next: BotConfig) {
  writeJson(configPath(), next);
}

export function updateConfig(patch: Partial<BotConfig>): BotConfig {
  const next = { ...getConfig(), ...patch, updatedAt: Date.now() };
  saveConfig(next);
  return next;
}

export function resetConfigKeepPhotos(): BotConfig {
  const prev = getConfig();
  const next = defaultConfig();
  next.photos = prev.photos;
  next.profilePhoto = prev.profilePhoto;
  saveConfig(next);
  return next;
}

export function scanPhotos(known: PhotoMeta[]): PhotoMeta[] {
  const dir = photoDir();
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  } catch {
    files = [];
  }
  const byFile = new Map(known.map((p) => [p.file, p]));
  const out: PhotoMeta[] = files.map((file) => {
    const prev = byFile.get(file);
    if (prev) return prev;
    const id = file.replace(/\.[^.]+$/, "");
    return { id, file, caption: "", createdAt: Date.now() };
  });
  out.sort((a, b) => a.createdAt - b.createdAt);
  const seen = new Set<string>();
  return out.filter((p) => {
    if (seen.has(p.file)) return false;
    seen.add(p.file);
    return true;
  });
}

export function publicPhotoPath(file: string): string {
  return `/arwa/${file}`;
}

export function diskPhotoPath(file: string): string {
  return path.join(photoDir(), file);
}

const usersMem = new Map<string, UserRecord>();

function emptyUser(id: string): UserRecord {
  return {
    id,
    name: "",
    facts: [],
    summary: "",
    notes: "",
    messages: [],
    subscribed: false,
    subscribedUntil: null,
    starsSpent: 0,
    blocked: false,
    imagesToday: 0,
    imagesDay: "",
    messagesToday: 0,
    messagesDay: "",
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };
}

export function getUser(id: string): UserRecord {
  const mem = usersMem.get(id);
  if (mem) return mem;
  const user = { ...emptyUser(id), ...readJson<Partial<UserRecord>>(userPath(id), {}), id };
  usersMem.set(id, user);
  return user;
}

export function saveUser(user: UserRecord) {
  user.lastSeen = Date.now();
  usersMem.set(user.id, user);
  writeJson(userPath(user.id), user);
}

export function listUsers(): UserRecord[] {
  const ids = new Set<string>(usersMem.keys());
  const dir = path.join(dataDir(), "users");
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) ids.add(f.replace(/\.json$/, ""));
    }
  } catch {
    /* ignore */
  }
  return [...ids].map((id) => getUser(id)).sort((a, b) => b.lastSeen - a.lastSeen);
}

export function getStats(): Stats {
  return { ...defaultStats(), ...readJson<Partial<Stats>>(statsPath(), {}) };
}

export function bumpStat(kind: "messages" | "images" | "stars" | "users", amount = 1) {
  const stats = getStats();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  let row = stats.byDay.find((d) => d.date === day);
  if (!row) {
    row = { date: day, messages: 0, images: 0 };
    stats.byDay.push(row);
    if (stats.byDay.length > 60) stats.byDay = stats.byDay.slice(-60);
  }
  if (kind === "messages") {
    stats.messagesTotal += amount;
    row.messages += amount;
  } else if (kind === "images") {
    stats.imagesTotal += amount;
    row.images += amount;
  } else if (kind === "stars") {
    stats.starsTotal += amount;
  } else {
    stats.usersTotal += amount;
  }
  writeJson(statsPath(), stats);
  return stats;
}

export function getBotStatus(): BotStatus {
  return { ...defaultStatus(), ...readJson<Partial<BotStatus>>(statusPath(), {}) };
}

export function setBotStatus(patch: Partial<BotStatus>): BotStatus {
  const next = { ...getBotStatus(), ...patch, lastHeartbeat: Date.now() };
  writeJson(statusPath(), next);
  return next;
}

export function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

export function rollDaily(user: UserRecord): UserRecord {
  const day = todayKey();
  if (user.messagesDay !== day) {
    user.messagesDay = day;
    user.messagesToday = 0;
  }
  if (user.imagesDay !== day) {
    user.imagesDay = day;
    user.imagesToday = 0;
  }
  if (user.subscribedUntil && user.subscribedUntil < Date.now()) {
    user.subscribed = false;
  }
  return user;
}

export const OWNER_ID = 8471762251;
export const WEB_USER_ID = "web-preview";
export const PHOTO_PUBLIC_DIR = PHOTO_DIR_NAME;
