import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'FBAgent',
      formats: ['iife'],
      fileName: () => 'agent.js',
    },
    outDir: resolve(__dirname, '../api/public'),
    emptyOutDir: false,
    cssCodeSplit: false,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: false, passes: 2 },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        // Inline all CSS into JS (for Shadow DOM injection)
        assetFileNames: () => 'agent-styles.css',
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
