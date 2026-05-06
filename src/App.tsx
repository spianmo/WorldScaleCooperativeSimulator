import { useEffect, useState } from 'react';
import { setAppLocale } from './i18n';
import { SimulationProvider, useSimulation } from './state/SimulationContext';
import { ControlWindow } from './windows/ControlWindow';
import { CreateDeviceWindow } from './windows/CreateDeviceWindow';
import { CreateWorldWindow } from './windows/CreateWorldWindow';
import { DeviceWindow } from './windows/DeviceWindow';
import { GlassesWindow } from './windows/GlassesWindow';
import { SettingsWindow } from './windows/SettingsWindow';
import { TaskWindow } from './windows/TaskWindow';
import { WorldWindow } from './windows/WorldWindow';

function resolveRoute() {
  let hash = window.location.hash.replace(/^#\/?/, '');
  // 剥离 query string（如 ?mode=edit），避免被 split('/') 当成 name 的一部分；
  // 子组件仍可读 window.location.hash 自行解析 query。
  const queryIdx = hash.indexOf('?');
  if (queryIdx >= 0) {
    hash = hash.slice(0, queryIdx);
  }
  const [name, id] = hash.split('/');
  return {
    name: name || 'world',
    id,
  };
}

function RoutedWindow() {
  const { state } = useSimulation();
  const [route, setRoute] = useState(resolveRoute);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme.resolvedMode;
    document.documentElement.dataset.logDensity = state.settings.terminalLogDensity;
    document.documentElement.lang = state.settings.locale;
    void setAppLocale(state.settings.locale);
  }, [state.settings.locale, state.settings.terminalLogDensity, state.settings.theme.resolvedMode]);

  useEffect(() => {
    const updateRoute = () => setRoute(resolveRoute());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  if (route.name === 'settings') {
    return <SettingsWindow />;
  }

  if (route.name === 'create-world') {
    return <CreateWorldWindow />;
  }

  if (route.name === 'create-device') {
    return <CreateDeviceWindow />;
  }

  if (route.name === 'edit-device') {
    return <CreateDeviceWindow editingDeviceId={route.id ?? ''} />;
  }

  if (route.name === 'control') {
    return <ControlWindow />;
  }

  if (route.name === 'glasses') {
    return <GlassesWindow />;
  }

  if (route.name === 'device') {
    return <DeviceWindow deviceId={route.id ?? ''} />;
  }

  if (route.name === 'task') {
    return <TaskWindow taskId={route.id ?? ''} />;
  }

  return <WorldWindow />;
}

export function App() {
  return (
    <SimulationProvider>
      <RoutedWindow />
    </SimulationProvider>
  );
}
