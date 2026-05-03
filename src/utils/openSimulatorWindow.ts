import { isTauri } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

import type { SimulationWindowKind } from '../types';

export interface OpenSimulatorWindowOptions {
  label: string;
  route: string;
  title: string;
  kind: SimulationWindowKind;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  resizable?: boolean;
  center?: boolean;
  focus?: boolean;
}

export interface OpenSimulatorWindowResult {
  label: string;
  mode: 'tauri' | 'browser';
  url: string;
}

function normalizeRoute(route: string) {
  if (route.startsWith('#')) {
    return route;
  }

  return route.startsWith('/') ? `#${route}` : `#/${route}`;
}

function buildWindowUrl(route: string) {
  return `index.html${normalizeRoute(route)}`;
}

function buildBrowserFeatures(options: OpenSimulatorWindowOptions) {
  const features = [
    `width=${options.width ?? 1280}`,
    `height=${options.height ?? 800}`,
    'noopener',
    'noreferrer',
  ].filter(Boolean);

  return features.join(',');
}

export async function openSimulatorWindow(options: OpenSimulatorWindowOptions): Promise<OpenSimulatorWindowResult> {
  const url = buildWindowUrl(options.route);

  if (isTauri()) {
    const existingWindow = await WebviewWindow.getByLabel(options.label);
    if (existingWindow) {
      await existingWindow.show();
      if (options.focus ?? true) {
        await existingWindow.setFocus();
      }

      return {
        label: options.label,
        mode: 'tauri',
        url,
      };
    }

    const webviewWindow = new WebviewWindow(options.label, {
      title: options.title,
      url,
      width: options.width ?? 1280,
      height: options.height ?? 800,
      resizable: options.resizable ?? true,
    });

    await webviewWindow.show();
    if (options.focus ?? true) {
      await webviewWindow.setFocus();
    }

    return {
      label: options.label,
      mode: 'tauri',
      url,
    };
  }

  if (typeof window !== 'undefined') {
    const existingWindow = window.open(url, options.label, buildBrowserFeatures(options));
    if (existingWindow) {
      existingWindow.document.title = options.title;
      existingWindow.focus();
    }
  }

  return {
    label: options.label,
    mode: 'browser',
    url,
  };
}
