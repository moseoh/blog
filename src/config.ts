import * as yaml from "js-yaml";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { SiteConfig } from "./types/config";

// 빌드 시점에 YAML 파일 읽기 (번들링됨)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = import.meta.env.DEV
  ? join(__dirname, "..", "site.yaml")
  : join(__dirname, "..", "..", "site.yaml");
const configFile = readFileSync(configPath, "utf8");
const config = yaml.load(configFile) as SiteConfig;

export const SITE = {
  title: config.site.title,
  description: config.site.description,
  url: config.site.url,
};

export const SOCIAL = {
  github: config.social.github,
  twitter: config.social.twitter,
  linkedin: config.social.linkedin,
  email: config.social.email,
};

export const LAYOUT = {
  siteWidth: config.layout.site_width,
  postWidth: config.layout.post_width,
};

export const POSTS_PER_PAGE = config.content.posts_per_page;
