import { isTauri, invoke as tauriInvoke } from '@tauri-apps/api/core';

import { invokeBrowserCommand } from './browserFallback';

export type InvokePayload = Record<string, unknown> | number[] | ArrayBuffer | Uint8Array | undefined;

// 统一的 invoke 入口：Tauri 环境走原生命令，浏览器环境走本地 fallback。
export async function invokeApp<T>(command: string, args?: InvokePayload): Promise<T> {
  if (isTauri()) {
    return tauriInvoke<T>(command, args);
  }

  return invokeBrowserCommand<T>(command, args as Record<string, unknown> | undefined);
}

export { isTauri };

