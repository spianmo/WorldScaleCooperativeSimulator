declare module '*.glb' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.usd' {
  const src: string;
  export default src;
}

declare module '*.usdz' {
  const src: string;
  export default src;
}

declare module '*.stl' {
  const src: string;
  export default src;
}

declare module '*.STL' {
  const src: string;
  export default src;
}

declare module '*.dae' {
  const src: string;
  export default src;
}

declare module '*.urdf' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly PUBLIC_GOOGLE_MAPS_API_KEY?: string;
  readonly GOOGLE_MAPS_API_KEY?: string;
  readonly PUBLIC_CESIUM_ION_TOKEN?: string;
  readonly CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@cesium/engine/Source/Core/ArcType.js' {
  export { ArcType as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/BoundingSphere.js' {
  export { BoundingSphere as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Cartesian2.js' {
  export { Cartesian2 as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Cartesian3.js' {
  export { Cartesian3 as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Cartographic.js' {
  export { Cartographic as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/PolygonHierarchy.js' {
  export { PolygonHierarchy as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Resource.js' {
  export { Resource as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/RequestScheduler.js' {
  export { RequestScheduler as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Color.js' {
  export { Color as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/DistanceDisplayCondition.js' {
  export { DistanceDisplayCondition as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/GoogleMaps.js' {
  export { GoogleMaps as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/HeadingPitchRange.js' {
  export { HeadingPitchRange as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/HeadingPitchRoll.js' {
  export { HeadingPitchRoll as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Ion.js' {
  export { Ion as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Math.js' {
  export { Math as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Matrix4.js' {
  export { Matrix4 as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/NearFarScalar.js' {
  export { NearFarScalar as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/ScreenSpaceEventHandler.js' {
  export { ScreenSpaceEventHandler as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/ScreenSpaceEventType.js' {
  export { ScreenSpaceEventType as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Transforms.js' {
  export { Transforms as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/buildModuleUrl.js' {
  import { buildModuleUrl } from '@cesium/engine';
  export default buildModuleUrl;
}

declare module '@cesium/engine/Source/Scene/ClassificationType.js' {
  export { ClassificationType as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Scene/HeightReference.js' {
  export { HeightReference as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Scene/ShadowMode.js' {
  export { ShadowMode as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Scene/HorizontalOrigin.js' {
  export { HorizontalOrigin as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Scene/LabelStyle.js' {
  export { LabelStyle as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Scene/VerticalOrigin.js' {
  export { VerticalOrigin as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Scene/createGooglePhotorealistic3DTileset.js' {
  import { createGooglePhotorealistic3DTileset } from '@cesium/engine';
  export default createGooglePhotorealistic3DTileset;
}

declare module '@cesium/engine/Source/Widget/CesiumWidget.js' {
  export { CesiumWidget as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/DataSources/ConstantPositionProperty.js' {
  export { ConstantPositionProperty as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/DataSources/ConstantProperty.js' {
  export { ConstantProperty as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/DataSources/CallbackProperty.js' {
  export { CallbackProperty as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/DataSources/CallbackPositionProperty.js' {
  export { CallbackPositionProperty as default } from '@cesium/engine';
}

declare module '@cesium/engine/Source/Core/Quaternion.js' {
  export { Quaternion as default } from '@cesium/engine';
}
