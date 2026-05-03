import { line, max, scaleLinear, scaleTime, extent, format, curveMonotoneX } from 'd3';
import { useTranslation } from 'react-i18next';
import { formatTime } from '../i18n';

export interface TelemetryPoint {
  x: number | string | Date;
  y: number;
}

export interface TelemetrySeries {
  id: string;
  label: string;
  color?: string;
  points: TelemetryPoint[];
}

export interface TelemetryChartProps {
  title?: string;
  subtitle?: string;
  series: TelemetrySeries[];
  unit?: string;
  targetValue?: number;
  height?: number;
}

const palette = ['#1a73e8', '#1e8e3e', '#f9ab00', '#d93025', '#5f6368'];

function toDate(value: number | string | Date) {
  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}

export function TelemetryChart({
  title = 'Telemetry',
  subtitle,
  series,
  unit = '',
  targetValue,
  height = 280,
}: TelemetryChartProps) {
  const { t } = useTranslation();
  const width = 760;
  const padding = { top: 18, right: 24, bottom: 38, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const allPoints = series.flatMap((item) => item.points);
  const fallbackNow = new Date();
  const xDomain = extent(allPoints, (point) => toDate(point.x));
  const xStart = xDomain[0] ?? new Date(fallbackNow.getTime() - 60_000);
  const xEnd = xDomain[1] ?? fallbackNow;
  const yMax = max(allPoints, (point) => point.y) ?? 1;
  const yDomain: [number, number] = [0, Math.max(1, yMax * 1.15, targetValue ?? 0)];

  const xScale = scaleTime().domain([xStart, xEnd]).range([0, innerWidth]).nice();
  const yScale = scaleLinear().domain(yDomain).range([innerHeight, 0]).nice();
  const xTicks = xScale.ticks(5);
  const yTicks = yScale.ticks(5);
  const formatX = format('~s');
  const lineGenerator = line<TelemetryPoint>()
    .x((point) => xScale(toDate(point.x)))
    .y((point) => yScale(point.y))
    .curve(curveMonotoneX);

  return (
    <section className="sim-chart grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[8px] border border-sim-border bg-sim-panel text-sim-text">
      <div className="flex items-center justify-between gap-4 border-b border-sim-border-soft px-4 py-3">
        <div className="min-w-0">
          <div className="sim-section-title">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-sim-muted">{subtitle}</div> : null}
        </div>

        <div className="text-xs text-sim-muted">
          {unit ? t('chart.unit', { unit }) : t('chart.realtime')}
        </div>
      </div>

      <div className="sim-chart-body min-h-0 p-3">
        {series.length && allPoints.length ? (
          <>
            <div className="mb-3 flex flex-wrap gap-3">
              {series.map((item, index) => (
                <div key={item.id} className="inline-flex items-center gap-2 text-xs">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: item.color ?? palette[index % palette.length] }}
                  />
                  <span className="text-sim-text">{item.label}</span>
                </div>
              ))}
            </div>

            <svg
              className="sim-chart-svg"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={title}
            >
              <g transform={`translate(${padding.left}, ${padding.top})`}>
                {yTicks.map((tick) => {
                  const y = yScale(tick);
                  return (
                    <g key={`y-${tick}`}>
                      <line x1={0} x2={innerWidth} y1={y} y2={y} stroke="var(--sim-color-graph-line)" />
                      <text x={-12} y={y + 4} textAnchor="end" fontSize="11" fill="var(--sim-color-text-muted)">
                        {formatX(tick)}
                      </text>
                    </g>
                  );
                })}

                {xTicks.map((tick) => {
                  const x = xScale(tick);
                  return (
                    <g key={`x-${tick.getTime()}`}>
                      <line x1={x} x2={x} y1={0} y2={innerHeight} stroke="var(--sim-color-graph-line)" />
                      <text x={x} y={innerHeight + 22} textAnchor="middle" fontSize="11" fill="var(--sim-color-text-muted)">
                        {formatTime(tick)}
                      </text>
                    </g>
                  );
                })}

                {targetValue !== undefined ? (
                  <g>
                    <line
                      x1={0}
                      x2={innerWidth}
                      y1={yScale(targetValue)}
                      y2={yScale(targetValue)}
                      stroke="var(--sim-color-primary)"
                      strokeDasharray="6 6"
                    />
                    <text x={innerWidth} y={Math.max(12, yScale(targetValue) - 6)} textAnchor="end" fontSize="11" fill="var(--sim-color-primary)">
                      {t('chart.target', { value: targetValue })}
                      {unit ? ` ${unit}` : ''}
                    </text>
                  </g>
                ) : null}

                {series.map((item, index) => {
                  const path = lineGenerator(item.points);
                  const stroke = item.color ?? palette[index % palette.length];
                  return path ? <path key={item.id} d={path} fill="none" stroke={stroke} strokeWidth={2.5} /> : null;
                })}

                <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="var(--sim-color-graph-axis)" />
                <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke="var(--sim-color-graph-axis)" />
              </g>
            </svg>
          </>
        ) : (
          <div className="grid place-items-center text-[13px] text-sim-muted" style={{ minHeight: height - 24 }}>
            {t('chart.empty')}
          </div>
        )}
      </div>
    </section>
  );
}
