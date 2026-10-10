import { afterEach, describe, expect, it, vi } from "vitest";

import { modernParams, sendRpc } from "../mcp-test-client";
import { newsroomUiUri } from "./ui-resource";

const baseUi = {
  csp: { resourceDomains: ["http://localhost:3000"], connectDomains: [] },
  prefersBorder: true,
};

async function readUi() {
  const { payload } = await sendRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "resources/read",
    params: modernParams({ uri: newsroomUiUri }),
  });
  return payload.result.contents[0]._meta.ui;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("newsroom UI domain", () => {
  it("leaves the metadata unchanged when no domain is configured", async () => {
    vi.stubEnv("ATLASNEWS_MCP_UI_DOMAIN", undefined);

    const ui = await readUi();

    expect(ui).toEqual(baseUi);
    expect(Object.keys(ui).sort()).toEqual(["csp", "prefersBorder"]);
  });

  it("adds exactly the documented domain key for a canonical https origin", async () => {
    vi.stubEnv("ATLASNEWS_MCP_UI_DOMAIN", "https://ui.news.example.com");

    expect(await readUi()).toEqual({ ...baseUi, domain: "https://ui.news.example.com" });
  });

  it("normalizes a single trailing slash to the origin", async () => {
    vi.stubEnv("ATLASNEWS_MCP_UI_DOMAIN", " https://ui.news.example.com/ ");

    expect((await readUi()).domain).toBe("https://ui.news.example.com");
  });

  it("ignores every value that is not a bare https origin", async () => {
    const invalid = [
      "",
      "   ",
      "not a url",
      "ui.news.example.com",
      "http://ui.news.example.com",
      "https://ui.news.example.com/app",
      "https://ui.news.example.com//",
      "https://ui.news.example.com?x=1",
      "https://ui.news.example.com#top",
      "https://user@ui.news.example.com",
    ];
    for (const value of invalid) {
      vi.stubEnv("ATLASNEWS_MCP_UI_DOMAIN", value);

      expect(await readUi(), JSON.stringify(value)).toEqual(baseUi);
    }
  });
});
