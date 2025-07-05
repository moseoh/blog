import "dotenv/config";
import path from "path";

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value) {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Environment variable ${key} is not set.`);
}

export const config = {
  notion: {
    token: getEnv("NOTION_TOKEN"),
    databaseId: getEnv("DATABASE_ID"),
  },
  fs: {
    contentDir: path.join(".notion-to-md/content/posts"), // 이미 node_modules/.astro에서 실행
    cacheDir: path.join(".notion-to-md", ".cache"),
    cachePath: path.join(".notion-to-md", ".cache", "cache.json"),
  },
};
