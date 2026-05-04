import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: './index.html',
  },
  source: {
    entry: {
      index: './src/main.tsx',
    },
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
  output: {
    assetPrefix: './',
    distPath: {
      root: 'dist',
    },
  },
  server: {
    port: 1420,
    host: '127.0.0.1',
  },
});
