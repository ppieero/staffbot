"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "staffbot_lang";
const LANG_EVENT  = "staffbot_lang_change";

export type Lang = "es" | "en" | "fr" | "pt";

const translations: Record<Lang, Record<string, string>> = {
  es: {
    "nav.manuals":        "Manuales",
    "manuals.title":      "Manuales",
    "manuals.subtitle":   "Manuales web generados por IA para tu equipo",
  },
  en: {
    "nav.manuals":        "Manuals",
    "manuals.title":      "Manuals",
    "manuals.subtitle":   "AI-generated web manuals for your team",
  },
  fr: {
    "nav.manuals":        "Manuels",
    "manuals.title":      "Manuels",
    "manuals.subtitle":   "Manuels web générés par IA pour votre équipe",
  },
  pt: {
    "nav.manuals":        "Manuais",
    "manuals.title":      "Manuais",
    "manuals.subtitle":   "Manuais web gerados por IA para sua equipe",
  },
};

export function getLang(): Lang {
  if (typeof window === "undefined") return "es";
  return (localStorage.getItem(STORAGE_KEY) as Lang) ?? "es";
}

export function setLang(lang: Lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  window.dispatchEvent(new Event(LANG_EVENT));
}

export function useTranslation() {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    setLangState(getLang());
    const handler = () => setLangState(getLang());
    window.addEventListener(LANG_EVENT, handler);
    return () => window.removeEventListener(LANG_EVENT, handler);
  }, []);

  function t(key: string): string {
    return translations[lang]?.[key] ?? translations["en"]?.[key] ?? key;
  }

  return { t, lang };
}
