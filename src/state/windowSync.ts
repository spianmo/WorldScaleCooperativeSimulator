import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '../api';
import type { SimulationState } from '../types';

const channelName = 'world-scale-simulator.state-sync';
const eventName = 'world-scale-simulator-state-sync';
const storageKey = 'world-scale-simulator.state-sync';
const instanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let localRevision = 0;
let broadcastChannel: BroadcastChannel | undefined;

export interface StateSyncMessage {
  sourceId: string;
  revision: number;
  createdAt: string;
  state: SimulationState;
}

export interface StateSyncSnapshot {
  revision: number;
  state: SimulationState;
}

function canUseBroadcastChannel() {
  return typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined';
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getBroadcastChannel() {
  if (!canUseBroadcastChannel()) {
    return undefined;
  }

  broadcastChannel ??= new BroadcastChannel(channelName);
  return broadcastChannel;
}

function buildMessage(state: SimulationState): StateSyncMessage {
  localRevision = Math.max(Date.now(), localRevision + 1);
  return {
    sourceId: instanceId,
    revision: localRevision,
    createdAt: new Date().toISOString(),
    state: redactStateCredentials(state),
  };
}

function redactStateCredentials(state: SimulationState): SimulationState {
  return {
    ...state,
    settings: {
      ...state.settings,
      maps: {
        googleMaps: {
          apiKeyEnv: state.settings.maps.googleMaps.apiKeyEnv,
        },
        cesiumIon: {
          tokenEnv: state.settings.maps.cesiumIon.tokenEnv,
        },
      },
    },
  };
}

function isStateSyncMessage(value: unknown): value is StateSyncMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StateSyncMessage>;
  return typeof candidate.sourceId === 'string'
    && typeof candidate.revision === 'number'
    && typeof candidate.createdAt === 'string'
    && Boolean(candidate.state)
    && typeof candidate.state === 'object';
}

function readStoredMessage(): StateSyncMessage | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const storedValue = window.localStorage.getItem(storageKey);
  if (!storedValue) {
    return null;
  }

  try {
    const message = JSON.parse(storedValue) as unknown;
    return isStateSyncMessage(message) ? message : null;
  } catch {
    return null;
  }
}

export function readLatestStateSync(): StateSyncSnapshot | null {
  const message = readStoredMessage();
  if (!message) {
    return null;
  }

  localRevision = Math.max(localRevision, message.revision);
  return {
    revision: message.revision,
    state: message.state,
  };
}

export async function publishStateSync(state: SimulationState) {
  const message = buildMessage(state);

  if (canUseLocalStorage()) {
    window.localStorage.setItem(storageKey, JSON.stringify(message));
  }

  getBroadcastChannel()?.postMessage(message);

  if (isTauri()) {
    await emit(eventName, message);
  }
}

export async function subscribeStateSync(onState: (state: SimulationState, revision: number) => void): Promise<() => void> {
  const cleanup: Array<() => void> = [];
  const consume = (message: unknown) => {
    if (!isStateSyncMessage(message)) {
      return;
    }
    if (message.sourceId === instanceId) {
      return;
    }
    if (message.revision <= localRevision) {
      return;
    }

    localRevision = message.revision;
    onState(message.state, message.revision);
  };

  if (canUseBroadcastChannel()) {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.onmessage = (event) => consume(event.data);
      cleanup.push(() => {
        if (broadcastChannel === channel) {
          broadcastChannel.close();
          broadcastChannel = undefined;
        }
      });
    }
  }

  if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      if (!event.newValue) {
        return;
      }

      try {
        consume(JSON.parse(event.newValue));
      } catch {
        // storage 里出现不完整写入时跳过，Provider 的 focus reload 会兜底。
      }
    };
    window.addEventListener('storage', onStorage);
    cleanup.push(() => window.removeEventListener('storage', onStorage));
  }

  if (isTauri()) {
    let unlisten: UnlistenFn | undefined;
    unlisten = await listen<StateSyncMessage>(eventName, (event) => consume(event.payload));
    cleanup.push(() => {
      if (unlisten) {
        unlisten();
      }
    });
  }

  return () => {
    cleanup.forEach((dispose) => dispose());
  };
}
