import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { FiArrowDown, FiPause, FiPlay } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { formatTime } from '../i18n';

export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

export interface TerminalEntry {
  id?: string | number;
  timestamp?: string | Date;
  level?: LogLevel;
  source?: string;
  message: string;
}

export interface TerminalLogProps {
  title?: string;
  entries?: TerminalEntry[];
  prompt?: string;
  emptyText?: string;
  maxHeight?: number | string;
}

const levelClassNames: Record<LogLevel, string> = {
  debug: 'sim-log-debug',
  info: 'sim-log-info',
  success: 'sim-log-success',
  warn: 'sim-log-warn',
  error: 'sim-log-error',
};

function formatTimestamp(timestamp?: string | Date) {
  if (!timestamp) {
    return '';
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }

  return formatTime(date);
}

export function TerminalLog({
  title = 'Terminal Log',
  entries = [],
  prompt = '$',
  emptyText,
  maxHeight,
}: TerminalLogProps) {
  const { t } = useTranslation();
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const logPanelStyle = maxHeight === undefined ? undefined : ({
    '--sim-terminal-log-max-height': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
  } as CSSProperties);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior,
    });
  }, []);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }

    scrollToBottom('auto');
  }, [autoScroll, entries.length, scrollToBottom]);

  useEffect(() => {
    if (!autoScroll) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => scrollToBottom('auto'));
    return () => window.cancelAnimationFrame(frameId);
  }, [autoScroll, entries, scrollToBottom]);

  return (
    <section className="sim-terminal-log grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[8px] border border-sim-terminal-border bg-sim-terminal-bg text-sim-terminal-fg">
      <div className="flex items-center justify-between gap-3 border-b border-sim-terminal-border px-4 py-3">
        <div className="font-mono text-[13px] font-medium leading-[1.38] tracking-normal">{title}</div>
        <div className="sim-log-toolbar">
          <span className="text-xs text-sim-terminal-dim">{t('terminal.count', { count: entries.length })}</span>
          <span
            className="sim-log-control-wrap"
            data-tooltip={autoScroll ? t('terminal.disableAutoScroll') : t('terminal.enableAutoScroll')}
          >
            <button
              type="button"
              className="sim-log-control-button"
              aria-label={autoScroll ? t('terminal.disableAutoScroll') : t('terminal.enableAutoScroll')}
              aria-pressed={autoScroll}
              title={autoScroll ? t('terminal.disableAutoScrollTitle') : t('terminal.enableAutoScrollTitle')}
              onClick={() => setAutoScroll((current) => !current)}
            >
              {autoScroll ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}
            </button>
            <span className="sim-log-control-tooltip" role="tooltip">
              {autoScroll ? t('terminal.disableAutoScroll') : t('terminal.enableAutoScroll')}
            </span>
          </span>
          <span className="sim-log-control-wrap" data-tooltip={t('terminal.scrollToBottom')}>
            <button
              type="button"
              className="sim-log-control-button"
              aria-label={t('terminal.scrollToBottom')}
              title={t('terminal.scrollToBottomTitle')}
              onClick={() => scrollToBottom()}
            >
              <FiArrowDown aria-hidden="true" />
            </button>
            <span className="sim-log-control-tooltip" role="tooltip">{t('terminal.scrollToBottom')}</span>
          </span>
        </div>
      </div>

      <div
        ref={scrollAreaRef}
        className="sim-scroll-area sim-log-panel"
        style={logPanelStyle}
      >
        {entries.length ? (
          <div className="sim-log-list">
            {entries.map((entry, index) => {
              const level = entry.level ?? 'info';
              return (
                <div
                  key={entry.id ?? `${entry.timestamp ?? 'log'}-${index}`}
                  className="sim-log-row"
                >
                  <span className="text-xs text-sim-terminal-dim">{formatTimestamp(entry.timestamp)}</span>
                  <span className={`text-xs uppercase ${levelClassNames[level]}`}>
                    {prompt} {level}
                  </span>
                  <span className="text-[13px] leading-[1.6] text-sim-terminal-fg">
                    {entry.source ? <span className="text-sim-terminal-dim">[{entry.source}] </span> : null}
                    {entry.message}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-2.5 py-5 text-center text-[13px] text-sim-terminal-dim">
            {emptyText ?? t('terminal.empty')}
          </div>
        )}
      </div>
    </section>
  );
}
