import fs from "fs/promises";
import path from "path";
import { NotionConverter } from "notion-to-md";
import { notion } from "./notion";
import { logger } from "./reporter";
import type { PostProps } from "./types";
import { config } from "./config";

/**
 * Creates and returns a NotionConverter instance for a specific post.
 */
const getN2mInstance = (postSlug: string): NotionConverter => {
  // Create a new instance for each post to handle media in post-specific folders
  try {
    const postMediaDir = path.join(config.fs.contentDir, postSlug);
    return new NotionConverter(notion).downloadMediaTo({
      outputDir: postMediaDir,
      transformPath: (localPath) => {
        return `./${path.basename(localPath)}`;
      },
    });
  } catch (error) {
    logger.error("Failed to initialize NotionConverter.", error);
    throw error;
  }
};

/**
 * Converts an object to YAML Frontmatter format string.
 * @param props - Object to convert
 * @returns YAML string
 */
function createFrontmatter(props: PostProps): string {
  // id is used as a filename, so exclude it from frontmatter.
  const { id, ...rest } = props;

  const lines = Object.entries(rest).map(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return `${key}: []`;
      const items = value.map((item) => `  - ${item}`).join("\n");

      return `${key}:\n${items}`;
    }
    // Use JSON.stringify to add quotes to strings and escape special characters.
    return `${key}: ${JSON.stringify(value)}`;
  });

  return `---\n${lines.join("\n")}\n---`;
}

/**
 * Saves a single post as a Markdown file in its own folder.
 * @param post - Post data to save (PostProps)
 * @param contentDir - Directory path to save to
 */
export async function savePostAsMarkdown(post: PostProps, contentDir: string) {
  const originalConsole = { ...console };
  try {
    // Temporarily disable console to suppress library logs
    Object.keys(console).forEach((key) => {
      (console as any)[key] = () => {};
    });

    // Create a post-specific folder
    const postDir = path.join(contentDir, post.slug);
    await fs.mkdir(postDir, { recursive: true });

    const converter = getN2mInstance(post.slug); // Get instance with post-specific media dir
    const { content: markdownBody, blockTree } = await converter.convert(post.id);

    // Find heroImage in blockTree properties
    let localHeroImage = post.heroImage;
    const heroImageProperty = (blockTree as any).properties?.heroImage;
    
    if (heroImageProperty && heroImageProperty.files && heroImageProperty.files.length > 0) {
      const heroImageFile = heroImageProperty.files[0];
      if (heroImageFile.file && heroImageFile.file.url) {
        localHeroImage = heroImageFile.file.url;
      }
    }

    // Update the post with a local heroImage path
    const updatedPost = { ...post, heroImage: localHeroImage };
    const frontmatter = createFrontmatter(updatedPost);
    const fullContent = `${frontmatter}\n\n${markdownBody}`;
    const filePath = path.join(postDir, 'index.md');
    await fs.writeFile(filePath, fullContent);
  } catch (error) {
    // Restore console even if error occurs
    Object.assign(console, originalConsole);
    logger.error(`- Failed to save: ${post.slug}`, error);
  }
}
