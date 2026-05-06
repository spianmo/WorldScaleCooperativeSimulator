// Node polyfills required by three's loaders/exporters.
// Shared between scripts/bake-urdf-to-glb.mjs and scripts/inject-glb-animations.mjs.

import { JSDOM } from 'jsdom';

const jsdomWindow = new JSDOM('<!doctype html><html><body></body></html>').window;
globalThis.DOMParser = jsdomWindow.DOMParser;
globalThis.Document = jsdomWindow.Document;
globalThis.Element = jsdomWindow.Element;

// GLTFExporter writes GLB through FileReader -> ArrayBuffer. Node has Blob but no FileReader.
class FileReaderShim {
  constructor() {
    this.result = null;
    this.onloadend = null;
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
}
globalThis.FileReader = FileReaderShim;
