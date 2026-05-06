const { chromium } = require('/private/tmp/worldsim-npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const useLiveGoogleMaps = process.env.LIVE_GOOGLE_MAPS === '1';
const googleMapsKeyPattern = /AIza[0-9A-Za-z_-]+/g;
const GOOGLE_MAPS_MOCK = `
window.google = {
  maps: {
    Map: function MockMap(el, opts) {
      this.el = el;
      this.opts = opts;
      this.center = opts.center;
      this.zoom = opts.zoom;
      this.mapTypeId = opts.mapTypeId;
      el.dataset.googleMapMounted = 'true';
      el.dataset.mapTypeId = this.mapTypeId;
      this.setCenter = (center) => {
        this.center = center;
        el.dataset.center = JSON.stringify(center);
      };
      this.setZoom = (zoom) => {
        this.zoom = zoom;
        el.dataset.zoom = String(zoom);
      };
      this.setMapTypeId = (mapTypeId) => {
        this.mapTypeId = mapTypeId;
        el.dataset.mapTypeId = mapTypeId;
      };
      this.addListener = () => ({ remove() {} });
      this.getCenter = () => ({ lat: () => this.center.lat, lng: () => this.center.lng });
      this.getZoom = () => this.zoom;
    },
    Rectangle: function MockRectangle(opts) {
      this.opts = opts;
      this.bounds = opts.bounds;
      this.setBounds = (bounds) => {
        this.bounds = bounds;
      };
      this.getBounds = () => ({
        getCenter: () => ({
          lat: () => (this.bounds.north + this.bounds.south) / 2,
          lng: () => (this.bounds.east + this.bounds.west) / 2,
        }),
        getNorthEast: () => ({
          lat: () => this.bounds.north,
          lng: () => this.bounds.east,
        }),
        getSouthWest: () => ({
          lat: () => this.bounds.south,
          lng: () => this.bounds.west,
        }),
      });
      this.addListener = () => ({ remove() {} });
    },
    Geocoder: function MockGeocoder() {
      this.geocode = async () => ({
        results: [{
          formatted_address: 'Google mock 上海陆家嘴',
          geometry: {
            location: {
              lat: () => 31.238,
              lng: () => 121.501,
            },
            viewport: {
              getCenter: () => ({ lat: () => 31.238, lng: () => 121.501 }),
              getNorthEast: () => ({ lat: () => 31.244, lng: () => 121.508 }),
              getSouthWest: () => ({ lat: () => 31.232, lng: () => 121.494 }),
            },
          },
        }],
      });
    },
    event: {
      clearInstanceListeners() {},
    },
    importLibrary: async () => ({}),
  },
};
window.__googleMapsCreateWorldReady && window.__googleMapsCreateWorldReady();
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const consoleEntries = [];
  const requests = [];

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      consoleEntries.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEntries.push({ type: 'pageerror', text: error.message });
  });
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('maps.googleapis.com/maps/api/js')) {
      requests.push(url
        .replace(/([?&]key=)[^&]+/g, '$1[redacted]')
        .replace(googleMapsKeyPattern, '[redacted]'));
    }
  });

  if (!useLiveGoogleMaps) {
    await page.route('https://maps.googleapis.com/maps/api/js**', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: GOOGLE_MAPS_MOCK,
      });
    });
  }

  await page.goto(process.env.CREATE_WORLD_TEST_URL || 'http://127.0.0.1:1423/#/create-world', { waitUntil: 'networkidle' });
  await page.locator('.create-world-search input').waitFor({ timeout: 15000 });
  await page.locator('.create-world-search input').fill('上海陆家嘴');
  await page.locator('.create-world-search button').click();
  await page.waitForTimeout(useLiveGoogleMaps ? 3_000 : 100);

  const result = await page.evaluate(() => {
    const mapEl = document.querySelector('.create-world-google-map');
    const fallback = document.querySelector('.create-world-map-fallback');
    const dialog = document.querySelector('.create-world-dialog');
    const text = document.body.innerText;
    return {
      hasDialog: Boolean(dialog),
      hasGoogleMapContainer: Boolean(mapEl),
      googleMapMounted: mapEl?.dataset.googleMapMounted === 'true',
      mapTypeId: mapEl?.dataset.mapTypeId,
      hasFallback: Boolean(fallback),
      hasStaticSelectionBox: Boolean(document.querySelector('.create-world-selection-box')),
      textHasGoogleSelection: text.includes('Google Maps API 负责真实选区'),
      textHasMockAddress: text.includes('Google mock 上海陆家嘴'),
      status: document.querySelector('.create-world-status')?.textContent,
      metrics: Array.from(document.querySelectorAll('.create-world-map-metrics strong')).map((el) => el.textContent),
    };
  });

  console.log(JSON.stringify({ mode: useLiveGoogleMaps ? 'live' : 'mocked', result, requests, consoleEntries }, null, 2));
  await browser.close();
})();
