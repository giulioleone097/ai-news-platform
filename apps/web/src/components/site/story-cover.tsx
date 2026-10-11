import Image from "next/image";
import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { StatusGlyph } from "./claim-chip";

const tones = ["sky", "leaf", "peach", "lilac", "marker"] as const;
export type PlateTone = (typeof tones)[number];

const sectionTones: Record<string, PlateTone> = {
  research: "sky",
  business: "leaf",
  policy: "lilac",
  tools: "marker",
  society: "peach",
};

/** A section always gets the same tint, so the tint reads as the section. */
export function plateTone(sectionKey: string): PlateTone {
  const known = sectionTones[sectionKey];
  if (known) return known;
  let hash = 0;
  for (const character of sectionKey) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
}

/** A story's picture, or a plate when it has none to show: the section tint, the status glyph and a name set large. */
export function StoryCover({
  image,
  label,
  status,
  tone,
  sizes,
}: {
  image: { src: string; alt: string } | null;
  label: string;
  status: ClaimStatus;
  tone: PlateTone;
  sizes: string;
}) {
  if (!image) {
    return (
      <span className={`story-cover plate plate--${tone}`} aria-hidden="true">
        <StatusGlyph status={status} />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className="story-cover">
      <Image src={image.src} alt={image.alt} width={640} height={400} sizes={sizes} quality={70} />
    </span>
  );
}
