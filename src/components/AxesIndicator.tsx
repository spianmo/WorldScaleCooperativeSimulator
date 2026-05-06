export interface AxesIndicatorProps {
  label?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
  color?: string;
}

export function AxesIndicator({ label = 'WGS84' }: AxesIndicatorProps) {
  return (
    <span className="cesium-world-scene-coordinate" aria-label="地理坐标系">
      {label}
    </span>
  );
}
