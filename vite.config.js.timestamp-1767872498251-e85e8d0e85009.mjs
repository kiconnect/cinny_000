// vite.config.js
import { defineConfig } from "file:///home/alfred/cinny/.yarn/__virtual__/vite-virtual-8664595d6c/2/.yarn/berry/cache/vite-npm-5.4.19-6d369030b0-10c0.zip/node_modules/vite/dist/node/index.js";
import react from "file:///home/alfred/cinny/.yarn/__virtual__/@vitejs-plugin-react-virtual-fe4dc85d81/2/.yarn/berry/cache/@vitejs-plugin-react-npm-4.2.0-d680dc596c-10c0.zip/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { wasm } from "file:///home/alfred/cinny/.yarn/__virtual__/@rollup-plugin-wasm-virtual-adc5216145/2/.yarn/berry/cache/@rollup-plugin-wasm-npm-6.1.1-7b1c4adba0-10c0.zip/node_modules/@rollup/plugin-wasm/dist/es/index.js";
import { viteStaticCopy } from "file:///home/alfred/cinny/.yarn/__virtual__/vite-plugin-static-copy-virtual-c0e807598d/2/.yarn/berry/cache/vite-plugin-static-copy-npm-1.0.4-0ca97fd897-10c0.zip/node_modules/vite-plugin-static-copy/dist/index.js";
import { vanillaExtractPlugin } from "file:///home/alfred/cinny/.yarn/__virtual__/@vanilla-extract-vite-plugin-virtual-ebc30a8e6c/2/.yarn/berry/cache/@vanilla-extract-vite-plugin-npm-3.7.1-830afedf78-10c0.zip/node_modules/@vanilla-extract/vite-plugin/dist/vanilla-extract-vite-plugin.cjs.js";
import { NodeGlobalsPolyfillPlugin } from "file:///home/alfred/cinny/.yarn/unplugged/@esbuild-plugins-node-globals-polyfill-virtual-01d4ae60bd/node_modules/@esbuild-plugins/node-globals-polyfill/dist/index.js";
import inject from "file:///home/alfred/cinny/.yarn/__virtual__/@rollup-plugin-inject-virtual-94a2c2a53b/2/.yarn/berry/cache/@rollup-plugin-inject-npm-5.0.3-0ce2de9e38-10c0.zip/node_modules/@rollup/plugin-inject/dist/es/index.js";
import topLevelAwait from "file:///home/alfred/cinny/.yarn/__virtual__/vite-plugin-top-level-await-virtual-53035654d6/2/.yarn/berry/cache/vite-plugin-top-level-await-npm-1.4.4-4807ec3add-10c0.zip/node_modules/vite-plugin-top-level-await/exports/import.mjs";
import { VitePWA } from "file:///home/alfred/cinny/.yarn/__virtual__/vite-plugin-pwa-virtual-256ae02190/2/.yarn/berry/cache/vite-plugin-pwa-npm-0.20.5-f1e0d20c81-10c0.zip/node_modules/vite-plugin-pwa/dist/index.js";
import fs from "fs";
import path from "path";

// build.config.ts
var build_config_default = {
  base: "/"
};

// vite.config.js
var copyFiles = {
  targets: [
    {
      src: "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
      dest: "",
      rename: "pdf.worker.min.js"
    },
    {
      src: "netlify.toml",
      dest: ""
    },
    {
      src: "config.json",
      dest: ""
    },
    {
      src: "public/manifest.json",
      dest: ""
    },
    {
      src: "public/res/android",
      dest: "public/"
    },
    {
      src: "public/locales",
      dest: "public/"
    }
  ]
};
function serverMatrixSdkCryptoWasm(wasmFilePath) {
  return {
    name: "vite-plugin-serve-matrix-sdk-crypto-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === wasmFilePath) {
          const resolvedPath = path.join(path.resolve(), "/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm");
          if (fs.existsSync(resolvedPath)) {
            res.setHeader("Content-Type", "application/wasm");
            res.setHeader("Cache-Control", "no-cache");
            const fileStream = fs.createReadStream(resolvedPath);
            fileStream.pipe(res);
          } else {
            res.writeHead(404);
            res.end("File not found");
          }
        } else {
          next();
        }
      });
    }
  };
}
var vite_config_default = defineConfig({
  appType: "spa",
  publicDir: false,
  base: build_config_default.base,
  server: {
    port: 8080,
    host: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: [".."]
    }
  },
  plugins: [
    serverMatrixSdkCryptoWasm("/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm"),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: "__tla",
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`
    }),
    viteStaticCopy(copyFiles),
    vanillaExtractPlugin(),
    wasm(),
    react(),
    VitePWA({
      srcDir: "src",
      filename: "sw.ts",
      strategies: "injectManifest",
      injectRegister: false,
      manifest: false,
      injectManifest: {
        injectionPoint: void 0
      },
      devOptions: {
        enabled: true,
        type: "module"
      }
    })
  ],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis"
      },
      plugins: [
        // Enable esbuild polyfill plugins
        NodeGlobalsPolyfillPlugin({
          process: false,
          buffer: true
        })
      ]
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    copyPublicDir: false,
    rollupOptions: {
      plugins: [inject({ Buffer: ["buffer", "Buffer"] })]
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiLCAiYnVpbGQuY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvYWxmcmVkL2Npbm55XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9hbGZyZWQvY2lubnkvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvYWxmcmVkL2Npbm55L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgd2FzbSB9IGZyb20gJ0Byb2xsdXAvcGx1Z2luLXdhc20nO1xuaW1wb3J0IHsgdml0ZVN0YXRpY0NvcHkgfSBmcm9tICd2aXRlLXBsdWdpbi1zdGF0aWMtY29weSc7XG5pbXBvcnQgeyB2YW5pbGxhRXh0cmFjdFBsdWdpbiB9IGZyb20gJ0B2YW5pbGxhLWV4dHJhY3Qvdml0ZS1wbHVnaW4nO1xuaW1wb3J0IHsgTm9kZUdsb2JhbHNQb2x5ZmlsbFBsdWdpbiB9IGZyb20gJ0Blc2J1aWxkLXBsdWdpbnMvbm9kZS1nbG9iYWxzLXBvbHlmaWxsJztcbmltcG9ydCBpbmplY3QgZnJvbSAnQHJvbGx1cC9wbHVnaW4taW5qZWN0JztcbmltcG9ydCB0b3BMZXZlbEF3YWl0IGZyb20gJ3ZpdGUtcGx1Z2luLXRvcC1sZXZlbC1hd2FpdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcbmltcG9ydCBmcyBmcm9tICdmcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBidWlsZENvbmZpZyBmcm9tICcuL2J1aWxkLmNvbmZpZyc7XG5cbmNvbnN0IGNvcHlGaWxlcyA9IHtcbiAgdGFyZ2V0czogW1xuICAgIHtcbiAgICAgIHNyYzogJ25vZGVfbW9kdWxlcy9wZGZqcy1kaXN0L2J1aWxkL3BkZi53b3JrZXIubWluLm1qcycsXG4gICAgICBkZXN0OiAnJyxcbiAgICAgIHJlbmFtZTogJ3BkZi53b3JrZXIubWluLmpzJyxcbiAgICB9LFxuICAgIHtcbiAgICAgIHNyYzogJ25ldGxpZnkudG9tbCcsXG4gICAgICBkZXN0OiAnJyxcbiAgICB9LFxuICAgIHtcbiAgICAgIHNyYzogJ2NvbmZpZy5qc29uJyxcbiAgICAgIGRlc3Q6ICcnLFxuICAgIH0sXG4gICAge1xuICAgICAgc3JjOiAncHVibGljL21hbmlmZXN0Lmpzb24nLFxuICAgICAgZGVzdDogJycsXG4gICAgfSxcbiAgICB7XG4gICAgICBzcmM6ICdwdWJsaWMvcmVzL2FuZHJvaWQnLFxuICAgICAgZGVzdDogJ3B1YmxpYy8nLFxuICAgIH0sXG4gICAge1xuICAgICAgc3JjOiAncHVibGljL2xvY2FsZXMnLFxuICAgICAgZGVzdDogJ3B1YmxpYy8nLFxuICAgIH0sXG4gIF0sXG59O1xuXG5mdW5jdGlvbiBzZXJ2ZXJNYXRyaXhTZGtDcnlwdG9XYXNtKHdhc21GaWxlUGF0aCkge1xuICByZXR1cm4ge1xuICAgIG5hbWU6ICd2aXRlLXBsdWdpbi1zZXJ2ZS1tYXRyaXgtc2RrLWNyeXB0by13YXNtJyxcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XG4gICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgICAgICBpZiAocmVxLnVybCA9PT0gd2FzbUZpbGVQYXRoKSB7XG4gICAgICAgICAgY29uc3QgcmVzb2x2ZWRQYXRoID0gcGF0aC5qb2luKHBhdGgucmVzb2x2ZSgpLCBcIi9ub2RlX21vZHVsZXMvQG1hdHJpeC1vcmcvbWF0cml4LXNkay1jcnlwdG8td2FzbS9wa2cvbWF0cml4X3Nka19jcnlwdG9fd2FzbV9iZy53YXNtXCIpO1xuXG4gICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMocmVzb2x2ZWRQYXRoKSkge1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL3dhc20nKTtcbiAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NhY2hlLUNvbnRyb2wnLCAnbm8tY2FjaGUnKTtcblxuICAgICAgICAgICAgY29uc3QgZmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0ocmVzb2x2ZWRQYXRoKTtcbiAgICAgICAgICAgIGZpbGVTdHJlYW0ucGlwZShyZXMpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwNCk7XG4gICAgICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZCcpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBuZXh0KCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIGFwcFR5cGU6ICdzcGEnLFxuICBwdWJsaWNEaXI6IGZhbHNlLFxuICBiYXNlOiBidWlsZENvbmZpZy5iYXNlLFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA4MDgwLFxuICAgIGhvc3Q6IHRydWUsXG4gICAgZnM6IHtcbiAgICAgIC8vIEFsbG93IHNlcnZpbmcgZmlsZXMgZnJvbSBvbmUgbGV2ZWwgdXAgdG8gdGhlIHByb2plY3Qgcm9vdFxuICAgICAgYWxsb3c6IFsnLi4nXSxcbiAgICB9LFxuICB9LFxuICBwbHVnaW5zOiBbXG4gICAgc2VydmVyTWF0cml4U2RrQ3J5cHRvV2FzbSgnL25vZGVfbW9kdWxlcy8udml0ZS9kZXBzL3BrZy9tYXRyaXhfc2RrX2NyeXB0b193YXNtX2JnLndhc20nKSxcbiAgICB0b3BMZXZlbEF3YWl0KHtcbiAgICAgIC8vIFRoZSBleHBvcnQgbmFtZSBvZiB0b3AtbGV2ZWwgYXdhaXQgcHJvbWlzZSBmb3IgZWFjaCBjaHVuayBtb2R1bGVcbiAgICAgIHByb21pc2VFeHBvcnROYW1lOiAnX190bGEnLFxuICAgICAgLy8gVGhlIGZ1bmN0aW9uIHRvIGdlbmVyYXRlIGltcG9ydCBuYW1lcyBvZiB0b3AtbGV2ZWwgYXdhaXQgcHJvbWlzZSBpbiBlYWNoIGNodW5rIG1vZHVsZVxuICAgICAgcHJvbWlzZUltcG9ydE5hbWU6IChpKSA9PiBgX190bGFfJHtpfWAsXG4gICAgfSksXG4gICAgdml0ZVN0YXRpY0NvcHkoY29weUZpbGVzKSxcbiAgICB2YW5pbGxhRXh0cmFjdFBsdWdpbigpLFxuICAgIHdhc20oKSxcbiAgICByZWFjdCgpLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgc3JjRGlyOiAnc3JjJyxcbiAgICAgIGZpbGVuYW1lOiAnc3cudHMnLFxuICAgICAgc3RyYXRlZ2llczogJ2luamVjdE1hbmlmZXN0JyxcbiAgICAgIGluamVjdFJlZ2lzdGVyOiBmYWxzZSxcbiAgICAgIG1hbmlmZXN0OiBmYWxzZSxcbiAgICAgIGluamVjdE1hbmlmZXN0OiB7XG4gICAgICAgIGluamVjdGlvblBvaW50OiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgICAgZGV2T3B0aW9uczoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB0eXBlOiAnbW9kdWxlJ1xuICAgICAgfVxuICAgIH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBlc2J1aWxkT3B0aW9uczoge1xuICAgICAgZGVmaW5lOiB7XG4gICAgICAgIGdsb2JhbDogJ2dsb2JhbFRoaXMnLFxuICAgICAgfSxcbiAgICAgIHBsdWdpbnM6IFtcbiAgICAgICAgLy8gRW5hYmxlIGVzYnVpbGQgcG9seWZpbGwgcGx1Z2luc1xuICAgICAgICBOb2RlR2xvYmFsc1BvbHlmaWxsUGx1Z2luKHtcbiAgICAgICAgICBwcm9jZXNzOiBmYWxzZSxcbiAgICAgICAgICBidWZmZXI6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgXSxcbiAgICB9LFxuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogJ2Rpc3QnLFxuICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgICBjb3B5UHVibGljRGlyOiBmYWxzZSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBwbHVnaW5zOiBbaW5qZWN0KHsgQnVmZmVyOiBbJ2J1ZmZlcicsICdCdWZmZXInXSB9KV0sXG4gICAgfSxcbiAgfSxcbn0pO1xuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9hbGZyZWQvY2lubnlcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL2FsZnJlZC9jaW5ueS9idWlsZC5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvYWxmcmVkL2Npbm55L2J1aWxkLmNvbmZpZy50c1wiO2V4cG9ydCBkZWZhdWx0IHtcbiAgYmFzZTogJy8nLFxufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBd08sU0FBUyxvQkFBb0I7QUFDclEsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsWUFBWTtBQUNyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlDQUFpQztBQUMxQyxPQUFPLFlBQVk7QUFDbkIsT0FBTyxtQkFBbUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLE9BQU8sUUFBUTtBQUNmLE9BQU8sVUFBVTs7O0FDVnlOLElBQU8sdUJBQVE7QUFBQSxFQUN2UCxNQUFNO0FBQ1I7OztBRFdBLElBQU0sWUFBWTtBQUFBLEVBQ2hCLFNBQVM7QUFBQSxJQUNQO0FBQUEsTUFDRSxLQUFLO0FBQUEsTUFDTCxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0E7QUFBQSxNQUNFLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxJQUNSO0FBQUEsSUFDQTtBQUFBLE1BQ0UsS0FBSztBQUFBLE1B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
