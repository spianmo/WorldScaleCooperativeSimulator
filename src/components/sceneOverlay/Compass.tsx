import { useTranslation } from 'react-i18next';

export interface CompassProps {
  headingDeg: number;
  onResetNorth?: () => void;
}

export function Compass({ headingDeg, onResetNorth }: CompassProps) {
  const { t } = useTranslation();
  const label = t('worldWindowExtra.scene.compass');
  const rotation = -headingDeg;

  return (
    <button
      type="button"
      className="scene-compass"
      aria-label={label}
      title={label}
      onClick={onResetNorth}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="29" className="scene-compass-ring" />
        <circle cx="32" cy="32" r="24" className="scene-compass-inner" />
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '32px 32px', transition: 'transform 120ms linear' }}>
          <polygon points="32,8 36,32 32,28 28,32" className="scene-compass-needle-n" />
          <polygon points="32,56 28,32 32,36 36,32" className="scene-compass-needle-s" />
          <line x1="32" y1="14" x2="32" y2="50" className="scene-compass-axis" />
          <line x1="14" y1="32" x2="50" y2="32" className="scene-compass-axis" />
        </g>
        <text x="32" y="14" textAnchor="middle" className="scene-compass-letter">N</text>
      </svg>
    </button>
  );
}
