export interface SiteConfig {
  site: {
    title: string;
    description: string;
    url: string;
  };
  social: {
    github: string;
    linkedin: string;
    twitter: string;
    email: string;
  };
  layout: {
    site_width: string;
    post_width: string;
  };
  content: {
    posts_per_page: number;
  };
}