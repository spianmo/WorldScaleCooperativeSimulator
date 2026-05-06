import { isTauri } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

import type { SimulationWindowKind } from '../types';

const ALLOWED_AUXILIARY_WINDOW_KINDS = new Set<SimulationWindowKind>([
  'control',
  'glasses',
  'device',
  'task',
  'settings',
  'create_world',
  'create_device',
]);

const ALLOWED_AUXILIARY_ROUTES = new Set([
  '#/world',
  '#/control',
  '#/glasses',
  '#/settings',
  '#/create-world',
  '#/create-device',
]);

const DEFAULT_AUXILIARY_WINDOW_SIZE = {
  width: 1600,
  height: 1000,
};

const AUXILIARY_WINDOW_SIZE_BY_KIND: Partial<Record<SimulationWindowKind, { width: number; height: number }>> = {
  world: { width: 1760, height: 1040 },
  control: { width: 1600, height: 1000 },
  glasses: { width: 1440, height: 960 },
  device: { width: 1520, height: 960 },
  task: { width: 1440, height: 920 },
  settings: { width: 1040, height: 820 },
  create_world: { width: 1640, height: 1080 },
  create_device: { width: 1120, height: 900 },
};

const MIN_AUXILIARY_WINDOW_SIZE = {
  width: 960,
  height: 720,
};

const FRAMELESS_AUXILIARY_WINDOW_KINDS = new Set<SimulationWindowKind>([
  'create_world',
]);

function isAllowedAuxiliaryRoute(route: string) {
  return ALLOWED_AUXILIARY_ROUTES.has(route) || route.startsWith('#/device/') || route.startsWith('#/task/');
}

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

function resolveWindowSize(options: OpenSimulatorWindowOptions) {
  const preferred = AUXILIARY_WINDOW_SIZE_BY_KIND[options.kind] ?? DEFAULT_AUXILIARY_WINDOW_SIZE;
  return {
    width: Math.max(options.width ?? preferred.width, preferred.width),
    height: Math.max(options.height ?? preferred.height, preferred.height),
  };
}

function buildBrowserFeatures(options: OpenSimulatorWindowOptions) {
  const size = resolveWindowSize(options);
  const features = [
    `width=${size.width}`,
    `height=${size.height}`,
    'noopener',
    'noreferrer',
  ].filter(Boolean);

  return features.join(',');
}

async function applyWindowChrome(kind: SimulationWindowKind, webviewWindow: WebviewWindow) {
  const isFrameless = FRAMELESS_AUXILIARY_WINDOW_KINDS.has(kind);
  if (!isFrameless) {
    return;
  }

  await Promise.all([
    webviewWindow.setDecorations(false),
    webviewWindow.setShadow(true),
  ]);
}

export async function openSimulatorWindow(options: OpenSimulatorWindowOptions): Promise<OpenSimulatorWindowResult> {
  const url = buildWindowUrl(options.route);
  const route = normalizeRoute(options.route);
  const size = resolveWindowSize(options);

  if (!ALLOWED_AUXILIARY_WINDOW_KINDS.has(options.kind) || !isAllowedAuxiliaryRoute(route)) {
    throw new Error(`不允许打开未注册的模拟器窗口: ${options.kind} ${route}`);
  }

  if (isTauri()) {
    const existingWindow = await WebviewWindow.getByLabel(options.label);
    if (existingWindow) {
      await applyWindowChrome(options.kind, existingWindow).catch(() => undefined);
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
      width: size.width,
      height: size.height,
      minWidth: Math.min(size.width, MIN_AUXILIARY_WINDOW_SIZE.width),
      minHeight: Math.min(size.height, MIN_AUXILIARY_WINDOW_SIZE.height),
      resizable: options.resizable ?? true,
      decorations: !FRAMELESS_AUXILIARY_WINDOW_KINDS.has(options.kind),
      shadow: FRAMELESS_AUXILIARY_WINDOW_KINDS.has(options.kind),
    });

    await applyWindowChrome(options.kind, webviewWindow).catch(() => undefined);
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
