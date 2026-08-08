import Link from "next/link";
import { ArrowRight, Blocks, BriefcaseBusiness, Compass, Cpu, Scale, Wrench } from "lucide-react";
import type { Category } from "@/modules/editorial/domain/article";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { SectionHeader } from "./section-header";

const icons = {
  research: Cpu,
  business: BriefcaseBusiness,
  policy: Scale,
  tools: Wrench,
  society: Compass,
} as const;

export function TopicRail({ categories, locale }: { categories: Category[]; locale: Locale }) {
  const messages = getMessages(locale);

  return (
    <section className="topic-section" aria-labelledby="topics-title">
      <SectionHeader
        id="topics-title"
        title={messages.home.exploreByTopic}
        href={localizedPath("/latest", locale)}
        linkLabel={messages.home.allTopics}
      />
      <div className="topic-rail">
        {categories.map((category) => {
          const Icon = icons[category.translationKey as keyof typeof icons] ?? Blocks;
          return (
            <Link key={category.id} href={localizedPath(`/categories/${category.slug}`, locale)}>
              <Icon aria-hidden="true" />
              <span>{category.name}</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
