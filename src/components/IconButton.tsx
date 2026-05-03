import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { tx } from '../i18n';

export type IconButtonTone = 'ghost' | 'subtle' | 'accent' | 'danger';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label?: string;
  tone?: IconButtonTone;
  active?: boolean;
}

export function IconButton({
  icon,
  label,
  tone = 'ghost',
  active = false,
  title,
  style,
  type = 'button',
  ...buttonProps
}: IconButtonProps) {
  const resolvedTone = active ? 'accent' : tone;
  const ariaLabel = label ?? title ?? tx('common.open');
  const toneClassNames: Record<IconButtonTone, string> = {
    ghost: 'border-transparent bg-transparent text-sim-muted hover:bg-sim-panel-alt hover:text-sim-text',
    subtle: 'border-sim-border bg-sim-panel text-sim-text hover:bg-sim-panel-alt',
    accent: 'border-transparent bg-sim-primary text-sim-on-primary hover:bg-sim-primary-strong',
    danger: 'border-sim-danger-border bg-sim-danger-bg text-sim-danger',
  };

  return (
    <span className="sim-icon-button-wrap" data-tooltip={ariaLabel}>
      <button
        {...buttonProps}
        type={type}
        aria-label={ariaLabel}
        title={title ?? label}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-[20px] leading-none transition [transition-property:opacity,background-color,border-color,color] ${buttonProps.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'} ${toneClassNames[resolvedTone]} ${buttonProps.className ?? ''}`}
        style={style}
      >
        <span aria-hidden="true" className="inline-flex items-center justify-center">
          {icon}
        </span>
      </button>
      <span className="sim-icon-tooltip" role="tooltip">{ariaLabel}</span>
    </span>
  );
}
