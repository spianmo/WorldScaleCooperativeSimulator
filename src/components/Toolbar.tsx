import type { ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface ToolbarAction {
  id: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}

export interface ToolbarProps {
  title: string;
  subtitle?: string;
  actions?: ToolbarAction[];
  children?: ReactNode;
}

export function Toolbar({ title, subtitle, actions = [], children }: ToolbarProps) {
  return (
    <header className="sim-toolbar">
      <div className="sim-toolbar-main">
        <div className="sim-toolbar-heading">
          <h1 className="sim-toolbar-title">{title}</h1>
          {subtitle ? (
            <p className="sim-toolbar-subtitle">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions.length ? (
          <div className="sim-toolbar-actions">
            {actions.map((action) => (
              <IconButton
                key={action.id}
                icon={action.icon}
                label={action.label}
                title={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                active={action.active}
                tone="ghost"
              />
            ))}
          </div>
        ) : null}
      </div>

      {children ? <div className="sim-toolbar-chips">{children}</div> : null}
    </header>
  );
}
