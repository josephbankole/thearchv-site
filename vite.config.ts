import { defineConfig } from 'vite';

// Custom domain (thearchv.ca) is served from the site root, so base = '/'.
// public/CNAME pins the domain on GitHub Pages.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    cssMinify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the heavy WebGL lib in its own chunk so first paint never waits on it.
        manualChunks: {
          three: ['three'],
          gsap: ['gsap'],
        },
      },
    },
  },
});
