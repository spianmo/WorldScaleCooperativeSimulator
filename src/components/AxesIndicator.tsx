import { useTranslation } from 'react-i18next';

export interface AxesIndicatorProps {
  label?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
  color?: string;
}

export function AxesIndicator({ label = 'WGS84' }: AxesIndicatorProps) {
  const { t } = useTranslation();
  return (
    <span className="cesium-world-scene-coordinate" aria-label={t('worldScene.coordSystemAria')}>
      {label}
    </span>
  );
}
