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
    contentDir: path.join("../../src/content/posts"),
    mediaDir: path.join("../../src/content/posts"), // Media will be in individual post folders
    cacheDir: path.join("./", ".cache"),
    cachePath: path.join("./", ".cache", "cache.json"),
  },
};
