import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import wasm from 'vite-plugin-wasm';
import { visualizer } from 'rollup-plugin-visualizer';
import { brotliCompressSync, constants, gzipSync } from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const hasTerser = (() => {
  try {
    require.resolve('terser');
    return true;
  } catch {
    return false;
  }
})();

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value?.trim() || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveManualChunk = (id: string): string | undefined => {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (id.includes('framer-motion') || id.includes('motion')) {
    return 'motion';
  }

  if (id.includes('@react-three') || id.includes('three') || id.includes('cobe')) {
    return '3d';
  }

  if (id.includes('hash-wasm') || id.includes('crypto-core') || id.includes('crypto-js')) {
    return 'crypto-core';
  }

  if (id.includes('libsodium') || id.includes('pqc-kyber') || id.includes('noble')) {
    return 'crypto-pqc';
  }

  if (id.includes('heic2any') || id.includes('html-to-image')) {
    return 'image-processing';
  }

  if (id.includes('otpauth') || id.includes('jsonwebtoken') || id.includes('bcrypt')) {
    return 'auth-security';
  }

  if (
    id.includes('react-markdown') ||
    id.includes('rehype-raw') ||
    id.includes('rehype-sanitize') ||
    id.includes('remark') ||
    id.includes('marked') ||
    id.includes('dompurify')
  ) {
    return 'markdown';
  }

  if (id.includes('@tiptap') || id.includes('prosemirror')) {
    return 'rich-text-editor';
  }

  if (id.includes('@tsparticles') || id.includes('particles')) {
    return 'particles';
  }

  if (id.includes('hls.js') || id.includes('shaka-player')) {
    return 'video-players';
  }

  if (id.includes('@sentry')) {
    return 'sentry';
  }

  if (id.includes('emoji-mart') || id.includes('@emoji-mart')) {
    return 'emoji';
  }

  if (id.includes('@dnd-kit')) {
    return 'dnd-kit';
  }

  if (id.includes('sonner')) {
    return 'sonner';
  }

  if (id.includes('qrcode') || id.includes('speakeasy')) {
    return '2fa-qrcode';
  }

  if (id.includes('logrocket')) {
    return 'logrocket';
  }

  if (id.includes('socket.io')) {
    return 'realtime';
  }

  if (id.includes('lucide-react')) {
    return 'icons';
  }

  if (
    id.includes('radix-ui') ||
    id.includes('@radix-ui') ||
    id.includes('class-variance-authority') ||
    id.includes('tailwind-merge')
  ) {
    return 'ui-primitives';
  }

  if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
    return 'react-framework';
  }

  if (
    id.includes('zod') ||
    id.includes('axios') ||
    id.includes('zustand') ||
    id.includes('date-fns')
  ) {
    return 'utils';
  }

  return 'vendor';
};

const createCompressedAssetsPlugin = () => ({
  name: 'compressed-assets',
  apply: 'build' as const,
  generateBundle(_options: unknown, bundle: Record<string, any>) {
    const compressibleFilePattern =
      /\.(js|mjs|cjs|css|html|svg|json|txt|xml|map|wasm|webmanifest)$/i;
    const textLikeFilePattern = /\.(js|mjs|cjs|css|html|svg|json|txt|xml|map|webmanifest)$/i;

    for (const [fileName, output] of Object.entries(bundle)) {
      if (!compressibleFilePattern.test(fileName)) {
        continue;
      }

      const source =
        output.type === 'asset'
          ? typeof output.source === 'string'
            ? Buffer.from(output.source)
            : Buffer.isBuffer(output.source)
              ? output.source
              : Buffer.from(output.source)
          : Buffer.from(output.code);

      if (source.length < 1024) {
        continue;
      }

      this.emitFile({
        type: 'asset',
        fileName: `${fileName}.gz`,
        source: gzipSync(source, { level: 9 }),
      });

      this.emitFile({
        type: 'asset',
        fileName: `${fileName}.br`,
        source: brotliCompressSync(source, {
          params: {
            [constants.BROTLI_PARAM_MODE]: textLikeFilePattern.test(fileName)
              ? constants.BROTLI_MODE_TEXT
              : constants.BROTLI_MODE_GENERIC,
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_LGWIN]: 24,
            [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
          },
        }),
      });
    }
  },
});

const createSafePreloadDepsPlugin = () => ({
  name: 'safe-preload-deps',
  apply: 'build' as const,
  generateBundle(_options: unknown, bundle: Record<string, any>) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk' || typeof output.code !== 'string') {
        continue;
      }

      if (!output.code.includes('modulepreload') || !output.code.includes('.map(')) {
        continue;
      }

      // Some optimized builds emit preload dependency payloads that are not arrays.
      // Coerce the payload defensively so preload never throws at runtime.
      output.code = output.code.replace(
        /if\((\w+)&&\1\.length>0\)\{let e=document\.getElementsByTagName\(`link`\)/g,
        'if($1!=null&&($1=Array.isArray($1)?$1:[$1]).length>0){let e=document.getElementsByTagName(`link`)'
      );

      output.code = output.code.replace(
        /r=o\(t\.map\(/g,
        't=Array.isArray(t)?t:t==null?[]:[t],r=o(t.map('
      );
    }
  },
});

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const shouldAnalyzeBundle = env.ANALYZE_BUNDLE === 'true';
  const isProduction = mode === 'production';
  const devHost = env.VITE_DEV_HOST?.trim() || '0.0.0.0';
  const devPort = toNumber(env.VITE_DEV_PORT, 5173);
  const previewHost = env.VITE_PREVIEW_HOST?.trim() || '0.0.0.0';
  const previewPort = toNumber(env.VITE_PREVIEW_PORT, 4173);
  const strictPort = toBoolean(env.VITE_STRICT_PORT, true);
  const shouldOpen = toBoolean(env.VITE_OPEN, false);
  const devApiTarget = env.VITE_DEV_API_BASE_URL?.trim() || 'http://127.0.0.1:4000';
  const sourcemap =
    env.VITE_BUILD_SOURCEMAP?.trim() ||
    (() => {
      if (!isProduction) {
        return 'inline';
      }

      // In production, publish maps when Sentry/source-map diagnostics are enabled
      // so first-party bundles remain debuggable in audits.
      return toBoolean(env.VITE_SENTRY_SOURCEMAPS, false) ? true : false;
    })();
  const chunkSizeWarningLimit = toNumber(env.VITE_CHUNK_SIZE_WARNING_LIMIT, 3000);
  const minify = env.VITE_BUILD_MINIFY?.trim() || (isProduction && hasTerser ? 'terser' : 'oxc');
  const fallbackPublicUrl = 'https://localhost';

  const normalizedPublicUrl = (() => {
    const raw = env.VITE_APP_PUBLIC_URL?.trim();
    if (!raw) {
      return fallbackPublicUrl;
    }
    try {
      return new URL(raw).toString();
    } catch {
      return fallbackPublicUrl;
    }
  })();

  const normalizedDnsPrefetchHost = (() => {
    const raw = env.VITE_DNS_PREFETCH_HOST?.trim();
    if (raw) {
      return raw;
    }
    try {
      return `//${new URL(normalizedPublicUrl).host}`;
    } catch {
      return '//localhost';
    }
  })();

  // Define fallback defaults for environment variables used in HTML templates
  const htmlTemplateDefaults = {
    VITE_APP_PUBLIC_URL: normalizedPublicUrl,
    VITE_DNS_PREFETCH_HOST: normalizedDnsPrefetchHost,
  };

  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      wasm(),
      createSafePreloadDepsPlugin(),
      createCompressedAssetsPlugin(),
      {
        name: 'html-template-variables',
        enforce: 'pre',
        transformIndexHtml(html) {
          // Replace Vite HTML template variables with environment values
          let transformed = html;
          for (const [key, value] of Object.entries(htmlTemplateDefaults)) {
            transformed = transformed.replace(new RegExp(`%${key}%`, 'g'), String(value));
          }
          return transformed;
        },
      },
      ...(shouldAnalyzeBundle
        ? [
            visualizer({
              filename: 'stats.html',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],

    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || mode),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      __SENTRY_RELEASE__: JSON.stringify(
        env.VITE_SENTRY_RELEASE ||
          env.VITE_APP_RELEASE ||
          process.env.npm_package_version ||
          '1.0.0'
      ),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      'import.meta.env.VITE_APP_PUBLIC_URL': JSON.stringify(normalizedPublicUrl),
      'import.meta.env.VITE_DNS_PREFETCH_HOST': JSON.stringify(normalizedDnsPrefetchHost),
    },

    envPrefix: ['VITE_', 'APP_'],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'pqc-kyber': path.resolve(__dirname, './node_modules/pqc-kyber/pqc_kyber.js'),
      },
    },

    optimizeDeps: {
      exclude: ['pqc-kyber'],
      rolldownOptions: {
        external: ['pqc-kyber'],
      },
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'framer-motion',
        'hash-wasm',
        'libsodium-wrappers',
      ],
      force: mode === 'development',
    },

    server: {
      host: devHost,
      port: devPort,
      strictPort,
      open: shouldOpen,
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
        },
        '/health': {
          target: devApiTarget,
          changeOrigin: true,
        },
        '/ready': {
          target: devApiTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: devApiTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: devApiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/.git/**',
          '**/node_modules/**',
          '**/backups/**',
          '**/build/**',
          '**/logs/**',
          '**/playwright-report/**',
          '**/test-results/**',
          '**/stats.html',
          '**/*.zip',
        ],
      },
    },

    preview: {
      host: previewHost,
      port: previewPort,
      strictPort,
    },

    oxc: {
      transform: {
        target: 'es2022',
      },
    },

    build: {
      outDir: 'build',
      assetsDir: 'assets',
      modulePreload: false,
      sourcemap,
      minify,
      manifest: isProduction,
      cssMinify: true,
      reportCompressedSize: false, // Significant speed boost by skipping gzip/brotli size calculation
      terserOptions: {
        module: true,
        format: {
          comments: false,
        },
        compress: {
          passes: 2,
        },
        mangle: true,
      },
      // Optimize Rolldown performance
      rolldownOptions: {
        treeshake: {
          moduleSideEffects: false,
        },
        output: {
          manualChunks: resolveManualChunk,
          format: 'es',
        },
        onwarn(warning) {
          if (String(warning?.message || '').includes('PLUGIN_TIMINGS')) {
            return;
          }
          // Suppress the COMMONJS_VARIABLE_IN_ESM warning which comes from dependencies
          if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') {
            return;
          }
          // Chain to default formatter
          console.warn(warning);
        },
      },
      rollupOptions: {
        external: [],
        output: {
          manualChunks: resolveManualChunk,
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
        onwarn(warning) {
          if (String(warning?.message || '').includes('PLUGIN_TIMINGS')) {
            return;
          }
          // Suppress warnings for tiny icon chunks (< 1KB) - these are normal from lucide-react
          if (
            warning.code === 'CHUNK_SIZE_WARNING' &&
            warning.customMessage?.includes('shared chunk')
          ) {
            const isTinyChunk = warning.message?.includes('0.'); // Matches 0.xx kB
            if (isTinyChunk) {
              return;
            }
          }
          // Proceed with other warnings
          console.warn(warning.message || String(warning));
        },
      },

      chunkSizeWarningLimit,
      target: ['es2022', 'chrome105', 'safari15', 'firefox105'],
      cssCodeSplit: true,
      assetsInlineLimit: 4096, // Keep small icons inlined
    },

    css: {
      devSourcemap: !isProduction,
    },
  };
});
