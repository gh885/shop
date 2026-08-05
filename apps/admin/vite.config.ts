import { defineConfig } from 'vite';

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';

const config = defineConfig({
    resolve: { tsconfigPaths: true },
    server: {
        port: 4000,
        proxy: {
            // 同源代理到后端，规避 CORS / refresh cookie（Secure + httpOnly）跨域问题
            '/admin': { target: 'http://localhost:8080', changeOrigin: true },
        },
    },
    plugins: [tailwindcss(), viteReact(), babel({ presets: [reactCompilerPreset()] })],
});

export default config;
