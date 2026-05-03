import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

export interface SceneProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  cameraPosition?: [number, number, number];
  background?: string;
  minHeight?: number | string;
}

function resolveCssColor(color: string) {
  const variableMatch = color.match(/^var\((--[^)]+)\)$/);
  if (!variableMatch || typeof window === 'undefined') {
    return color;
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(variableMatch[1]).trim();
  return value || color;
}

export function Scene({
  children,
  className,
  style,
  cameraPosition = [7.5, 5.5, 7.5],
  background = 'var(--sim-color-scene-bg)',
  minHeight = 380,
}: SceneProps) {
  const [resolvedBackground, setResolvedBackground] = useState(() => resolveCssColor(background));
  const [resolvedGridLine, setResolvedGridLine] = useState(() => resolveCssColor('var(--sim-color-border-soft)'));
  const [resolvedGridSection, setResolvedGridSection] = useState(() => resolveCssColor('var(--sim-color-primary)'));

  useEffect(() => {
    const updateThemeColors = () => {
      setResolvedBackground(resolveCssColor(background));
      setResolvedGridLine(resolveCssColor('var(--sim-color-border-soft)'));
      setResolvedGridSection(resolveCssColor('var(--sim-color-primary)'));
    };
    updateThemeColors();

    const observer = new MutationObserver(updateThemeColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => observer.disconnect();
  }, [background]);

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
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{ position: cameraPosition, fov: 42, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={[resolvedBackground]} />
        <fog attach="fog" args={[resolvedBackground, 18, 54]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[8, 12, 8]} intensity={2.1} />
        <directionalLight position={[-8, 4, -8]} intensity={0.75} />
        <Grid
          position={[0, -1.2, 0]}
          infiniteGrid
          args={[40, 40]}
          cellColor={resolvedGridLine}
          sectionColor={resolvedGridSection}
          fadeDistance={40}
          fadeStrength={2}
          cellThickness={0.7}
          sectionThickness={1.2}
          cellSize={1}
          sectionSize={5}
        />
        {children}
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
