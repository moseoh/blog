import { defineCollection, z } from "astro:content";

const postsCollection = defineCollection({
  type: "content",
  schema: ({ image }) =>
    z.object({
      draft: z.boolean(),
      title: z.string(),
      slug: z.string().optional(), // Astro가 폴더명을 slug로 사용하므로 optional로 변경
      category: z.string().nullable(),
      tags: z.array(z.string()).transform((tags) => {
        // 공백을 하이픈으로 변환 후 중복 제거
        const transformedTags = tags.map((tag) => tag.replace(/\s+/g, "-"));
        return [...new Set(transformedTags)];
      }),
      summary: z.string(),
      author: z.array(z.string()),
      heroImage: image().nullable(),
      publishedAt: z.coerce.date().nullable(),
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date().nullable(),
    }).transform((data) => ({
      ...data,
      // publishedAt이 null이면 createdAt을 사용
      publishedAt: data.publishedAt || data.createdAt,
    })),
});

export const collections = {
  posts: postsCollection,
};
