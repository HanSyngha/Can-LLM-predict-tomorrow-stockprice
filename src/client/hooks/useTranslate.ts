import { useState, useCallback, useRef } from 'react';
import { translateApi } from '../lib/api';

interface UseTranslateReturn {
  translate: (text: string, targetLang?: 'ko' | 'en') => Promise<string>;
  isTranslating: boolean;
}

const translationCache = new Map<string, string>();

function cacheKey(text: string, lang: string): string {
  // Use first 64 chars + length as a lightweight key
  return `${lang}:${text.length}:${text.slice(0, 64)}`;
}

export function useTranslate(): UseTranslateReturn {
  const [isTranslating, setIsTranslating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const translate = useCallback(async (text: string, targetLang: 'ko' | 'en' = 'ko'): Promise<string> => {
    if (!text || !text.trim()) return text;

    const key = cacheKey(text, targetLang);
    const cached = translationCache.get(key);
    if (cached) return cached;

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setIsTranslating(true);
    try {
      const result = await translateApi.translate(text, targetLang);
      translationCache.set(key, result.translated);
      return result.translated;
    } catch {
      // Return original text on failure
      return text;
    } finally {
      setIsTranslating(false);
    }
  }, []);

  return { translate, isTranslating };
}
