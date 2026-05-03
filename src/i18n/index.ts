import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { defaultLocale, resources, supportedLocales } from './resources';

export type AppLocale = (typeof supportedLocales)[number];

export const i18n = i18next.createInstance();

// 先把最小国际化底座初始化起来，后续页面直接复用这个实例即可。
void i18n.use(initReactI18next).init({
  resources,
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: [...supportedLocales],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export async function setAppLocale(locale: AppLocale) {
  await i18n.changeLanguage(locale);
}

export function getInitialLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  const storedLocale = window.localStorage.getItem('world-scale-simulator.locale');
  if (storedLocale === 'zh-CN' || storedLocale === 'en-US') {
    return storedLocale;
  }

  const browserLocale = window.navigator.language;
  if (browserLocale.startsWith('en')) {
    return 'en-US';
  }

  return defaultLocale;
}

export * from './resources';
export * from './formatters';
