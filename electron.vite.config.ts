import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const appVariant = process.env.APP_VARIANT === 'pos' ? 'pos' : 'management';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], define: { __APP_VARIANT__: JSON.stringify(appVariant) } },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()], define: { __APP_VARIANT__: JSON.stringify(appVariant) } },
});