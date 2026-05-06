import Resource from '@cesium/engine/Source/Core/Resource.js';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../api/invoke';

const TILE_PREFIX = 'https://tile.googleapis.com/v1/';
const FLAG = '__tileCacheCesiumPatched' as const;

type Deferred = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

type LoadWithXhr = (
  url: string,
  responseType: string | undefined,
  method: string | undefined,
  data: unknown,
  headers: Record<string, string> | undefined,
  deferred: Deferred,
  overrideMimeType: string | undefined,
) => void;

type ResourceImpl = typeof Resource & {
  _Implementations: { loadWithXhr: LoadWithXhr };
};

type Flagged = typeof globalThis & { [FLAG]?: boolean };

// Cesium 的 Resource 走 XMLHttpRequest，不会经过 window.fetch；同时 WKWebView 对自定义 URI scheme
// 在 XHR 路径上的兼容性不可靠（会让请求挂住，地图永远停在 loading）。这里直接劫持
// Resource._Implementations.loadWithXhr，把 tile.googleapis.com 的请求改走 Tauri IPC
// （tile_cache_fetch 命令内部会先查本地缓存，未命中再上游回源并落盘）。
export function installTileCacheInterceptor() {
  const flagged = globalThis as Flagged;
  if (flagged[FLAG]) return;
  if (!isTauri()) return;
  flagged[FLAG] = true;

  const impl = Resource as ResourceImpl;
  const original = impl._Implementations.loadWithXhr;

  impl._Implementations.loadWithXhr = function patched(
    url,
    responseType,
    method,
    data,
    headers,
    deferred,
    overrideMimeType,
  ) {
    const isGet = !method || method.toUpperCase() === 'GET';
    if (isGet && typeof url === 'string' && url.startsWith(TILE_PREFIX)) {
      const pathAndQuery = url.slice(TILE_PREFIX.length);
      invoke<ArrayBuffer>('tile_cache_fetch', { pathAndQuery })
        .then((buffer) => {
          deferred.resolve(decodeResponse(buffer, responseType));
        })
        .catch((error: unknown) => {
          deferred.reject(error instanceof Error ? error : new Error(String(error)));
        });
      return;
    }
    return original.call(this, url, responseType, method, data, headers, deferred, overrideMimeType);
  };
}

function decodeResponse(buffer: ArrayBuffer, responseType: string | undefined): unknown {
  switch (responseType) {
    case 'arraybuffer':
      return buffer;
    case 'blob':
      return new Blob([buffer]);
    case 'json': {
      const text = new TextDecoder('utf-8').decode(buffer);
      return JSON.parse(text);
    }
    case 'document': {
      const text = new TextDecoder('utf-8').decode(buffer);
      return new DOMParser().parseFromString(text, 'text/html');
    }
    case 'text':
    case '':
    case undefined:
      return new TextDecoder('utf-8').decode(buffer);
    default:
      return buffer;
  }
}
