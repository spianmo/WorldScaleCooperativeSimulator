import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface DeviceGroup {
  id: string;
  name: string;
  color: string;
  deviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const DEVICE_GROUP_COLOR_PALETTE = [
  '#0f56e8',
  '#1e8e3e',
  '#f59f00',
  '#d6336c',
  '#7950f2',
  '#0ca678',
  '#e8590c',
  '#5f6368',
] as const;

const STORAGE_KEY = 'world-scale-simulator.device-groups';
const CHANNEL_NAME = 'world-scale-simulator.device-groups-sync';
const SAME_WINDOW_EVENT = 'world-scale-simulator:device-groups-updated';

let broadcastChannel: BroadcastChannel | undefined;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function canUseBroadcast() {
  return typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined';
}

function getBroadcastChannel() {
  if (!canUseBroadcast()) {
    return undefined;
  }
  broadcastChannel ??= new BroadcastChannel(CHANNEL_NAME);
  return broadcastChannel;
}

function isDeviceGroup(value: unknown): value is DeviceGroup {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<DeviceGroup>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.color === 'string'
    && Array.isArray(candidate.deviceIds)
    && candidate.deviceIds.every((deviceId) => typeof deviceId === 'string');
}

function readGroups(): DeviceGroup[] {
  if (!canUseStorage()) {
    return [];
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isDeviceGroup);
  } catch {
    return [];
  }
}

function writeGroups(groups: DeviceGroup[]) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  getBroadcastChannel()?.postMessage({ groups });
}

export function clearDeviceGroups() {
  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  // 跨窗口同步：BroadcastChannel 不会回送给发送窗口
  getBroadcastChannel()?.postMessage({ groups: [] });
  // 同窗口同步：发送方自己的 hook 不会收到 BroadcastChannel 消息，需要 CustomEvent 兜底
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<DeviceGroup[]>(SAME_WINDOW_EVENT, { detail: [] }));
  }
}

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickNextColor(existing: DeviceGroup[]) {
  const used = new Set(existing.map((group) => group.color));
  return DEVICE_GROUP_COLOR_PALETTE.find((color) => !used.has(color))
    ?? DEVICE_GROUP_COLOR_PALETTE[existing.length % DEVICE_GROUP_COLOR_PALETTE.length];
}

export interface UseDeviceGroupsResult {
  groups: DeviceGroup[];
  createGroup: (name: string, color?: string) => DeviceGroup | null;
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: string) => void;
  deleteGroup: (groupId: string) => void;
  toggleDeviceInGroup: (groupId: string, deviceId: string) => void;
  setDeviceGroup: (deviceId: string, groupId: string | null) => void;
  groupOfDevice: (deviceId: string) => DeviceGroup | undefined;
}

export function useDeviceGroups(): UseDeviceGroupsResult {
  const [groups, setGroups] = useState<DeviceGroup[]>(() => readGroups());
  const groupsRef = useRef(groups);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        const next = JSON.parse(event.newValue) as unknown;
        if (Array.isArray(next)) {
          setGroups(next.filter(isDeviceGroup));
        }
      } catch {
        // 忽略不完整写入；下一次完整写入会覆盖。
      }
    };

    const channel = getBroadcastChannel();
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { groups?: unknown } | undefined;
      if (payload && Array.isArray(payload.groups)) {
        setGroups(payload.groups.filter(isDeviceGroup));
      }
    };

    const onSameWindow = (event: Event) => {
      const detail = (event as CustomEvent<DeviceGroup[]>).detail;
      if (Array.isArray(detail)) {
        setGroups(detail.filter(isDeviceGroup));
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(SAME_WINDOW_EVENT, onSameWindow);
    if (channel) {
      channel.addEventListener('message', onMessage);
    }

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SAME_WINDOW_EVENT, onSameWindow);
      if (channel) {
        channel.removeEventListener('message', onMessage);
      }
    };
  }, []);

  const persist = useCallback((next: DeviceGroup[]) => {
    setGroups(next);
    writeGroups(next);
  }, []);

  const createGroup = useCallback((name: string, color?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    const current = groupsRef.current;
    if (current.some((group) => group.name === trimmed)) {
      return null;
    }
    const timestamp = nowIso();
    const group: DeviceGroup = {
      id: createId(),
      name: trimmed,
      color: color ?? pickNextColor(current),
      deviceIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    persist([...current, group]);
    return group;
  }, [persist]);

  const renameGroup = useCallback((groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const timestamp = nowIso();
    const next = groupsRef.current.map((group) => (group.id === groupId
      ? { ...group, name: trimmed, updatedAt: timestamp }
      : group));
    persist(next);
  }, [persist]);

  const setGroupColor = useCallback((groupId: string, color: string) => {
    const timestamp = nowIso();
    const next = groupsRef.current.map((group) => (group.id === groupId
      ? { ...group, color, updatedAt: timestamp }
      : group));
    persist(next);
  }, [persist]);

  const deleteGroup = useCallback((groupId: string) => {
    persist(groupsRef.current.filter((group) => group.id !== groupId));
  }, [persist]);

  const toggleDeviceInGroup = useCallback((groupId: string, deviceId: string) => {
    const timestamp = nowIso();
    const next = groupsRef.current.map((group) => {
      if (group.id !== groupId) {
        // 一台设备只能同时属于一个分组；勾选时从其它分组移除。
        if (group.deviceIds.includes(deviceId)) {
          return {
            ...group,
            deviceIds: group.deviceIds.filter((id) => id !== deviceId),
            updatedAt: timestamp,
          };
        }
        return group;
      }
      const isMember = group.deviceIds.includes(deviceId);
      return {
        ...group,
        deviceIds: isMember
          ? group.deviceIds.filter((id) => id !== deviceId)
          : [...group.deviceIds, deviceId],
        updatedAt: timestamp,
      };
    });
    persist(next);
  }, [persist]);

  const setDeviceGroup = useCallback((deviceId: string, groupId: string | null) => {
    const timestamp = nowIso();
    const next = groupsRef.current.map((group) => {
      const isTarget = group.id === groupId;
      const isMember = group.deviceIds.includes(deviceId);
      if (isTarget && !isMember) {
        return { ...group, deviceIds: [...group.deviceIds, deviceId], updatedAt: timestamp };
      }
      if (!isTarget && isMember) {
        return {
          ...group,
          deviceIds: group.deviceIds.filter((id) => id !== deviceId),
          updatedAt: timestamp,
        };
      }
      return group;
    });
    persist(next);
  }, [persist]);

  const groupOfDevice = useCallback((deviceId: string) => {
    return groupsRef.current.find((group) => group.deviceIds.includes(deviceId));
  }, []);

  return useMemo(() => ({
    groups,
    createGroup,
    renameGroup,
    setGroupColor,
    deleteGroup,
    toggleDeviceInGroup,
    setDeviceGroup,
    groupOfDevice,
  }), [groups, createGroup, renameGroup, setGroupColor, deleteGroup, toggleDeviceInGroup, setDeviceGroup, groupOfDevice]);
}
