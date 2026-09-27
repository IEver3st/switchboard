// Review-only stub: controls when the canonical snapshot arrives so the startup
// screen can be captured. Never loaded by the product.
const { contextBridge } = require('electron');
const mode = (process.argv.find((a) => a.startsWith('--startup-mode=')) ?? '--startup-mode=pending').split('=')[1];
const noop = () => undefined;
contextBridge.exposeInMainWorld('switchboard', {
  subscribe: () => noop,
  subscribeAudioMeters: () => noop,
  setUiScale: noop,
  getSnapshot: () => mode === 'fail'
    ? Promise.reject(new Error('Saved settings could not be read: EACCES preferences.json'))
    : new Promise(() => undefined),
});
