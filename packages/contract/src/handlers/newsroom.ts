import { implement } from "../capability";
import { markUntrusted } from "../untrusted";
import {
  adminListDistribution,
  adminListNewsletterSubscriptions,
  adminUpdateDistribution,
  adminUpdateNewsletterSubscription,
} from "../specs/newsroom";

/** Distribution workflow and the newsletter registry. Content has its own handlers: articles, categories, entities, media. */
export const newsroomCapabilities = [
  implement(adminListDistribution, async (ports, { locale }) => ({
    items: (await (await ports.editorial()).listPublications(locale)).map((item) => ({ ...item })),
  })),

  implement(adminUpdateDistribution, async (ports, input) => ({
    publication: { ...await (await ports.editorial()).updatePublication({
      ...input,
      externalUrl: input.externalUrl || null,
    }) },
  })),

  implement(adminListNewsletterSubscriptions, async (ports, input) => {
    const page = await (await ports.editorial()).listSubscriptions(input);
    return markUntrusted({ ...page, items: page.items.map((item) => ({ ...item })) }, ["items[].email"]);
  }),

  implement(adminUpdateNewsletterSubscription, async (ports, { id, status }) => {
    await (await ports.editorial()).updateSubscriptionStatus(id, status);
    return { id, status };
  }),
];
