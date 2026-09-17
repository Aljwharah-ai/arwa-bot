import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { getConfig, resetConfigKeepPhotos, updateConfig } from "../src/lib/arwa/store.ts";
import { applyTelegramProfile } from "../src/lib/arwa/telegram-apply.ts";
import { assertClean } from "../src/lib/arwa/safety.ts";

export type ExtraMode =
  | "new_name"
  | "new_age"
  | "new_city"
  | "new_status"
  | "new_role"
  | "new_mind"
  | "new_ins"
  | "new_dialect"
  | "new_welcome"
  | "new_look"
  | "tg_name"
  | "tg_bio"
  | "fallback"
  | "emoji_style"
  | "signoff"
  | "quick";

export function fullAdminHome() {
  const cfg = getConfig();
  return new InlineKeyboard()
    .text("شخصية جديدة", "n:start")
    .text("هوية أروى", "a:id")
    .row()
    .text("العقل", "a:mind")
    .text("التعليمات", "a:ins")
    .row()
    .text("اللهجة", "a:dialect")
    .text("الترحيب", "a:welcome")
    .row()
    .text("قيود", "a:rules")
    .text("فلاتر", "a:filters")
    .row()
    .text("ذاكرة عامة", "a:memg")
    .text("وصف الملامح", "a:look")
    .row()
    .text("سلوك الرد", "a:beh")
    .text("التفكير", "a:think")
    .row()
    .text("البحث", "a:search")
    .text("رد الاحتياط", "a:fallback")
    .row()
    .text("اسم تلجرام", "a:tgname")
    .text("نبذة تلجرام", "a:tgbio")
    .row()
    .text("صور أروى", "a:photos")
    .text("توليد صورة", "a:pgen")
    .row()
    .text("أدوات الصور", "a:img")
    .text("الحدود", "a:lim")
    .row()
    .text("ردود سريعة", "a:quick")
    .text("ختمة الرد", "a:signoff")
    .row()
    .text("المستخدمون", "a:users")
    .text("إحصائيات", "a:stats")
    .row()
    .text("إذاعة", "a:bc")
    .text("حظر", "a:block")
    .row()
    .text("اشتراكات", "a:sub")
    .text(cfg.maintenance ? "قفل الصيانة" : "صيانة", "a:maint")
    .row()
    .text(cfg.botEnabled ? "إيقاف البوت" : "تشغيل البوت", "a:toggle")
    .text("تطبيق على تلجرام", "a:applytg")
    .row();
}

export function newCharKb() {
  return new InlineKeyboard()
    .text("ابدأ من صفر", "n:fresh")
    .text("عدل الحالية", "n:edit")
    .row()
    .text("رجوع", "a:home");
}

export async function tryNewOwnerCallback(
  ctx: Context,
  data: string,
  setMode: (mode: string) => void,
): Promise<boolean> {
  if (data === "n:start") {
    await ctx.reply(
      "شخصية جديدة.\n\nتقدر تبدأ من صفر (يبقى الصور) أو تعدل الحالية حقل حقل.",
      { reply_markup: newCharKb() },
    );
    return true;
  }
  if (data === "n:fresh") {
    resetConfigKeepPhotos();
    setMode("new_name");
    await ctx.reply("انصفرت الإعدادات مع إبقاء الصور.\n\nأرسل اسم الشخصية الحين (مثال: ليان)."
    );
    return true;
  }
  if (data === "n:edit") {
    setMode("new_name");
    await ctx.reply(`الاسم الحالي: ${getConfig().characterName}\n\nأرسل الاسم الجديد، أو اكتب -للتخطي.`);
    return true;
  }
  if (data === "a:dialect") {
    setMode("new_dialect");
    await ctx.reply(`اللهجة الحالية:\n${getConfig().dialect}\n\nأرسل اللهجة الجديدة.`);
    return true;
  }
  if (data === "a:filters") {
    setMode("filters");
    await ctx.reply(`الفلاتر الحالية:\n${getConfig().filters}\n\nأرسل الفلاتر الجديدة.`);
    return true;
  }
  if (data === "a:look") {
    setMode("new_look");
    await ctx.reply(`وصف الملامح:\n${getConfig().lookPrompt}\n\nأرسل وصف إنجليزي للوجه.`);
    return true;
  }
  if (data === "a:fallback") {
    setMode("fallback");
    await ctx.reply(`رد الاحتياط:\n${getConfig().fallbackReply}\n\nأرسل الرد الجديد.`);
    return true;
  }
  if (data === "a:tgname") {
    setMode("tg_name");
    await ctx.reply(`اسم تلجرام: ${getConfig().telegramName}\n\nأرسل الاسم الجديد.`);
    return true;
  }
  if (data === "a:tgbio") {
    setMode("tg_bio");
    await ctx.reply(`النبذة: ${getConfig().telegramBio}\n\nأرسل النبذة الجديدة.`);
    return true;
  }
  if (data === "a:quick") {
    setMode("quick");
    await ctx.reply(`الردود السريعة:\n${getConfig().quickReplies}\n\nأرسل سطر لكل زر.`);
    return true;
  }
  if (data === "a:signoff") {
    setMode("signoff");
    await ctx.reply("أرسل نص الختمة، أو اكتب قفل لإلغائها."
    );
    return true;
  }
  if (data === "a:applytg") {
    try {
      await applyTelegramProfile();
      await ctx.reply("انطبق الاسم والنبذة على تلجرام.", { reply_markup: fullAdminHome() });
    } catch (err) {
      await ctx.reply(err instanceof Error ? err.message : "فشل التطبيق");
    }
    return true;
  }
  return false;
}

function skip(text: string) {
  return text.trim() === "-" || text.trim() === "تخطي" || text.trim() === "كما هي";
}

export async function tryNewOwnerText(
  ctx: Context,
  text: string,
  mode: string,
  setMode: (mode: string) => void,
): Promise<boolean> {
  const v = text.trim();
  try {
    if (v && v !== "-" && v !== "قفل") assertClean(v, mode);
  } catch (err) {
    await ctx.reply(err instanceof Error ? err.message : "مرفوض");
    return true;
  }

  const next = async (label: string, prompt: string, modeNext: string) => {
    await ctx.reply(`${label}\n\n${prompt}`);
    setMode(modeNext);
  };

  if (mode === "new_name") {
    if (!skip(v)) updateConfig({ characterName: v.slice(0, 40), telegramName: v.slice(0, 64) });
    await next("تم الاسم.", "أرسل العمر رقم (مثال: 23) أو -", "new_age");
    return true;
  }
  if (mode === "new_age") {
    const n = Number(v);
    if (!skip(v) && Number.isFinite(n) && n >= 18 && n <= 80) updateConfig({ characterAge: n });
    await next("تم العمر.", "أرسل المدينة أو -", "new_city");
    return true;
  }
  if (mode === "new_city") {
    if (!skip(v)) updateConfig({ characterCity: v.slice(0, 40) });
    await next("تم المدينة.", "أرسل الوضع (مثال: عزبة / متزوجة) أو -", "new_status");
    return true;
  }
  if (mode === "new_status") {
    if (!skip(v)) updateConfig({ characterStatus: v.slice(0, 80) });
    await next("تم الوضع.", "أرسل الدور مع الناس أو -", "new_role");
    return true;
  }
  if (mode === "new_role") {
    if (!skip(v)) updateConfig({ characterRole: v.slice(0, 80) });
    await next("تم الدور.", "أرسل نص العقل/الشخصية كاملاً أو -", "new_mind");
    return true;
  }
  if (mode === "new_mind") {
    if (!skip(v)) updateConfig({ personality: v.slice(0, 8000) });
    await next("تم العقل.", "أرسل التعليمات الملزمة أو -", "new_ins");
    return true;
  }
  if (mode === "new_ins") {
    if (!skip(v)) updateConfig({ instructions: v.slice(0, 8000) });
    await next("تم التعليمات.", "أرسل اللهجة أو -", "new_dialect");
    return true;
  }
  if (mode === "new_dialect") {
    if (!skip(v)) updateConfig({ dialect: v.slice(0, 800) });
    await next("تم اللهجة.", "أرسل رسالة الترحيب أو -", "new_welcome");
    return true;
  }
  if (mode === "new_welcome") {
    if (!skip(v)) updateConfig({ welcome: v.slice(0, 2000) });
    const c = getConfig();
    setMode("none");
    await ctx.reply(
      `جهزت الشخصية.\n\n${c.characterName} · ${c.characterAge} · ${c.characterCity}\n${c.characterStatus} · ${c.characterRole}`,
      { reply_markup: fullAdminHome() },
    );
    return true;
  }
  if (mode === "new_look") {
    if (!skip(v)) updateConfig({ lookPrompt: v.slice(0, 800) });
    setMode("none");
    await ctx.reply("تم وصف الملامح.", { reply_markup: fullAdminHome() });
    return true;
  }
  if (mode === "fallback") {
    if (!skip(v)) updateConfig({ fallbackReply: v.slice(0, 400) });
    setMode("none");
    await ctx.reply("تم رد الاحتياط.", { reply_markup: fullAdminHome() });
    return true;
  }
  if (mode === "tg_name") {
    if (!skip(v)) updateConfig({ telegramName: v.slice(0, 64) });
    setMode("none");
    await ctx.reply("تم اسم تلجرام.", { reply_markup: fullAdminHome() });
    return true;
  }
  if (mode === "tg_bio") {
    if (!skip(v)) updateConfig({ telegramBio: v.slice(0, 120) });
    setMode("none");
    await ctx.reply("تم النبذة.", { reply_markup: fullAdminHome() });
    return true;
  }
  if (mode === "quick") {
    if (!skip(v)) updateConfig({ quickReplies: v.slice(0, 500) });
    setMode("none");
    await ctx.reply("تم الردود السريعة.", { reply_markup: fullAdminHome() });
    return true;
  }
  if (mode === "signoff") {
    if (v === "قفل") updateConfig({ signOff: false, signOffText: "" });
    else if (!skip(v)) updateConfig({ signOff: true, signOffText: v.slice(0, 80) });
    setMode("none");
    await ctx.reply("تم الختمة.", { reply_markup: fullAdminHome() });
    return true;
  }
  if (mode === "emoji_style") {
    if (!skip(v)) updateConfig({ emojiStyle: v.slice(0, 400) });
    setMode("none");
    await ctx.reply("تم الرموز.", { reply_markup: fullAdminHome() });
    return true;
  }
  return false;
}
