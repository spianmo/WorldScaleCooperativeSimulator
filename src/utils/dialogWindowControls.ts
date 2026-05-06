import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function closeDialogWindow(fallbackHash = '#/world'): void {
  if (isTauri()) {
    void getCurrentWindow()
      .close()
      .catch(() => {
        window.location.hash = fallbackHash;
      });
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.hash = fallbackHash;
}

export function startDialogWindowDrag(): void {
  if (!isTauri()) {
    return;
  }
  void getCurrentWindow()
    .startDragging()
    .catch(() => undefined);
}
