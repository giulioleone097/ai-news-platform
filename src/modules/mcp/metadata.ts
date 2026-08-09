export const publicMcpTools = [
  "list_articles",
  "search_articles",
  "get_article",
  "list_categories",
] as const;

export const adminMcpTools = [
  "admin_list_articles",
  "admin_get_article",
  "admin_list_categories",
  "admin_create_article",
  "admin_update_article",
  "admin_publish_article",
  "admin_delete_article",
] as const;

export const publicMcpProtocolVersion = "2026-07-28";
