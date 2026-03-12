/**
 * Desktop shell bootstrap.
 *
 * Electron injects window.desktopBridge from preload before app code runs.
 * The web build therefore only needs a readiness gate for consistency.
 */
let readyResolver!: () => void;

export const ready = new Promise<void>((resolve) => {
  readyResolver = resolve;
});

readyResolver();
