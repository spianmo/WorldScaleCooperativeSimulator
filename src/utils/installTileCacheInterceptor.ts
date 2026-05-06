import RequestScheduler from '@cesium/engine/Source/Core/RequestScheduler.js';
import Resource from '@cesium/engine/Source/Core/Resource.js';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../api/invoke';

const TILE_PREFIX = 'https://tile.googleapis.com/v1/';
const FLAG = '__tileCacheCesiumPatched' as const;

// 走本地缓存，没有真实 HTTP 出口压力；把 Cesium 内置的并发限流放宽。
// 默认 maximumRequests=50、maximumRequestsPerServer=18(HTTP/2)/6(HTTP/1.1)，对 CDN 友好但
// 在 IPC+磁盘命中场景下成了首屏渲染的主要瓶颈。
const SCHEDULER_MAX_REQUESTS = 128;
const SCHEDULER_MAX_REQUESTS_PER_SERVER = 64;

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
  if (!isTauri()) {
    console.info('[tile-cache] not running under Tauri; interceptor skipped');
    return;
  }
  flagged[FLAG] = true;

  const scheduler = RequestScheduler as unknown as {
    maximumRequests: number;
    maximumRequestsPerServer: number;
  };
  scheduler.maximumRequests = SCHEDULER_MAX_REQUESTS;
  scheduler.maximumRequestsPerServer = SCHEDULER_MAX_REQUESTS_PER_SERVER;

  const impl = Resource as ResourceImpl;
  const implementations = impl._Implementations;
  if (!implementations || typeof implementations.loadWithXhr !== 'function') {
    console.warn('[tile-cache] Resource._Implementations.loadWithXhr unavailable; interceptor not installed');
    return;
  }
  const original = implementations.loadWithXhr;

  implementations.loadWithXhr = function patched(
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
      invoke<ArrayBuffer | Uint8Array | number[]>('tile_cache_fetch', { pathAndQuery })
        .then((raw) => {
          deferred.resolve(decodeResponse(toArrayBuffer(raw), responseType));
        })
        .catch((error: unknown) => {
          // 失败时降级到原 XHR，至少保证地图能渲染；同时把错误打印出来便于定位。
          console.error('[tile-cache] invoke tile_cache_fetch failed, falling back to XHR', { url, error });
          original.call(this, url, responseType, method, data, headers, deferred, overrideMimeType);
        });
      return;
    }
    return original.call(this, url, responseType, method, data, headers, deferred, overrideMimeType);
  };

  console.info(
    `[tile-cache] interceptor ready (concurrency: ${SCHEDULER_MAX_REQUESTS}/${SCHEDULER_MAX_REQUESTS_PER_SERVER})`,
  );
}

function toArrayBuffer(raw: ArrayBuffer | Uint8Array | number[]): ArrayBuffer {
  if (raw instanceof ArrayBuffer) return raw;
  if (raw instanceof Uint8Array) {
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return copy.buffer;
  }
  if (Array.isArray(raw)) {
    return new Uint8Array(raw).buffer;
  }
  throw new Error(`unexpected tile_cache_fetch payload type: ${Object.prototype.toString.call(raw)}`);
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
