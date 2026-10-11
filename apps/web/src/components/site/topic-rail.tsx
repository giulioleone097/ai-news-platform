import Link from "next/link";
import { Blocks, BriefcaseBusiness, Compass, Cpu, Scale, Wrench } from "lucide-react";
import type { Category } from "@atlasnews/core/editorial/domain/article";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { SectionHeader } from "./section-header";
import { plateTone } from "./story-cover";

const icons = {
  research: Cpu,
  business: BriefcaseBusiness,
  policy: Scale,
  tools: Wrench,
  society: Compass,
} as const;

export function TopicRail({ categories, locale }: { categories: Category[]; locale: Locale }) {
  const messages = getMessages(locale);
  if (!categories.length) return null;

  return (
    <section className="topic-section" aria-labelledby="topics-title">
      <SectionHeader
        id="topics-title"
        title={messages.home.exploreByTopic}
        href={localizedPath("/latest", locale)}
        linkLabel={messages.home.allTopics}
      />
      <ul className="topic-rail">
        {categories.map((category) => {
          const Icon = icons[category.translationKey as keyof typeof icons] ?? Blocks;
          return (
            <li key={category.id}>
              <Link
                className={`plate--${plateTone(category.translationKey)}`}
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
