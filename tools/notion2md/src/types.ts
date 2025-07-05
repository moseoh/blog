import {notion} from "./notion";

// Extract types from the Notion API function return values for centralized management.
type QueryDatabaseResponse = Awaited<ReturnType<typeof notion.databases.query>>;
export type PageObject = Extract<
    QueryDatabaseResponse["results"][number],
    { url: string }
>;

// PostProps 인터페이스를 직접 정의 (Astro 의존성 없이)
export interface PostProps {
  id: string;
  draft: boolean;
  title: string;
  slug: string;
  category: string | null;
  tags: string[];
  summary: string;
  author: string[];
  heroImage: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Type for individual entries to be stored in the cache file
 */
export interface CacheEntry {
    updatedAt: string;
    title: string;
    slug: string;
}

/**
 * Type for entire cache data by id
 */
export type CacheData = Record<string, CacheEntry>;
