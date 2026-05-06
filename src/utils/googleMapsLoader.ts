const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-create-world-api';

function readImportMetaEnv(name: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const value = env?.[name]?.trim();
  return value || undefined;
}

function resolveGoogleMapsApiKey() {
  return readImportMetaEnv('PUBLIC_GOOGLE_MAPS_API_KEY') ?? readImportMetaEnv('GOOGLE_MAPS_API_KEY');
}

export function getConfiguredGoogleMapsApiKey() {
  return resolveGoogleMapsApiKey();
}

export async function loadGoogleMapsLibraries(libraryNames: string[]) {
  const apiKey = resolveGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('缺少 Google Maps API key，请在 config/maps.toml 的 [google_maps].api_key 或 PUBLIC_GOOGLE_MAPS_API_KEY 中配置。');
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Google Maps JavaScript API 只能在浏览器窗口中加载。');
  }

  if (!window.google?.maps?.importLibrary) {
    window.__googleMapsCreateWorldLoader ??= new Promise<void>((resolve, reject) => {
      window.__googleMapsCreateWorldReady = resolve;

      const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('error', () => reject(new Error('Google Maps JavaScript API 加载失败。')), { once: true });
        return;
      }

      const script = document.createElement('script');
      const params = new URLSearchParams({
        key: apiKey,
        v: 'weekly',
        loading: 'async',
        callback: '__googleMapsCreateWorldReady',
      });

      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.onerror = () => reject(new Error('Google Maps JavaScript API 加载失败，请检查网络、API key 和 Maps JavaScript API 授权。'));
      document.head.appendChild(script);
    });

    await window.__googleMapsCreateWorldLoader;
  }

  await Promise.all(libraryNames.map((libraryName) => window.google?.maps.importLibrary(libraryName)));

  if (!window.google?.maps?.Map || !window.google.maps.Rectangle || !window.google.maps.Geocoder) {
    throw new Error('Google Maps JavaScript API 未返回 Map、Rectangle 或 Geocoder 能力。');
  }

  return window.google.maps;
}
