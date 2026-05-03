import { Html } from '@react-three/drei';

export interface AxesIndicatorProps {
  label?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
  color?: string;
}

export function AxesIndicator({
  label,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  size = 1.6,
  color = '#9ed0ff',
}: AxesIndicatorProps) {
  return (
    <group position={position} rotation={rotation}>
      <axesHelper args={[size]} />
      {label ? (
        <Html position={[size * 0.35, size * 0.35, 0]} center>
          <div
            style={{
              padding: '4px 8px',
              borderRadius: 9999,
              border: '1px solid rgba(255, 255, 255, 0.14)',
              background: 'rgba(4, 8, 14, 0.8)',
              color,
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
