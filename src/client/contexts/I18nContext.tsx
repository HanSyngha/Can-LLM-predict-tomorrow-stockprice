import React, { createContext, useContext, useState, useCallback } from 'react';
import ko from '../locales/ko.json';
import en from '../locales/en.json';

export type Locale = 'ko' | 'en';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'stock-evolving-locale';

const translations: Record<Locale, Record<string, unknown>> = { ko, en };

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function detectBrowserLocale(): Locale {
  try {
    const lang = navigator.language || (navigator as unknown as { languages?: readonly string[] }).languages?.[0] || '';
    if (lang.startsWith('ko')) return 'ko';
    if (lang.startsWith('en')) return 'en';
  } catch {}
  return 'ko';
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'ko' || stored === 'en') return stored;
    } catch {}
    return detectBrowserLocale();
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {}
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let value = getNestedValue(translations[locale], key);
      if (value === undefined) {
        // Fallback to Korean
        value = getNestedValue(translations['ko'], key);
      }
      if (value === undefined) return key;

      if (params) {
        return value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
          return params[name] !== undefined ? String(params[name]) : `{{${name}}}`;
        });
      }
      return value;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
