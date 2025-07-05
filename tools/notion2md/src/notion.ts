import { Client } from "@notionhq/client";
import { logger } from "./reporter";
import { parsePageProperties } from "./utils";
import type { PageObject, PostProps } from "./types";

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

/**
 * Fetches all posts (pages) from database and converts them to PostProps format.
 * @param databaseId - ID of the database to query
 * @returns Array of PostProps objects
 */
export async function getPosts(databaseId: string): Promise<PostProps[]> {
  const posts: PostProps[] = [];
  try {
    const { results } = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "draft",
        checkbox: {
          equals: false,
        },
      },
      sorts: [
        {
          property: "publishedAt",
          direction: "descending",
        },
        {
          property: "createdAt",
          direction: "descending",
        },
      ],
    });

    for (const page of results) {
      if (!("properties" in page)) {
        continue;
      }
      posts.push(parsePageProperties(page as PageObject));
    }
    return posts;
  } catch (error) {
    logger.error("Could not query database.", error);
    return [];
  }
}
