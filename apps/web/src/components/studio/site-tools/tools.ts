import { editorPageCapabilities, parseEditorPageInput, type PageCapability } from "@atlasnews/contract/page";
import type { SiteTool, ToolResult } from "@/components/site/site-tools/tools";
import type { ConfirmRequest } from "./confirm-dialog";

/** What the editor tools need from the browser; the real one is `start.ts`, tests pass a fake. */
export interface EditorToolsEnvironment {
  fetch: typeof fetch;
  /** Asks the person in the page. Resolves `true` only when they approve this request. */
  confirm(request: ConfirmRequest, signal?: AbortSignal): Promise<boolean>;
  /** Makes the visible Studio view show what a write just changed. */
  refresh(): void;
}

type Answer = { ok: true; result: ToolResult } | { ok: false; status: number; error: string };

const declined = "The person declined this action in the page. Nothing was changed.";

/** The agent-facing message for each status the route answers; 0, 400 and 409 carry the server's own text. */
function describeFailure(name: string, answer: Extract<Answer, { ok: false }>) {
  switch (answer.status) {
    case 0:
    case 400:
    case 409:
      return answer.error;
    case 401:
      return "The editor is not signed in to the Studio (401). Ask the person to sign in again, then retry. Nothing was changed.";
    case 403:
      return `The signed-in account may not use ${name} (403): ${answer.error} Nothing was changed.`;
    case 404:
      return `The Studio does not know the tool ${name} (404).`;
    case 503:
      return "The Studio storage is not configured on this server (503). Nothing was changed.";
    default:
      return `The Studio could not run ${name} (${answer.status}).`;
  }
}

const shown = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
};

/** A name the person can recognise in a list of objects: the first of these keys that holds text. */
const identifiers = ["title", "name", "slug", "translationKey", "path", "id"];

function identify(value: unknown) {
  if (value === null || typeof value !== "object") return shown(value);
  const record = value as Record<string, unknown>;
  const key = identifiers.find((candidate) => typeof record[candidate] === "string");
  return key ? shown(record[key]) : "...";
}

/** One short line per argument, so the dialog says what will be affected without dumping a whole article. */
export function describeAffected(input: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const names = value.slice(0, 5).map(identify).join(", ");
      lines.push(`${key}: ${value.length} (${names}${value.length > 5 ? ", ..." : ""})`);
    } else if (typeof value === "object") {
      lines.push(`${key}: ${identify(value)}`);
    } else {
      lines.push(`${key}: ${shown(value)}`);
    }
  }
  return lines;
}

/**
 * One handler per editor capability. Each one checks the arguments with the catalogue's parser,
 * runs the capability through `POST /api/capabilities/{name}` and answers with the result or
 * `{ error }`; it never throws at the host.
 *
 * A person confirms, never the agent: the first call always sends `confirmed: false`. Only when the
 * server answers 409 does the page ask the person in a dialog, and only their approval makes the
 * second call with `confirmed: true`. That flag is a local in this function, not an argument.
 */
export function createEditorTools(
  env: EditorToolsEnvironment,
  capabilities: readonly PageCapability[] = editorPageCapabilities,
): Record<string, SiteTool> {
  async function post(name: string, input: Record<string, unknown>, confirmed: boolean, signal?: AbortSignal): Promise<Answer> {
    let response: Response;
    try {
      response = await env.fetch(`/api/capabilities/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ input, confirmed }),
        signal,
      });
    } catch {
      if (signal?.aborted) throw new Error("aborted");
      return { ok: false, status: 0, error: "The Studio could not be reached. Nothing was changed." };
    }
    const body = (await response.json().catch(() => null)) as { ok?: boolean; result?: ToolResult; error?: string } | null;
    if (response.ok && body?.ok === true && body.result) return { ok: true, result: body.result };
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === "string" ? body.error : "The Studio gave no explanation.",
    };
  }

  function tool(capability: PageCapability): SiteTool {
    const { name } = capability;
    return async (raw, signal) => {
      const parsed = parseEditorPageInput(name, raw);
      if (!parsed.ok) return { error: parsed.error };
      try {
        let answer = await post(name, parsed.input, false, signal);
        if (!answer.ok && answer.status === 409) {
          const approved = await env.confirm(
            {
              tool: capability.title,
              question: answer.error,
              affected: describeAffected(parsed.input),
              destructive: capability.annotations.destructiveHint,
            },
            signal,
          );
          if (signal?.aborted) return { error: `${name} was cancelled.` };
          if (!approved) return { error: declined };
          answer = await post(name, parsed.input, true, signal);
        }
        if (!answer.ok) return { error: describeFailure(name, answer) };
        if (!capability.annotations.readOnlyHint) {
          try {
            env.refresh();
          } catch {
            // The change is saved; a failed refresh must not turn that into an error.
          }
        }
        return answer.result;
      } catch {
        return { error: signal?.aborted ? `${name} was cancelled.` : `${name} failed unexpectedly.` };
      }
    };
  }

  return Object.fromEntries(capabilities.map((capability) => [capability.name, tool(capability)]));
}
