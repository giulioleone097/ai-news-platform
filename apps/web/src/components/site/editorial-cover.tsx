import Image from "next/image";

const bundledHero = "/media/neura-agents-hero.webp";

type EditorialCoverProps = {
  src: string;
  alt: string;
  sizes: string;
  quality: number;
};

export function EditorialCover({ src, alt, sizes, quality }: EditorialCoverProps) {
  if (src !== bundledHero) {
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
      <source
        media="(max-width: 600px)"
        type="image/webp"
        srcSet="/media/neura-agents-hero-672.webp"
      />
      <source
        type="image/webp"
        srcSet={[
          "/media/neura-agents-hero-480.webp 480w",
          "/media/neura-agents-hero-750.webp 750w",
          "/media/neura-agents-hero-1200.webp 1200w",
          "/media/neura-agents-hero-1536.webp 1536w",
        ].join(", ")}
        sizes={sizes}
      />
      <img
        src="/media/neura-agents-hero-750.webp"
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
