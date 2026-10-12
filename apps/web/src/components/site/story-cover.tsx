import Image from "next/image";

/** A story's own picture at 16:10. A story without one is a text card, so there is nothing to draw. */
export function StoryCover({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  return (
    <span className="story-cover">
      <Image src={src} alt={alt} width={640} height={400} sizes={sizes} quality={70} />
    </span>
  );
}
