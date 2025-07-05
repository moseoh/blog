import { z } from "astro:content";

/**
 * 공통 컨텐츠 타입 정의
 * Astro content collections와 notion2md에서 공통으로 사용
 */

export interface PostProps {
  id: string;
  draft: boolean;
  title: string;
  slug: string;
  category: string | null;
  tags: string[];
  summary: string;
  author: string[];
  heroImage: string | null; // thumbnail과 heroImage 통일
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Astro content collections용 스키마 생성 함수
 */
export const createPostSchema = ({ image }: { image: any }) =>
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
    publishedAt: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date().nullable(),
  });