// @ts-check
import {defineConfig} from "astro/config";
import {execSync} from "child_process";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import expressiveCode from "astro-expressive-code";
import * as yaml from "js-yaml";
import {readFileSync} from "fs";

// Load site configuration from site.yaml
const configFile = readFileSync("site.yaml", "utf8");
/** @type {import('./src/types/config').SiteConfig} */
// @ts-ignore
const config = yaml.load(configFile);

// https://astro.build/config
export default defineConfig({
    site: config.site.url,
    trailingSlash: "always",
    output: "static",
    redirects: {
        "/": "/@/@/1/",
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
        expressiveCode({
            themes: ['one-dark-pro'],
            removeUnusedThemes: false,
            frames: {
                removeCommentsWhenCopyingTerminalFrames: true
            },
            styleOverrides: {
                codeBackground: '#303338',
                frames: {
                    frameBoxShadowCssValue: 'none',
                },
            },
            defaultProps: {
                frame: "code",
                wrap: false,
            },
            plugins: [],
        }),
        sitemap(),
        {
            name: "pagefind",
            hooks: {
                "astro:build:done": () => {
                    try {
                        execSync("npx pagefind --site dist", {stdio: "inherit"});
                    } catch (error) {
                        console.log(
                            "Pagefind skipped: no HTML files found in dist directory"
                        );
                    }
                },
            },
        },
    ],
});
