import config from '../../electron.vite.config';

// Controlled comparison: identical production bundles except for renderer
// snapshot identity reuse. No application source is reverted for this build.
export default {
  ...config,
  renderer: {
    ...config.renderer,
    plugins: [
      ...config.renderer.plugins,
      {
        name: 'library-performance-without-sharing',
        enforce: 'pre',
        load(id: string) {
          if (id.replaceAll('\\', '/').endsWith('/stores/reconcile-snapshot.ts')) {
            return 'export function reconcileSnapshot(previous, incoming) { return incoming; }';
          }
        },
      },
    ],
  },
};
