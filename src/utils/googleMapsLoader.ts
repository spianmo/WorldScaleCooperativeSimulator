import { tx } from '../i18n';

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
    throw new Error(tx('googleMapsLoader.missingKey'));
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error(tx('googleMapsLoader.browserOnly'));
  }

  if (!window.google?.maps?.importLibrary) {
    window.__googleMapsCreateWorldLoader ??= new Promise<void>((resolve, reject) => {
      window.__googleMapsCreateWorldReady = resolve;

      const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('error', () => reject(new Error(tx('googleMapsLoader.loadFailed'))), { once: true });
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
      script.onerror = () => reject(new Error(tx('googleMapsLoader.loadFailedDetailed')));
      document.head.appendChild(script);
    });

    await window.__googleMapsCreateWorldLoader;
  }

  await Promise.all(libraryNames.map((libraryName) => window.google?.maps.importLibrary(libraryName)));

  if (!window.google?.maps?.Map || !window.google.maps.Rectangle || !window.google.maps.Geocoder) {
    throw new Error(tx('googleMapsLoader.missingCapabilities'));
  }

  return window.google.maps;
}
