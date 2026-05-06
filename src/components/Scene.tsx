import type { CSSProperties, ReactNode } from 'react';

export interface SceneProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  cameraMode?: 'orbit' | 'first_person';
  background?: string;
  minHeight?: number | string;
}

export function Scene({ children, className, style, minHeight = 380 }: SceneProps) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--sim-color-border)',
        background: 'var(--sim-color-scene-bg)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
