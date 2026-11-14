import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    root: 'public',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(process.cwd(), 'public/index.html'),
                auth: resolve(process.cwd(), 'public/auth.html'),
            },
        },
    },
});
