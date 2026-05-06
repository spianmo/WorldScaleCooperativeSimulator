import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { existsSync, readFileSync } from 'node:fs';

function readTomlString(content: string, sectionName: string, key: string): string | undefined {
  const sectionPattern = new RegExp(`^\\[${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*$`, 'm');
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) {
    return undefined;
  }

  const sectionStart = sectionMatch.index + sectionMatch[0].length;
  const nextSectionIndex = content.slice(sectionStart).search(/^\[/m);
  const section = nextSectionIndex >= 0
    ? content.slice(sectionStart, sectionStart + nextSectionIndex)
    : content.slice(sectionStart);
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*"([^"]*)"`, 'm');
  const value = keyPattern.exec(section)?.[1]?.trim();
  return value || undefined;
}

function loadMapPublicVars() {
  const mapsConfigPath = './config/maps.toml';
  if (!existsSync(mapsConfigPath)) {
    return {};
  }

  const content = readFileSync(mapsConfigPath, 'utf8');
  const googleMapsApiKey = readTomlString(content, 'google_maps', 'api_key');
  const cesiumIonToken = readTomlString(content, 'cesium_ion', 'token');

  return {
    ...(googleMapsApiKey
      ? {
          'import.meta.env': {
            PUBLIC_GOOGLE_MAPS_API_KEY: JSON.stringify(googleMapsApiKey),
            PUBLIC_CESIUM_ION_TOKEN: JSON.stringify(cesiumIonToken),
          },
          'import.meta.env.PUBLIC_GOOGLE_MAPS_API_KEY': JSON.stringify(googleMapsApiKey),
          'process.env.PUBLIC_GOOGLE_MAPS_API_KEY': JSON.stringify(googleMapsApiKey),
        }
      : {}),
    ...(cesiumIonToken
      ? {
          ...(!googleMapsApiKey
            ? {
                'import.meta.env': {
                  PUBLIC_CESIUM_ION_TOKEN: JSON.stringify(cesiumIonToken),
                },
              }
            : {}),
          'import.meta.env.PUBLIC_CESIUM_ION_TOKEN': JSON.stringify(cesiumIonToken),
          'process.env.PUBLIC_CESIUM_ION_TOKEN': JSON.stringify(cesiumIonToken),
        }
      : {}),
  };
}

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: './index.html',
  },
  output: {
    assetPrefix: './',
    copy: [
      {
        from: './node_modules/cesium/Build/Cesium',
        to: './cesium',
      },
    ],
    distPath: {
      root: 'dist',
    },
  },
  source: {
    entry: {
      index: './src/main.tsx',
    },
    define: loadMapPublicVars(),
    assetsInclude: [/\.(glb|usd|usdz|stl|dae|urdf)$/i],
  },
  tools: {
    rspack: {
      module: {
        rules: [
          {
            test: /\.(usd|usdz|stl|dae|urdf)$/i,
            type: 'asset/resource',
          },
        ],
      },
    },
  },
  server: {
    port: 1420,
    host: '127.0.0.1',
  },
});
