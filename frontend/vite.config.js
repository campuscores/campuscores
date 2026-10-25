import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig(() => {
  const upload = process.env.SENTRY_UPLOAD === 'true';
  if (upload && (!process.env.SENTRY_AUTH_TOKEN || !process.env.VITE_SENTRY_DSN || !process.env.SENTRY_RELEASE ||
    !['campuscores-staging', 'campuscores-production'].includes(process.env.SENTRY_PROJECT))) {
    throw new Error('Sentry upload requires the environment token, public DSN, release and project.');
  }
  return {
    build: { sourcemap: upload ? 'hidden' : false },
    plugins: [react(), ...(upload ? [sentryVitePlugin({
      org: 'arnav-bhatia', project: process.env.SENTRY_PROJECT, telemetry: false,
      release: { name: process.env.SENTRY_RELEASE, setCommits: false, deploy: false },
      sourcemaps: { assets: './dist/assets/**', filesToDeleteAfterUpload: './dist/assets/**/*.map' },
    })] : [])],
  };
});
