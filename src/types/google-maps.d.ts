export {};

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __googleMapsCreateWorldLoader?: Promise<void>;
    __googleMapsCreateWorldReady?: () => void;
  }

  const google: GoogleMapsNamespace | undefined;

  interface GoogleMapsNamespace {
    maps: {
      Map: GoogleMapsMapConstructor;
      Rectangle: GoogleMapsRectangleConstructor;
      Marker: GoogleMapsMarkerConstructor;
      Size: GoogleMapsSizeConstructor;
      Geocoder: GoogleMapsGeocoderConstructor;
      importLibrary: (libraryName: string) => Promise<unknown>;
      event: {
        clearInstanceListeners: (instance: object) => void;
      };
    };
  }

  interface GoogleMapsMapConstructor {
    new (container: HTMLElement, options: GoogleMapsMapOptions): GoogleMapsMap;
  }

  interface GoogleMapsMap {
    setCenter: (center: GoogleMapsLatLngLiteral) => void;
    panTo: (center: GoogleMapsLatLngLiteral) => void;
    setZoom: (zoom: number) => void;
    setMapTypeId: (mapTypeId: GoogleMapsMapTypeId) => void;
    addListener: (eventName: string, handler: (event?: GoogleMapsMapMouseEvent) => void) => GoogleMapsListener;
    getCenter: () => GoogleMapsLatLng | undefined;
    getZoom: () => number | undefined;
    fitBounds: (
      bounds: GoogleMapsBoundsLiteral | GoogleMapsLatLngBounds,
      padding?: number | { top?: number; right?: number; bottom?: number; left?: number },
    ) => void;
    setOptions: (options: Partial<GoogleMapsMapOptions>) => void;
  }

  interface GoogleMapsMarkerConstructor {
    new (options: GoogleMapsMarkerOptions): GoogleMapsMarker;
  }

  interface GoogleMapsMarker {
    setPosition: (position: GoogleMapsLatLngLiteral) => void;
    getPosition: () => GoogleMapsLatLng | undefined;
    setMap: (map: GoogleMapsMap | null) => void;
    addListener: (eventName: string, handler: () => void) => GoogleMapsListener;
  }

  interface GoogleMapsMarkerOptions {
    position: GoogleMapsLatLngLiteral;
    map?: GoogleMapsMap;
    title?: string;
    draggable?: boolean;
  }

  interface GoogleMapsRectangleConstructor {
    new (options: GoogleMapsRectangleOptions): GoogleMapsRectangle;
  }

  interface GoogleMapsRectangle {
    setBounds: (bounds: GoogleMapsBoundsLiteral) => void;
    getBounds: () => GoogleMapsLatLngBounds | undefined;
    setMap: (map: GoogleMapsMap | null) => void;
    setOptions: (options: Partial<GoogleMapsRectangleOptions>) => void;
    addListener: (eventName: string, handler: () => void) => GoogleMapsListener;
  }

  interface GoogleMapsSizeConstructor {
    new (width: number, height: number): GoogleMapsSize;
  }

  interface GoogleMapsSize {
    width: number;
    height: number;
  }

  interface GoogleMapsGeocoderConstructor {
    new (): GoogleMapsGeocoder;
  }

  interface GoogleMapsGeocoder {
    geocode: (
      request: { address: string } | { location: { lat: number; lng: number } },
    ) => Promise<{ results: GoogleMapsGeocoderResult[] }>;
  }

  interface GoogleMapsGeocoderResult {
    formatted_address?: string;
    geometry: {
      location: GoogleMapsLatLng;
      viewport?: GoogleMapsLatLngBounds;
    };
  }

  interface GoogleMapsLatLng {
    lat: () => number;
    lng: () => number;
  }

  interface GoogleMapsLatLngBounds {
    getCenter: () => GoogleMapsLatLng;
    getNorthEast: () => GoogleMapsLatLng;
    getSouthWest: () => GoogleMapsLatLng;
  }

  interface GoogleMapsMapMouseEvent {
    latLng?: GoogleMapsLatLng;
  }

  interface GoogleMapsListener {
    remove: () => void;
  }

  interface GoogleMapsMapOptions {
    center: GoogleMapsLatLngLiteral;
    zoom: number;
    mapTypeId: GoogleMapsMapTypeId;
    disableDefaultUI?: boolean;
    clickableIcons?: boolean;
    gestureHandling?: 'cooperative' | 'greedy' | 'none' | 'auto';
    mapTypeControl?: boolean;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
    zoomControl?: boolean;
    scaleControl?: boolean;
    cameraControl?: boolean;
    mapId?: string;
  }

  interface GoogleMapsRectangleOptions {
    bounds?: GoogleMapsBoundsLiteral;
    draggable?: boolean;
    editable?: boolean;
    clickable?: boolean;
    fillColor?: string;
    fillOpacity?: number;
    map?: GoogleMapsMap | null;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
  }

  interface GoogleMapsDrawingManager {
    setMap: (map: GoogleMapsMap | null) => void;
    setDrawingMode: (mode: string | null) => void;
    setOptions: (options: Partial<GoogleMapsDrawingManagerOptions>) => void;
    addListener: (
      eventName: string,
      handler: (overlay: GoogleMapsRectangle) => void,
    ) => GoogleMapsListener;
  }

  interface GoogleMapsDrawingManagerConstructor {
    new (options: GoogleMapsDrawingManagerOptions): GoogleMapsDrawingManager;
  }

  interface GoogleMapsDrawingManagerOptions {
    drawingMode?: string | null;
    drawingControl?: boolean;
    rectangleOptions?: Partial<Omit<GoogleMapsRectangleOptions, 'bounds' | 'map'>>;
  }

  interface GoogleMapsDrawingLibrary {
    DrawingManager: GoogleMapsDrawingManagerConstructor;
    OverlayType: { RECTANGLE: string };
  }

  interface GoogleMapsLatLngLiteral {
    lat: number;
    lng: number;
  }

  interface GoogleMapsBoundsLiteral {
    north: number;
    south: number;
    east: number;
    west: number;
  }

  type GoogleMapsMapTypeId = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
}
