import { Cone, Html, Line, Text } from '@react-three/drei';

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
  const axisWidth = Math.max(2, Math.min(5, size * 2.1));
  const coneSize = Math.max(0.08, size * 0.08);
  const labelOffset = size * 0.14;
  const labelSize = Math.max(0.14, size * 0.13);
  const shaftLength = Math.max(0.05, size - coneSize);

  return (
    <group position={position} rotation={rotation}>
      {/* 参考 IMU-Visualizer 的坐标轴样式：粗线、锥形箭头、轴端 X/Y/Z 标签。 */}
      <Line
        points={[[0, 0, 0], [shaftLength, 0, 0]]}
        color="#ff3b30"
        lineWidth={axisWidth}
        transparent
        opacity={0.95}
      />
      <Cone
        args={[coneSize, coneSize * 2, 12]}
        position={[size - coneSize / 2, 0, 0]}
        rotation={[0, 0, -Math.PI / 2]}
      >
        <meshStandardMaterial color="#ff3b30" roughness={0.34} metalness={0.08} />
      </Cone>
      <Text
        position={[size + labelOffset, 0, 0]}
        fontSize={labelSize}
        color="#ff3b30"
        fontWeight={700}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#111827"
      >
        X
      </Text>

      <Line
        points={[[0, 0, 0], [0, shaftLength, 0]]}
        color="#34c759"
        lineWidth={axisWidth}
        transparent
        opacity={0.95}
      />
      <Cone
        args={[coneSize, coneSize * 2, 12]}
        position={[0, size - coneSize / 2, 0]}
      >
        <meshStandardMaterial color="#34c759" roughness={0.34} metalness={0.08} />
      </Cone>
      <Text
        position={[0, size + labelOffset, 0]}
        fontSize={labelSize}
        color="#34c759"
        fontWeight={700}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#111827"
      >
        Y
      </Text>

      <Line
        points={[[0, 0, 0], [0, 0, shaftLength]]}
        color="#0a84ff"
        lineWidth={axisWidth}
        transparent
        opacity={0.95}
      />
      <Cone
        args={[coneSize, coneSize * 2, 12]}
        position={[0, 0, size - coneSize / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color="#0a84ff" roughness={0.34} metalness={0.08} />
      </Cone>
      <Text
        position={[0, 0, size + labelOffset]}
        fontSize={labelSize}
        color="#0a84ff"
        fontWeight={700}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#111827"
      >
        Z
      </Text>

      {label ? (
        <Html position={[size * 0.28, size * 0.28, -size * 0.08]} center>
          <div
            style={{
              padding: '4px 8px',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.14)',
              background: 'rgba(4, 8, 14, 0.72)',
              color,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0,
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
