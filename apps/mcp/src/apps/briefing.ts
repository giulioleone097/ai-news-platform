import type {
  CallToolResult,
  InputRequiredResult,
  McpServer,
  ServerContext,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { localeLabels, locales, type Locale } from "@atlasnews/core/locale";
import type { Category } from "@atlasnews/core/editorial/domain/article";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";

import {
  articleSummaryOutputSchema,
  categorySlugSchema,
  failure,
  localeSchema,
  readOnlyAnnotations,
  safely,
  sourceUnavailableMessage,
  success,
  toArticleSummary,
} from "../public-presenters";
import { newsroomToolMeta } from "./ui-resource";

type BriefingReader = Pick<ArticleRepository, "listPublished" | "listCategories">;

export const briefingFormKey = "briefing_preferences";
const maxTopics = 8;
const defaultStoriesPerTopic = 3;

/**
 * MRTR forms need MCP 2026-07-28 plus both the core form capability and
 * OpenAI's form extension; otherwise the briefing falls back to defaults.
 */
export function supportsOpenAiForms(envelope: ServerContext["mcpReq"]["envelope"]) {
  const meta = (envelope ?? {}) as Record<string, unknown>;
  const version = meta["io.modelcontextprotocol/protocolVersion"];
  const capabilities = meta["io.modelcontextprotocol/clientCapabilities"] as
    | { elicitation?: { form?: object }; extensions?: Record<string, { form?: object } | undefined> }
    | undefined;
  return typeof version === "string"
    && version >= "2026-07-28"
    && Boolean(capabilities?.elicitation?.form)
    && Boolean(capabilities?.extensions?.["openai/elicitation"]?.form);
}

const formAnswerSchema = z.object({
  topics: z.array(z.string().min(1).max(120)).min(1).max(maxTopics),
  language: z.enum(locales),
  storiesPerTopic: z.number().int().min(1).max(5).default(defaultStoriesPerTopic),
});

const elicitResultSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  content: z.record(z.string(), z.unknown()).optional(),
});

function httpsUrl(path: string, siteUrl: URL) {
  try {
    const url = new URL(path, siteUrl);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

async function buildForm(reader: BriefingReader, locale: Locale, siteUrl: URL): Promise<InputRequiredResult> {
  const categories = await reader.listCategories(locale);
  const covers = await Promise.all(
    categories.map(async (category) => {
      const latest = (await reader.listPublished({ locale, category: category.slug, limit: 1 })).items[0];
      return latest ? httpsUrl(latest.coverImage, siteUrl) : null;
    }),
  );
  const requestedSchema = {
    type: "object",
    properties: {
      topics: {
        type: "array",
        title: locale === "it" ? "Argomenti" : "Topics",
        minItems: 1,
        maxItems: maxTopics,
        items: {
          anyOf: categories.map((category, index) => ({
            const: category.translationKey,
            title: category.name,
            description: category.description,
            ...(covers[index] ? { "x-openai-thumbnail": { src: covers[index] } } : {}),
          })),
        },
      },
      language: {
        type: "string",
        title: locale === "it" ? "Lingua" : "Language",
        oneOf: locales.map((value) => ({ const: value, title: localeLabels[value] })),
        default: locale,
      },
      storiesPerTopic: {
        type: "integer",
        title: locale === "it" ? "Notizie per argomento" : "Stories per topic",
        minimum: 1,
        maximum: 5,
        default: defaultStoriesPerTopic,
      },
    },
    required: ["topics", "language"],
  };

  return {
    resultType: "input_required",
    inputRequests: {
      [briefingFormKey]: {
        method: "elicitation/create",
        params: {
          mode: "form",
          message: locale === "it"
            ? "Scegli gli argomenti del tuo briefing NEURA."
            : "Choose the topics for your NEURA briefing.",
          // OpenAI-registered servers carry the real schema in _meta; the core form stays empty.
          requestedSchema: { type: "object", properties: {} },
          _meta: { "openai/elicitation": { requestedSchema } },
        },
      },
    },
  };
}

async function buildBriefing(
  reader: BriefingReader,
  locale: Locale,
  categories: Category[],
  storiesPerTopic: number,
) {
  const pages = await Promise.all(
    categories.map((category) =>
      reader.listPublished({ locale, category: category.slug, limit: storiesPerTopic }),
    ),
  );
  return {
    locale,
    sections: categories.map((category, index) => ({
      category: { slug: category.slug, name: category.name },
      items: pages[index].items.map(toArticleSummary),
    })),
  };
}

export function registerBriefingTool(server: McpServer, reader: BriefingReader, siteUrl: URL) {
  server.registerTool(
    "build_briefing",
    {
      title: "Build an AI news briefing",
      description:
        "Build a NEURA briefing of the latest stories grouped by topic. Omit topics to let the user pick topics, language and depth in a native ChatGPT form when available; otherwise every topic is included.",
      inputSchema: {
        locale: localeSchema,
        topics: z.array(categorySlugSchema).min(1).max(maxTopics).optional()
          .describe("Locale-specific category slugs from list_categories."),
        storiesPerTopic: z.number().int().min(1).max(5).default(defaultStoriesPerTopic),
      },
      outputSchema: {
        locale: z.enum(locales),
        sections: z.array(z.object({
          category: z.object({ slug: z.string(), name: z.string() }),
          items: z.array(articleSummaryOutputSchema),
        })),
      },
      annotations: readOnlyAnnotations,
      _meta: newsroomToolMeta(),
    },
    async ({ locale, topics, storiesPerTopic }, context): Promise<CallToolResult | InputRequiredResult> => {
      if (topics) {
        return safely(async () => {
          const categories = await reader.listCategories(locale);
          const chosen = categories.filter((category) => topics.includes(category.slug));
          return buildBriefing(reader, locale, chosen, storiesPerTopic);
        });
      }
      if (!supportsOpenAiForms(context.mcpReq.envelope)) {
        return safely(async () =>
          buildBriefing(reader, locale, await reader.listCategories(locale), storiesPerTopic));
      }

      const response = context.mcpReq.inputResponses?.[briefingFormKey];
      if (response === undefined) {
        try {
          return await buildForm(reader, locale, siteUrl);
        } catch {
          return failure(sourceUnavailableMessage);
        }
      }
      const answer = elicitResultSchema.safeParse(response);
      if (!answer.success || answer.data.action !== "accept") {
        return {
          ...success({ locale, sections: [] }),
          content: [{ type: "text", text: "The user closed the briefing form without choosing topics." }],
        };
      }
      const preferences = formAnswerSchema.safeParse(answer.data.content ?? {});
      if (!preferences.success) {
        return { content: [{ type: "text", text: "The briefing form answer was invalid." }], isError: true };
      }
      return safely(async () => {
        const { topics: keys, language, storiesPerTopic: depth } = preferences.data;
        const categories = (await reader.listCategories(language))
          .filter((category) => keys.includes(category.translationKey));
        return buildBriefing(reader, language, categories, depth);
      });
    },
  );
}
