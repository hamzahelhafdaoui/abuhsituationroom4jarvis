import { createServerFn } from "@tanstack/react-start";

/** Arabic (or other non-Latin) headline → English via MyMemory. No key. */
export const translateToEn = createServerFn({ method: "POST" })
  .inputValidator((data: { text: string }) => {
    const text = String(data?.text ?? "").slice(0, 420);
    if (!text.trim()) throw new Error("empty");
    return { text };
  })
  .handler(async ({ data }) => {
    const text = data.text;
    if (!/[^\u0000-\u007F]/.test(text)) {
      return { original: text, translated: text, note: "already latin" };
    }
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ar|en`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { original: text, translated: text, note: "translate failed" };
    const json = (await res.json()) as { responseData?: { translatedText?: string } };
    const translated = json.responseData?.translatedText || text;
    return { original: text, translated, note: translated === text ? "unchanged" : "ar→en" };
  });
