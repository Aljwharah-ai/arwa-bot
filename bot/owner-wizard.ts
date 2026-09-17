import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { getConfig, updateConfig, OWNER_ID } from "../src/lib/arwa/store.ts";
import { assertClean } from "../src/lib/arwa/safety.ts";

export const OWNER_CHAT_BUTTONS = [
  "لوحة المالك",
  "شخصية جديدة",
  "تغيير الهوية",
  "التعليمات",
  "العقل",
  "اللهجة",
  "الترحيب",
  "اسم تلجرام",
  "وصف الشكل",
  "صورة أروى",
  "اشتراك",
  "وش تتذكرين؟",
] as const;

export type WizardStep =
  | "none"
  | "n_name"
  | "n_age"
  | "n_city"
  | "n_status"
  | "n_role"
  | "n_look"
  | "n_mind"
  | "n_ins"
  | "n_welcome"
  | "look"
  | "dialect"
  | "tgname"
  | "tgbio";

const step = new Map<number, WizardStep>();
const draft = new Map<number, Record<string, string>>();

export function getWizardStep(id: number): WizardStep {
  return step.get(id) ?? "none";
}

export function resetWizard(id = OWNER_ID) {
  step.set(id, "none");
  draft.delete(id);
}

export function characterMenu() {
  return new InlineKeyboard()
    .text("شخصية جديدة", "w:new")
    .text("الهوية", "a:id")
    .row()
    .text("العقل", "a:mind")
    .text("التعليمات", "a:ins")
    .row()
    .text("اللهجة", "w:dialect")
    .text("وصف الشكل", "w:look")
    .row()
    .text("الترحيب", "a:welcome")
    .text("اسم تلجرام", "w:tgname")
    .row()
    .text("النبذة", "w:tgbio")
    .text("السلوك", "a:beh")
    .row()
    .text("الصور", "a:photos")
    .text("القيود", "a:rules")
    .row()
    .text("رجوع للوحة", "a:home");
}

function ask(next: WizardStep, text: string) {
  step.set(OWNER_ID, next);
  return text;
}

export async function startNewCharacter(ctx: Context) {
  draft.set(OWNER_ID, {});
  step.set(OWNER_ID, "n_name");
  await ctx.reply(
    "نبني شخصية جديدة. هالحين الحالي ينستبدل.\n\n1) أرسل الاسم (مثال: ليان).",
  );
}

export async function handleWizardCallback(ctx: Context, data: string): Promise<boolean> {
  if (data === "w:new" || data === "a:new") {
    await startNewCharacter(ctx);
    return true;
  }
  if (data === "w:char") {
    await ctx.reply("تعديل الشخصية", { reply_markup: characterMenu() });
    return true;
  }
  if (data === "w:look") {
    step.set(OWNER_ID, "look");
    await ctx.reply(`وصف الشكل الحالي:\n${getConfig().lookPrompt || "—"}\n\nأرسل الوصف الجديد بالإنجليزي.`);
    return true;
  }
  if (data === "w:dialect") {
    step.set(OWNER_ID, "dialect");
    await ctx.reply(`اللهجة الحالية:\n${getConfig().dialect || "—"}\n\nأرسل لهجة الكلام الجديدة.`);
    return true;
  }
  if (data === "w:tgname") {
    step.set(OWNER_ID, "tgname");
    await ctx.reply(`اسم تلجرام الحالي: ${getConfig().telegramName || "—"}\nأرسل الاسم الجديد.`);
    return true;
  }
  if (data === "w:tgbio") {
    step.set(OWNER_ID, "tgbio");
    await ctx.reply(`النبذة الحالية:\n${getConfig().telegramBio || "—"}\nأرسل نبذة جديدة (حد أقصر 120).`);
    return true;
  }
  return false;
}

export async function handleOwnerChatButton(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from || ctx.from.id !== OWNER_ID) return false;
  if (text === "شخصية جديدة") {
    await startNewCharacter(ctx);
    return true;
  }
  if (text === "تغيير الهوية") {
    await ctx.reply("تعديل كل ما يخص الشخصية", { reply_markup: characterMenu() });
    return true;
  }
  if (text === "التعليمات") {
    await ctx.reply(`التعليمات الحالية:\n\n${getConfig().instructions || "—"}\n\nأرسل التعليمات الجديدة.`);
    step.set(OWNER_ID, "n_ins");
    return true;
  }
  if (text === "العقل") {
    await ctx.reply(`العقل الحالي:\n\n${getConfig().personality}\n\nأرسل نص العقل الجديد.`);
    step.set(OWNER_ID, "n_mind");
    return true;
  }
  if (text === "اللهجة") {
    return handleWizardCallback(ctx, "w:dialect");
  }
  if (text === "الترحيب") {
    await ctx.reply(`الترحيب الحالي:\n\n${getConfig().welcome}\n\nأرسل ترحيب جديد.`);
    step.set(OWNER_ID, "n_welcome");
    return true;
  }
  if (text === "اسم تلجرام") {
    return handleWizardCallback(ctx, "w:tgname");
  }
  if (text === "وصف الشكل") {
    return handleWizardCallback(ctx, "w:look");
  }
  return false;
}

export async function handleWizardText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from || ctx.from.id !== OWNER_ID) return false;
  const cur = step.get(OWNER_ID) ?? "none";
  if (cur === "none") return false;

  const d = draft.get(OWNER_ID) ?? {};

  try {
    if (cur === "look") {
      assertClean(text, "وصف الشكل");
      updateConfig({ lookPrompt: text });
      resetWizard();
      await ctx.reply("انحفظ وصف الشكل.");
      return true;
    }
    if (cur === "dialect") {
      assertClean(text, "اللهجة");
      updateConfig({ dialect: text });
      resetWizard();
      await ctx.reply("انحفظت اللهجة.");
      return true;
    }
    if (cur === "tgname") {
      updateConfig({ telegramName: text.slice(0, 64) });
      resetWizard();
      await ctx.reply("انحفظ اسم تلجرام. من اللوحة اضغط تطبيق تلجرام إذا كان موجود.");
      return true;
    }
    if (cur === "tgbio") {
      updateConfig({ telegramBio: text.slice(0, 120) });
      resetWizard();
      await ctx.reply("انحفظت النبذة.");
      return true;
    }
    if (cur === "n_name") {
      d.name = text.slice(0, 40);
      draft.set(OWNER_ID, d);
      await ctx.reply(ask("n_age", "2) العمر؟ رقم فقط (من 18)." ));
      return true;
    }
    if (cur === "n_age") {
      d.age = String(Math.min(80, Math.max(18, Number(text) || 23)));
      draft.set(OWNER_ID, d);
      await ctx.reply(ask("n_city", "3) المدينة؟"));
      return true;
    }
    if (cur === "n_city") {
      d.city = text.slice(0, 40);
      draft.set(OWNER_ID, d);
      await ctx.reply(ask("n_status", "4) الوضع الاجتماعي؟ (عزباء / متزوجة / مرتبطة…)"));
      return true;
    }
    if (cur === "n_status") {
      d.status = text.slice(0, 80);
      draft.set(OWNER_ID, d);
      await ctx.reply(ask("n_role", "5) الدور أو الوصف القصير؟"));
      return true;
    }
    if (cur === "n_role") {
      assertClean(text, "الدور");
      d.role = text.slice(0, 80);
      draft.set(OWNER_ID, d);
      await ctx.reply(ask("n_look", "6) وصف الشكل بالإنجليزي (للصور). أو اكتب - للتخطي."));
      return true;
    }
    if (cur === "n_look") {
      if (text.trim() !== "-") {
        assertClean(text, "وصف الشكل");
        d.look = text;
        draft.set(OWNER_ID, d);
      }
      await ctx.reply(ask("n_mind", "7) اكتب العقل/الشخصية كاملاً."));
      return true;
    }
    if (cur === "n_mind") {
      assertClean(text, "العقل");
      d.mind = text;
      draft.set(OWNER_ID, d);
      await ctx.reply(ask("n_ins", "8) التعليمات الثابتة؟ أو - للتخطي."));
      return true;
    }
    if (cur === "n_ins") {
      if (text.trim() !== "-") {
        assertClean(text, "التعليمات");
        d.ins = text;
        draft.set(OWNER_ID, d);
      }
      await ctx.reply(ask("n_welcome", "9) رسالة الترحيب؟ أو - للتخطي."));
      return true;
    }
    if (cur === "n_welcome") {
      if (text.trim() !== "-") d.welcome = text;
      const name = d.name || "أروى";
      updateConfig({
        characterName: name,
        characterAge: Number(d.age) || 23,
        characterCity: d.city || "الرياض",
        characterStatus: d.status || "",
        characterRole: d.role || "",
        telegramName: name,
        lookPrompt: d.look || getConfig().lookPrompt,
        personality: d.mind || getConfig().personality,
        instructions: d.ins || getConfig().instructions,
        welcome: d.welcome || `هلا {name}، أنا ${name}.`,
      });
      resetWizard();
      await ctx.reply(
        `تمت الشخصية الجديدة: ${name}.\nتشتغل من رسالة الدردشة الجاية.`,
        { reply_markup: characterMenu() },
      );
      return true;
    }
  } catch (err) {
    await ctx.reply(err instanceof Error ? err.message : "ما انحفظ");
    return true;
  }
  return false;
}
