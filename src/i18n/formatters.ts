import { i18n, type AppLocale } from './index';

export type TranslateParams = Record<string, string | number | boolean | null | undefined>;

export function tx(key: string, params?: TranslateParams) {
  return i18n.t(key, params);
}

export function currentLocale(): AppLocale {
  return (i18n.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN');
}

export function formatCount(key: string, count: number) {
  return tx(key, { count });
}

export function formatTime(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString(currentLocale(), {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatMetersRange(min: number, max: number) {
  return tx('format.metersRange', { min, max });
}

export function formatPercent(value: number) {
  return tx('format.percent', { value: Math.round(value) });
}

export function formatWatts(value: number) {
  return tx('format.watts', { value: Math.round(value) });
}
