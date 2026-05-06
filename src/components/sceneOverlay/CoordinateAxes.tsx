import { useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorldSceneCameraController } from './sceneTypes';

export interface CoordinateAxesProps {
  headingDeg: number;
  pitchDeg: number;
  controllerRef?: MutableRefObject<WorldSceneCameraController | null>;
}

interface ProjectedAxis {
  id: 'x' | 'y' | 'z';
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
}

const AXIS_LENGTH = 36;
const ROTATE_SENSITIVITY_DEG_PER_PX = 0.6;
const PITCH_MIN_DEG = -89;
const PITCH_MAX_DEG = 89;

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startHeading: number;
  startPitch: number;
}

function project(axis: ProjectedAxis, headingDeg: number, pitchDeg: number) {
  // Heading rotates around screen vertical (Z-up world), pitch tilts forward.
  const headingRad = (headingDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  // World X = east, Y = up, Z = north for our display purposes.
  // Apply -heading to align so that camera-north points up.
  const cosH = Math.cos(-headingRad);
  const sinH = Math.sin(-headingRad);
  const xR = axis.x * cosH - axis.z * sinH;
  const zR = axis.x * sinH + axis.z * cosH;

  // Pitch tilts the world: when looking down, vertical axis (y) compresses.
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const yR2 = axis.y * cosP - zR * sinP;
  const zR2 = axis.y * sinP + zR * cosP;

  // 2D: x = east-west; y = vertical (negate so up is up)
  return {
    sx: xR * AXIS_LENGTH,
    sy: -yR2 * AXIS_LENGTH,
    depth: zR2,
  };
}

function clampPitch(value: number) {
  return Math.max(PITCH_MIN_DEG, Math.min(PITCH_MAX_DEG, value));
}

export function CoordinateAxes({ headingDeg, pitchDeg, controllerRef }: CoordinateAxesProps) {
  const { t } = useTranslation();
  const label = t('worldScene.coordSystemAria');

  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const interactive = Boolean(controllerRef);

  const axes = useMemo<ProjectedAxis[]>(
    () => [
      { id: 'x', label: 'X', color: '#ea4335', x: 1, y: 0, z: 0 },
      { id: 'y', label: 'Y', color: '#34a853', x: 0, y: 0, z: 1 },
      { id: 'z', label: 'Z', color: '#1a73e8', x: 0, y: 1, z: 0 },
    ],
    [],
  );

  const projected = axes
    .map((axis) => ({ axis, ...project(axis, headingDeg, pitchDeg) }))
    .sort((a, b) => a.depth - b.depth);

  const cx = 48;
  const cy = 48;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const controller = controllerRef?.current;
    if (!controller) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (!controller.beginOrbit()) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startHeading: headingDeg,
      startPitch: pitchDeg,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const controller = controllerRef?.current;
    if (!controller) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const newHeading = drag.startHeading + dx * ROTATE_SENSITIVITY_DEG_PER_PX;
    const newPitch = clampPitch(drag.startPitch + dy * ROTATE_SENSITIVITY_DEG_PER_PX);
    controller.setOrbit(newHeading, newPitch);
  };

  const releaseDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    controllerRef?.current?.endOrbit();
  };

  return (
    <div
      className={`scene-axes${interactive ? ' scene-axes--interactive' : ''}${dragging ? ' scene-axes--dragging' : ''}`}
      aria-label={label}
      role={interactive ? 'slider' : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? releaseDrag : undefined}
      onPointerCancel={interactive ? releaseDrag : undefined}
    >
      <svg viewBox="0 0 96 96" aria-hidden="true">
        {projected.map(({ axis, sx, sy }) => (
          <g key={axis.id}>
            <line
              x1={cx}
              y1={cy}
              x2={cx + sx}
              y2={cy + sy}
              stroke={axis.color}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle cx={cx + sx} cy={cy + sy} r={3.6} fill={axis.color} />
            <text
              x={cx + sx + Math.sign(sx) * 6}
              y={cy + sy + Math.sign(sy) * 6 + 3}
              fill={axis.color}
              fontSize={11}
              fontWeight={800}
              textAnchor="middle"
            >
              {axis.label}
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={3.5} fill="#1f1f1f" />
      </svg>
    </div>
  );
}
