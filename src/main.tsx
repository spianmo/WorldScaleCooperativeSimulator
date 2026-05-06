import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './i18n';
import './styles/tailwind.css';
import { installTileCacheInterceptor } from './utils/installTileCacheInterceptor';

installTileCacheInterceptor();

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
