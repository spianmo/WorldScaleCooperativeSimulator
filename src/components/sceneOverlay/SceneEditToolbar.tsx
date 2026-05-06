import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiMapPin, FiSquare, FiTrash2, FiCornerDownLeft, FiX } from 'react-icons/fi';
import { TbAdjustmentsHorizontal, TbRulerMeasure } from 'react-icons/tb';
import { AREA_COLORS, MARKER_COLORS } from './sceneTypes';
import type { ActiveTool, AreaKind, MarkerKind, MeasureMode } from './sceneTypes';
import type { SceneOverlaySelection } from './useSceneTools';

export interface SceneEditToolbarProps {
  activeTool: ActiveTool;
  markerKind: MarkerKind;
  areaKind: AreaKind;
  measureMode: MeasureMode;
  draftAreaPointCount: number;
  awaitingMeasureSecond: boolean;
  selection: SceneOverlaySelection | null;
  onSelectTool: (tool: ActiveTool) => void;
  onPickMarkerKind: (kind: MarkerKind) => void;
  onPickAreaKind: (kind: AreaKind) => void;
  onPickMeasureMode: (mode: MeasureMode) => void;
  onFinishArea: () => void;
  onClear: () => void;
  onRemoveSelected: () => void;
  onClearSelection: () => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
  settingsButtonRef?: RefObject<HTMLButtonElement | null>;
}

const MARKER_KINDS: MarkerKind[] = ['task', 'observation', 'anomaly'];
const AREA_KINDS: AreaKind[] = ['patrol', 'no_go', 'risk', 'scan'];

export function SceneEditToolbar({
  activeTool,
  markerKind,
  areaKind,
  measureMode,
  draftAreaPointCount,
  awaitingMeasureSecond,
  selection,
  onSelectTool,
  onPickMarkerKind,
  onPickAreaKind,
  onPickMeasureMode,
  onFinishArea,
  onClear,
  onRemoveSelected,
  onClearSelection,
  onOpenSettings,
  settingsOpen,
  settingsButtonRef,
}: SceneEditToolbarProps) {
  const { t } = useTranslation();

  const renderToolButton = (id: Exclude<ActiveTool, null>, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      className={`scene-edit-tool ${activeTool === id ? 'is-active' : ''}`}
      aria-pressed={activeTool === id}
      onClick={() => onSelectTool(id)}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="scene-edit-bar" role="toolbar" aria-label={t('worldWindowExtra.scene.toolsAria')}>
      <div className="scene-edit-bar-row">
        <div className="scene-edit-bar-main">
          {renderToolButton('marker', t('worldWindowExtra.scene.addPin'), <FiMapPin />)}
          {renderToolButton('measure', t('worldWindowExtra.scene.measureDistance'), <TbRulerMeasure />)}
          {renderToolButton('area', t('worldWindowExtra.scene.drawArea'), <FiSquare />)}
          <button type="button" className="scene-edit-tool" onClick={onClear}>
            <FiTrash2 aria-hidden="true" />
            <span>{t('worldWindowExtra.scene.clear')}</span>
          </button>
        </div>

        <button
          ref={settingsButtonRef}
          type="button"
          className={`scene-edit-settings ${settingsOpen ? 'is-active' : ''}`}
          aria-pressed={settingsOpen}
          onClick={onOpenSettings}
        >
          <TbAdjustmentsHorizontal aria-hidden="true" />
          <span>{t('worldWindowExtra.scene.configure3D')}</span>
        </button>
      </div>

      {activeTool === 'marker' ? (
        <div className="scene-edit-options" role="radiogroup" aria-label={t('worldWindowExtra.scene.markerKindAria')}>
          {MARKER_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={markerKind === kind}
              className={`scene-edit-chip ${markerKind === kind ? 'is-active' : ''}`}
              style={{ '--chip-color': MARKER_COLORS[kind] } as React.CSSProperties}
              onClick={() => onPickMarkerKind(kind)}
            >
              <span className="scene-edit-chip-dot" />
              {t(`worldWindowExtra.scene.markerKind.${kind}`)}
            </button>
          ))}
        </div>
      ) : null}

      {activeTool === 'measure' ? (
        <div className="scene-edit-options" role="radiogroup" aria-label={t('worldWindowExtra.scene.measureModeAria')}>
          {(['planar', 'three_d'] as MeasureMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={measureMode === mode}
              className={`scene-edit-chip ${measureMode === mode ? 'is-active' : ''}`}
              onClick={() => onPickMeasureMode(mode)}
            >
              {t(`worldWindowExtra.scene.measureMode.${mode}`)}
            </button>
          ))}
          {awaitingMeasureSecond ? (
            <span className="scene-edit-hint">{t('worldWindowExtra.scene.measureHintSecond')}</span>
          ) : (
            <span className="scene-edit-hint">{t('worldWindowExtra.scene.measureHintFirst')}</span>
          )}
        </div>
      ) : null}

      {selection ? (
        <div className="scene-edit-options scene-edit-selection" role="group" aria-label={t('worldWindowExtra.scene.selectionAria')}>
          <span className="scene-edit-hint">
            {t(`worldWindowExtra.scene.selectionLabel.${selection.kind}`)}
          </span>
          <button type="button" className="scene-edit-finish scene-edit-finish--danger" onClick={onRemoveSelected}>
            <FiTrash2 aria-hidden="true" /> {t('worldWindowExtra.scene.selectionDelete')}
          </button>
          <button type="button" className="scene-edit-tool" onClick={onClearSelection}>
            <FiX aria-hidden="true" />
            <span>{t('worldWindowExtra.scene.selectionClear')}</span>
          </button>
        </div>
      ) : null}

      {activeTool === 'area' ? (
        <div className="scene-edit-options" role="radiogroup" aria-label={t('worldWindowExtra.scene.areaKindAria')}>
          {AREA_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={areaKind === kind}
              className={`scene-edit-chip ${areaKind === kind ? 'is-active' : ''}`}
              style={{ '--chip-color': AREA_COLORS[kind] } as React.CSSProperties}
              onClick={() => onPickAreaKind(kind)}
            >
              <span className="scene-edit-chip-dot" />
              {t(`worldWindowExtra.scene.areaKind.${kind}`)}
            </button>
          ))}
          <span className="scene-edit-hint">
            <FiCornerDownLeft aria-hidden="true" />
            {t('worldWindowExtra.scene.areaHint', { count: draftAreaPointCount })}
          </span>
          <button
            type="button"
            className="scene-edit-finish"
            disabled={draftAreaPointCount < 3}
            onClick={onFinishArea}
          >
            <FiCheck aria-hidden="true" /> {t('worldWindowExtra.scene.areaFinish')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
