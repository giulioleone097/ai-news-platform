export function buildSocialLinks(input: { url: string; title: string }) {
  const url = encodeURIComponent(input.url);
  const title = encodeURIComponent(input.title);

  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    x: `https://x.com/intent/post?text=${title}&url=${url}`,
    whatsapp: `https://wa.me/?text=${title}%20${url}`,
  };
}
