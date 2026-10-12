import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /**
     * O proxy faz o front e a API parecerem a mesma origem durante o
     * desenvolvimento. Com isso o cookie httpOnly de sessao funciona igual ao
     * que vai acontecer em producao, onde o backend serve o build do front -
     * e nao existe preflight de CORS para dar problema.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Testes de interface: jsdom simula o navegador; o fetch e trocado por um
  // servidor falso em cada teste (test/ajudas.jsx), entao nada sai da maquina.
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    globals: true,
    css: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
