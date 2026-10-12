import Image from "next/image";
import { defaultCoverImage } from "@atlasnews/core/editorial/domain/article";

type EditorialCoverProps = {
  src: string;
  alt: string;
  sizes: string;
  quality: number;
};

export function EditorialCover({ src, alt, sizes, quality }: EditorialCoverProps) {
  if (src !== defaultCoverImage) {
    return (
      <Image
        src={src}
        alt={alt}
        width={1536}
        height={1024}
        sizes={sizes}
        fetchPriority="high"
        loading="eager"
        quality={quality}
      />
    );
  }

  return (
    <picture>
      {/* The phone breakpoint of the site CSS, in rem like the stylesheets. */}
      <source
        media="(max-width: 40rem)"
        type="image/webp"
        srcSet="/media/atlas-hero-672.webp"
      />
      <source
        type="image/webp"
        srcSet={[
          "/media/atlas-hero-480.webp 480w",
          "/media/atlas-hero-750.webp 750w",
          "/media/atlas-hero-1200.webp 1200w",
          "/media/atlas-hero-1536.webp 1536w",
        ].join(", ")}
        sizes={sizes}
      />
      <img
        src="/media/atlas-hero-750.webp"
        alt={alt}
        width={1536}
        height={1024}
        fetchPriority="high"
        loading="eager"
        decoding="sync"
      />
    </picture>
  );
}
