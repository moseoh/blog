// @ts-check
import {defineConfig} from "astro/config";
import {execSync} from "child_process";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
    output: 'static',
    redirects: {
        '/': '/@/@/1',
    },
    vite: {
      build: {
          rollupOptions: {
              external: ["/pagefind/pagefind.js"],
          },
      },
      plugins: [tailwindcss()],
    },
    integrations: [
        {
            name: "pagefind",
            hooks: {
                "astro:build:done": () => {
                    try {
                        execSync("npx pagefind --site dist", {stdio: "inherit"});
                    } catch (error) {
                        console.log("Pagefind skipped: no HTML files found in dist directory");
                    }
                },
            },
        },
    ],
});