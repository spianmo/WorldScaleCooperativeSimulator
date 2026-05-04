import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

import type {
  LocaleCode,
  SimulationDevice,
  SimulationGoal,
  SimulationLogEntry,
  SimulationSettings,
  SimulationState,
  SimulationWindowRecord,
  ThemeMode,
  WorldSnapshotRecord,
  WorldSnapshot,
} from '../types';
import type { GenerateWorldInput } from '../api';
import { createDefaultSimulationState } from '../types';
import {
  generateWorld as invokeGenerateWorld,
  listWorldSnapshots as invokeListWorldSnapshots,
  loadSimulationState,
  openWorldSnapshot as invokeOpenWorldSnapshot,
  registerDevice as invokeRegisterDevice,
  removeDevice as invokeRemoveDevice,
  saveWorldSnapshot as invokeSaveWorldSnapshot,
  saveSimulationState,
  submitGoal as invokeSubmitGoal,
  tickSimulation as invokeTickSimulation,
  updateAppSettings as invokeUpdateAppSettings,
  updatePhysicalRules as invokeUpdatePhysicalRules,
} from '../api';
import { openSimulatorWindow, type OpenSimulatorWindowOptions } from '../utils';
import { setAppLocale } from '../i18n';
import {
  appendDeviceToState,
  appendGoalToState,
  appendLogToState,
  removeDeviceFromState,
  replaceWorldInState,
  resetSimulationState,
} from './simulationStore';
import { publishStateSync, readLatestStateSync, subscribeStateSync } from './windowSync';

export interface SimulationProviderValue {
  state: SimulationState;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  reloadState: () => Promise<void>;
  resetState: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLocale: (locale: LocaleCode) => void;
  setSettings: (patch: Partial<SimulationSettings>) => void;
  setWorld: (world: WorldSnapshot) => void;
  registerDevice: (device: SimulationDevice) => void;
  removeDevice: (deviceId: string) => void;
  submitGoal: (goal: SimulationGoal) => void;
  appendLog: (logEntry: Omit<SimulationLogEntry, 'id' | 'timestamp'>) => void;
  setWindows: (windows: SimulationWindowRecord[]) => void;
  openWindow: (options: OpenSimulatorWindowOptions) => Promise<unknown>;
  generateWorld: (input?: GenerateWorldInput['input']) => Promise<void>;
  tickSimulation: (steps?: number) => Promise<void>;
  updatePhysicalRules: (rules: Partial<SimulationState['physicalRules']>) => Promise<void>;
  saveWorldSnapshot: (snapshotName?: string) => Promise<{ path: string }>;
  listWorldSnapshots: () => Promise<WorldSnapshotRecord[]>;
  openWorldSnapshot: (snapshotName: string) => Promise<void>;
}

const SimulationContext = createContext<SimulationProviderValue | null>(null);
function resolveThemeMode(mode: ThemeMode): Exclude<ThemeMode, 'system'> {
  if (typeof window === 'undefined') {
    return 'light';
  }

  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return mode;
}

function withResolvedTheme(nextState: SimulationState): SimulationState {
  return {
    ...nextState,
    settings: {
      ...nextState.settings,
      theme: {
        ...nextState.settings.theme,
        resolvedMode: resolveThemeMode(nextState.settings.theme.mode),
      },
    },
  };
}

function collectStateTimestamps(state: SimulationState): string[] {
  return [
    state.clock.wallClockAt,
    state.world.createdAt,
    state.world.updatedAt,
    ...state.devices.map((device) => device.updatedAt),
    ...state.goals.map((goal) => goal.updatedAt),
    ...state.tasks.map((task) => task.updatedAt),
    ...state.logs.map((logEntry) => logEntry.timestamp),
  ].filter(Boolean);
}

function latestStateTimestamp(state: SimulationState): string {
  return collectStateTimestamps(state).sort().at(-1) ?? '';
}

function compareSimulationStates(left: SimulationState, right: SimulationState): number {
  const leftTimestamp = latestStateTimestamp(left);
  const rightTimestamp = latestStateTimestamp(right);

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp > rightTimestamp ? 1 : -1;
  }

  const leftWeight = left.clock.step
    + left.devices.length
    + left.goals.length
    + left.tasks.length
    + left.logs.length;
  const rightWeight = right.clock.step
    + right.devices.length
    + right.goals.length
    + right.tasks.length
    + right.logs.length;

  if (leftWeight === rightWeight) {
    return 0;
  }

  return leftWeight > rightWeight ? 1 : -1;
}

export interface SimulationProviderProps extends PropsWithChildren {
  initialState?: SimulationState;
}

export function SimulationProvider({ children, initialState }: SimulationProviderProps) {
  const initialResolvedState = withResolvedTheme(initialState ?? createDefaultSimulationState());
  const [state, setState] = useState<SimulationState>(initialResolvedState);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(initialResolvedState);
  const hydratedRef = useRef(false);

  const persist = (nextState: SimulationState) => {
    if (!hydratedRef.current) {
      return;
    }

    void (async () => {
      try {
        // 先写入本地持久层，再发布同步事件，避免新窗口读取到旧快照。
        await saveSimulationState(nextState);
        await publishStateSync(nextState);
      } catch (persistError) {
        setError(persistError instanceof Error ? persistError.message : '同步仿真状态失败');
      }
    })();
  };

  const commitState = (
    nextStateOrUpdater: SimulationState | ((currentState: SimulationState) => SimulationState),
    options: { persist?: boolean; force?: boolean } = {},
  ) => {
    const currentState = stateRef.current;
    const nextState = withResolvedTheme(
      typeof nextStateOrUpdater === 'function'
        ? nextStateOrUpdater(currentState)
        : nextStateOrUpdater,
    );

    if (!options.force && compareSimulationStates(nextState, currentState) < 0) {
      return currentState;
    }

    stateRef.current = nextState;
    setState(nextState);

    if (options.persist ?? true) {
      persist(nextState);
    }

    return nextState;
  };

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        const loadedState = await loadSimulationState();
        if (!active) {
          return;
        }

        const latestSyncedState = readLatestStateSync();
        const resolvedLoadedState = withResolvedTheme(loadedState);
        const nextState = latestSyncedState && compareSimulationStates(latestSyncedState.state, resolvedLoadedState) > 0
          ? latestSyncedState.state
          : resolvedLoadedState;

        commitState(nextState, { persist: false, force: true });
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : '读取仿真状态失败');
      } finally {
        if (active) {
          setHydrated(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }

    let disposed = false;
    let cleanupSync: (() => void) | undefined;

    const syncOnFocus = () => {
      void reloadState();
    };

    const syncOnVisible = () => {
      if (document.visibilityState === 'visible') {
        void reloadState();
      }
    };

    void subscribeStateSync((nextState) => {
      commitState(nextState, { persist: false });
      setError(null);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      cleanupSync = cleanup;
    });

    window.addEventListener('focus', syncOnFocus);
    document.addEventListener('visibilitychange', syncOnVisible);

    return () => {
      disposed = true;
      cleanupSync?.();
      window.removeEventListener('focus', syncOnFocus);
      document.removeEventListener('visibilitychange', syncOnVisible);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || state.phase === 'paused') {
      return undefined;
    }

    const hasActiveWork = state.tasks.some((task) => task.status === 'active');
    if (!hasActiveWork) {
      return undefined;
    }

    // 有活跃任务时由前端统一驱动 tick，保证眼镜下发目标后终端会持续反馈位置。
    let ticking = false;
    const intervalMs = Math.max(250, state.settings.tickIntervalMs);
    const timer = window.setInterval(() => {
      if (ticking) {
        return;
      }

      ticking = true;
      void invokeTickSimulation(1)
        .then(updateState)
        .catch((tickError) => {
          setError(tickError instanceof Error ? tickError.message : '自动推进仿真 tick 失败');
        })
        .finally(() => {
          ticking = false;
        });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [hydrated, state.phase, state.settings.tickIntervalMs, state.tasks]);

  const updateState = (nextState: SimulationState) => {
    commitState(nextState);
  };

  const setThemeMode = (mode: ThemeMode) => {
    const resolvedMode = resolveThemeMode(mode);
    const fallbackState = commitState((currentState) => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        theme: {
          mode,
          resolvedMode,
        },
      },
    }));
    void invokeUpdateAppSettings(fallbackState.settings)
      .then(updateState)
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : '写入主题设置失败');
      });
  };

  const setLocale = (locale: LocaleCode) => {
    void setAppLocale(locale);
    const fallbackState = commitState((currentState) => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        locale,
      },
    }));
    void invokeUpdateAppSettings(fallbackState.settings)
      .then(updateState)
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : '写入语言设置失败');
      });
  };

  const setSettings = (patch: Partial<SimulationSettings>) => {
    const nextSettings = commitState((currentState) => {
      const nextTheme = patch.theme ? { ...currentState.settings.theme, ...patch.theme } : currentState.settings.theme;
      const resolvedTheme = resolveThemeMode(nextTheme.mode);

      return {
        ...currentState,
        settings: {
          ...currentState.settings,
          ...patch,
          theme: {
            ...nextTheme,
            resolvedMode: resolvedTheme,
          },
        },
      };
    });
    void invokeUpdateAppSettings(nextSettings.settings)
      .then(updateState)
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : '写入设置失败');
      });
  };

  const setWorld = (world: WorldSnapshot) => {
    commitState((currentState) => replaceWorldInState(currentState, world));
  };

  const registerDevice = (device: SimulationDevice) => {
    void invokeRegisterDevice(device)
      .then(updateState)
      .catch(() => commitState((currentState) => appendDeviceToState(currentState, device)));
  };

  const removeDevice = (deviceId: string) => {
    void invokeRemoveDevice(deviceId)
      .then(updateState)
      .catch(() => commitState((currentState) => removeDeviceFromState(currentState, deviceId)));
  };

  const submitGoal = (goal: SimulationGoal) => {
    void invokeSubmitGoal(goal)
      .then(updateState)
      .catch(() => commitState((currentState) => appendGoalToState(currentState, goal)));
  };

  const appendLog = (logEntry: Omit<SimulationLogEntry, 'id' | 'timestamp'>) => {
    commitState((currentState) => appendLogToState(currentState, logEntry));
  };

  const setWindows = (windows: SimulationWindowRecord[]) => {
    commitState((currentState) => ({
      ...currentState,
      windows,
    }));
  };

  const reloadState = async () => {
    setLoading(true);
    try {
      const loadedState = withResolvedTheme(await loadSimulationState());
      const latestSyncedState = readLatestStateSync();
      const nextState = latestSyncedState && compareSimulationStates(latestSyncedState.state, loadedState) > 0
        ? latestSyncedState.state
        : loadedState;

      commitState(nextState, { persist: false });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取仿真状态失败');
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  };

  const resetState = () => {
    commitState(resetSimulationState(), { force: true });
  };

  const generateWorld = async (input?: GenerateWorldInput['input']) => {
    const generated = await invokeGenerateWorld(input ?? {
      name: `协同世界-${Date.now().toString().slice(-4)}`,
      seed: Date.now(),
      object_density: 0.22,
      size: { x: 140, y: 80, z: 140 },
    });
    updateState(generated);
  };

  const tickSimulation = async (steps = 1) => {
    const nextState = await invokeTickSimulation(steps);
    updateState(nextState);
  };

  const updatePhysicalRules = async (rules: Partial<SimulationState['physicalRules']>) => {
    const nextState = await invokeUpdatePhysicalRules(rules);
    updateState(nextState);
  };

  const saveWorldSnapshot = async (snapshotName?: string) => {
    return invokeSaveWorldSnapshot(snapshotName);
  };

  const listWorldSnapshots = async () => {
    return invokeListWorldSnapshots();
  };

  const openWorldSnapshot = async (snapshotName: string) => {
    const nextState = await invokeOpenWorldSnapshot(snapshotName);
    updateState(nextState);
  };

  const value: SimulationProviderValue = {
    state,
    hydrated,
    loading,
    error,
    reloadState,
    resetState,
    setThemeMode,
    setLocale,
    setSettings,
    setWorld,
    registerDevice,
    removeDevice,
    submitGoal,
    appendLog,
    setWindows,
    openWindow: openSimulatorWindow,
    generateWorld,
    tickSimulation,
    updatePhysicalRules,
    saveWorldSnapshot,
    listWorldSnapshots,
    openWorldSnapshot,
  };

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation 必须在 SimulationProvider 内使用');
  }

  return context;
}

export function useSimulationState() {
  return useSimulation().state;
}

export function useSimulationActions() {
  const {
    reloadState,
    resetState,
    setThemeMode,
    setLocale,
    setSettings,
    setWorld,
    registerDevice,
    removeDevice,
    submitGoal,
    appendLog,
    setWindows,
    openWindow,
    generateWorld,
    tickSimulation,
    updatePhysicalRules,
    saveWorldSnapshot,
    listWorldSnapshots,
    openWorldSnapshot,
  } = useSimulation();

  return {
    reloadState,
    resetState,
    setThemeMode,
    setLocale,
    setSettings,
    setWorld,
    registerDevice,
    removeDevice,
    submitGoal,
    appendLog,
    setWindows,
    openWindow,
    generateWorld,
    tickSimulation,
    updatePhysicalRules,
    saveWorldSnapshot,
    listWorldSnapshots,
    openWorldSnapshot,
  };
}
