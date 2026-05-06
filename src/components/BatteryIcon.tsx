import type { CSSProperties } from 'react';

export interface BatteryIconProps {
  percent: number;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

export function BatteryIcon({
  percent,
  width = 22,
  height = 11,
  className,
  style,
}: BatteryIconProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const fillColor = clamped <= 15 ? '#d93025' : clamped <= 35 ? '#f29900' : '#1e8e3e';

  const capWidth = 2;
  const bodyWidth = width - capWidth;
  const padX = 1.5;
  const padY = 1.5;
  const innerWidth = Math.max(0, bodyWidth - padX * 2);
  const innerHeight = Math.max(0, height - padY * 2);
  const fillWidth = (innerWidth * clamped) / 100;
  const capHeight = Math.max(2, height * 0.5);
  const capY = (height - capHeight) / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={style}
      aria-hidden="true"
      role="img"
    >
      <rect
        x={0.5}
        y={0.5}
        width={bodyWidth - 1}
        height={height - 1}
        rx={1.5}
        ry={1.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.7}
      />
      <rect
        x={bodyWidth}
        y={capY}
        width={capWidth}
        height={capHeight}
        rx={0.6}
        ry={0.6}
        fill="currentColor"
        opacity={0.7}
      />
      {fillWidth > 0 ? (
        <rect
          x={padX}
          y={padY}
          width={fillWidth}
          height={innerHeight}
          rx={0.8}
          ry={0.8}
          fill={fillColor}
        />
      ) : null}
    </svg>
  );
}
