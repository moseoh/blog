export interface SiteConfig {
  site: {
    title: string;
    description: string;
    url: string;
  };
  social: {
    github?: string | undefined | null;
    linkedin?: string | undefined | null;
    twitter?: string | undefined | null;
    email?: string | undefined | null;
  };
  layout: {
    site_width: string;
    post_width: string;
  };
  content: {
    posts_per_page: number;
  };
  comments: {
    giscus: {
      enabled: boolean;
      script: string | undefined | null;
    }
  }
}