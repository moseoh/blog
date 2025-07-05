import fs from "fs/promises";
import path from "path";
import { config } from "./config";
import { logger, printSummary } from "./reporter";
import { getPosts } from "./notion";
import { savePostAsMarkdown } from "./markdown";
import * as cache from "./cache";
import type { PostProps, CacheData } from "./types";

function validatePosts(allPosts: PostProps[]) {
  const skippedPosts: {
    post: PostProps;
    reason: "EMPTY_SLUG" | "DUPLICATE_SLUG";
  }[] = [];
  const postsWithSlug = allPosts.filter((p) => {
    if (p.slug) return true;
    skippedPosts.push({ post: p, reason: "EMPTY_SLUG" });
    return false;
  });

  const slugToPostsMap = new Map<string, PostProps[]>();
  postsWithSlug.forEach((p) => {
    slugToPostsMap.set(p.slug, [...(slugToPostsMap.get(p.slug) || []), p]);
  });

  const validPosts: PostProps[] = [];
  slugToPostsMap.forEach((groupedPosts) => {
    if (groupedPosts.length > 1) {
      groupedPosts.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      validPosts.push(groupedPosts[0]);
      groupedPosts
        .slice(1)
        .forEach((p) =>
          skippedPosts.push({ post: p, reason: "DUPLICATE_SLUG" })
        );
    } else {
      validPosts.push(groupedPosts[0]);
    }
  });

  return { validPosts, skippedPosts };
}

async function planFileOperations(
  validPosts: PostProps[],
  oldCache: CacheData
) {
  const postsToCreate: PostProps[] = [];
  const postsToUpdate: PostProps[] = [];
  let upToDateCount = 0;

  for (const post of validPosts) {
    const cachedPost = oldCache[post.id];
    if (!cachedPost) {
      postsToCreate.push(post);
      continue;
    }
    const filePath = path.join(config.fs.contentDir, post.slug, 'index.md');
    const fileExists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    if (
      !cachedPost.slug ||
      cachedPost.slug !== post.slug ||
      cachedPost.updatedAt !== post.updatedAt ||
      !fileExists
    ) {
      postsToUpdate.push(post);
    } else {
      upToDateCount++;
    }
  }

  const expectedFolderNames = new Set(validPosts.map((p) => p.slug));
  const allItemsInDir = await fs.readdir(config.fs.contentDir).catch(() => []);
  const actualFolders = [];
  
  // Check which items are actually directories
  for (const item of allItemsInDir) {
    const itemPath = path.join(config.fs.contentDir, item);
    const stat = await fs.stat(itemPath).catch(() => null);
    if (stat && stat.isDirectory()) {
      actualFolders.push(item);
    }
  }
  
  const foldersToDelete = actualFolders.filter(
    (folderName) => !expectedFolderNames.has(folderName)
  );

  return { postsToCreate, postsToUpdate, upToDateCount, filesToDelete: foldersToDelete };
}

function createNewCache(validPosts: PostProps[]): CacheData {
  const newCache: CacheData = {};
  for (const post of validPosts) {
    newCache[post.id] = {
      updatedAt: post.updatedAt,
      title: post.title,
      slug: post.slug,
    };
  }
  return newCache;
}

async function main() {
  try {
    logger.log("🚀 Starting Notion to Markdown sync...");
    await fs.mkdir(config.fs.contentDir, { recursive: true });

    const allPosts = await getPosts(config.notion.databaseId);
    const { validPosts, skippedPosts } = validatePosts(allPosts);

    const oldCache = await cache.loadCache();
    const { postsToCreate, postsToUpdate, upToDateCount, filesToDelete } =
      await planFileOperations(validPosts, oldCache);

    const newCache = createNewCache(validPosts);

    const operations = [
      ...postsToCreate.map((p) => savePostAsMarkdown(p, config.fs.contentDir)),
      ...postsToUpdate.map((p) => savePostAsMarkdown(p, config.fs.contentDir)),
      ...filesToDelete.map((f) =>
        fs.rm(path.join(config.fs.contentDir, f), { recursive: true, force: true })
      ),
    ];
    await Promise.all(operations).catch((err) =>
      logger.error("An error occurred during file operations.", err)
    );
    await cache.saveCache(newCache);

    printSummary({
      totalPosts: allPosts.length,
      skippedPosts,
      postsToCreate,
      postsToUpdate,
      filesToDelete,
      upToDateCount,
    });
  } catch (error) {
    logger.error("\n💥 An unexpected error occurred:", error);
  } finally {
    logger.log("\n✅ Sync process finished.");
  }
}

main();
