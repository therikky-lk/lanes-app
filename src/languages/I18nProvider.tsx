import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  type Locale,
  LOCALE_STORAGE_KEY,
  getStoredLocale,
  storeLocale,
} from "./locale";
import { createTranslatorSync, type TFunction } from "./translator";

interface I18nContextValue {
  locale: Locale;
  t: TFunction;
  setLocale: (locale: Locale) => void;
  loading: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const syncLocale = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === LOCALE_STORAGE_KEY || event.key === null)) {
        setLocaleState(getStoredLocale());
      }
    };
    window.addEventListener("storage", syncLocale);
    return () => window.removeEventListener("storage", syncLocale);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    storeLocale(newLocale);
    setLocaleState(newLocale);
  }, []);

  const t: TFunction = useMemo(() => createTranslatorSync(locale), [locale]);

  const value = useMemo(
    () => ({ locale, t, setLocale, loading: false }),
    [locale, t, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // fallback gracefully so components never crash during hmr or outside provider
    const locale = getStoredLocale();
    return {
      locale,
      t: createTranslatorSync(locale),
      setLocale: storeLocale,
      loading: false,
    };
  }
  return ctx;
}
