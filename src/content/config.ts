import { defineCollection } from "astro:content";
import { createPostSchema } from "../../types/content.js";

const postsCollection = defineCollection({
  type: "content",
  schema: createPostSchema,
});

export const collections = {
  posts: postsCollection,
};
