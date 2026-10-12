import Link from "next/link";
import { Blocks, BriefcaseBusiness, Compass, Cpu, Scale, Wrench } from "lucide-react";
import type { Category } from "@atlasnews/core/editorial/domain/article";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { SectionHeader } from "./section-header";

const icons = {
  research: Cpu,
  business: BriefcaseBusiness,
  policy: Scale,
  tools: Wrench,
  society: Compass,
} as const;

const tones = ["sky", "leaf", "peach", "lilac", "sand"] as const;

const sectionTones: Record<string, (typeof tones)[number]> = {
  research: "sky",
  business: "leaf",
  policy: "lilac",
  tools: "sand",
  society: "peach",
};

/** A section always gets the same tint, so the tint reads as the section. */
function tileTone(sectionKey: string) {
  const known = sectionTones[sectionKey];
  if (known) return known;
  let hash = 0;
  for (const character of sectionKey) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
}

export function TopicRail({ categories, locale }: { categories: Category[]; locale: Locale }) {
  const messages = getMessages(locale);
  if (!categories.length) return null;

  return (
    <section className="topic-section" aria-labelledby="topics-title">
      <SectionHeader
        id="topics-title"
        title={messages.home.exploreByTopic}
        href={localizedPath("/latest", locale)}
        linkLabel={messages.home.allStories}
      />
      <ul className="topic-rail">
        {categories.map((category) => {
          const Icon = icons[category.translationKey as keyof typeof icons] ?? Blocks;
          return (
            <li key={category.id}>
              <Link
                className={`topic-rail__${tileTone(category.translationKey)}`}
                href={localizedPath(`/categories/${category.slug}`, locale)}
                prefetch={false}
              >
                <Icon aria-hidden="true" />
                <span>{category.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
