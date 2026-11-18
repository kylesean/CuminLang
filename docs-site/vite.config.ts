import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Copy index.html to home.html and 404.html after bundling so legacy /home.html
 * links and direct deep-link refreshes resolve cleanly on GitHub Pages.
 */
const copyCompatPagesPlugin = () => ({
    name: 'cuminlang-docs-compat-pages',
    closeBundle: () => {
        const outDir = path.resolve(__dirname, 'dist');
        const indexPath = path.join(outDir, 'index.html');
        if (!fs.existsSync(indexPath)) return;
        fs.copyFileSync(indexPath, path.join(outDir, 'home.html'));
        fs.copyFileSync(indexPath, path.join(outDir, '404.html'));
    },
});

export default defineConfig({
    root: __dirname,
    base: '/CuminLang/',
    publicDir: false,
    plugins: [
        tailwindcss(),
        react(),
        copyCompatPagesPlugin(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../src'),
        },
    },
    build: {
        outDir: path.resolve(__dirname, 'dist'),
        emptyOutDir: true,
    },
});
