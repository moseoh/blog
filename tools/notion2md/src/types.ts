import {notion} from "./notion";

// Extract types from the Notion API function return values for centralized management.
type QueryDatabaseResponse = Awaited<ReturnType<typeof notion.databases.query>>;
export type PageObject = Extract<
    QueryDatabaseResponse["results"][number],
    { url: string }
>;

export { PostProps } from "../../../types/content.js";

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
