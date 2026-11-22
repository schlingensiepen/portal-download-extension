// The panel's texts in the language the user chose, or else in the browser's.
//
// The browser's own lookup (i18n.getMessage) follows the browser's language only, so the panel
// reads the same _locales/<code>/messages.json files itself. The manifest's name and description
// stay with the browser.

/** Every language the extension speaks, by its folder under _locales, named in itself. */
export const LANGUAGES = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  pt_BR: "Português (Brasil)",
  pt_PT: "Português (Portugal)",
  zh_CN: "简体中文",
  zh_TW: "繁體中文",
};

/** The folder for a browser language such as "pt-BR", "fr-CA" or "zh-HK"; English when none fits. */
export function resolve(ui) {
  const [lang, region = ""] = String(ui || "en").replace("_", "-").split("-");
  const l = lang.toLowerCase(), r = region.toUpperCase();
  if (l === "pt") return r === "BR" ? "pt_BR" : "pt_PT";
  if (l === "zh") return ["TW", "HK", "MO", "HANT"].includes(r) ? "zh_TW" : "zh_CN";
  return LANGUAGES[l] ? l : "en";
}

/** The language tag for dates and numbers: "pt_BR" → "pt-BR". */
export const tag = (code) => code.replace("_", "-");

/** A message with its $1 … $9 filled in; "$$" stands for a dollar sign. */
export function fill(message, subs) {
  return message.replace(/\$(\$|\d)/g, (_, d) => (d === "$" ? "$" : subs[Number(d) - 1] ?? ""));
}

/** Loads the chosen language ("auto": the browser's), with English for any key it lacks. */
export async function load(api, choice) {
  const code = !choice || choice === "auto" || !LANGUAGES[choice] ? resolve(api.i18n.getUILanguage()) : choice;
  const read = async (c) => {
    try { return await (await fetch(api.runtime.getURL(`_locales/${c}/messages.json`))).json(); } catch { return {}; }
  };
  const en = await read("en");
  const own = code === "en" ? en : await read(code);
  const t = (key, ...subs) => {
    const m = (own[key] || en[key] || {}).message;
    return m === undefined ? key : fill(m, subs.map(String));
  };
  return { code, t };
}
