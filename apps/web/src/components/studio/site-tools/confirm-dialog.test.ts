import { describe, expect, it } from "vitest";
import { createConfirmPresenter, type ConfirmRequest } from "./confirm-dialog";
import { FakeDocument, FakeNode } from "./fake-document";

const request: ConfirmRequest = {
  tool: "Delete newsroom entity",
  question: "Permanently delete the entity “openai”?",
  affected: ["slug: openai"],
  destructive: true,
};

function setup(locale: "en" | "it" = "en") {
  const doc = new FakeDocument();
  const presenter = createConfirmPresenter(doc as unknown as Document, locale);
  const button = (dialog: FakeNode, label: string) => dialog.all().find((node) => node.tag === "button" && node.textContent === label)!;
  return { doc, presenter, button };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the confirmation dialog", () => {
  it("is a labelled modal that focuses Decline, shows the question and what is affected, and resolves true only on Approve", async () => {
    const { doc, presenter, button } = setup();
    const answer = presenter.confirm(request);
    await tick();

    const [dialog] = doc.modals;
    expect(doc.modals).toHaveLength(1);
    expect(dialog.tag).toBe("dialog");
    const heading = dialog.all().find((node) => node.id === dialog.attributes.get("aria-labelledby"))!;
    expect(heading.textContent).toBe("Approve this action?");
    const described = dialog.all().find((node) => node.id === dialog.attributes.get("aria-describedby"))!;
    expect(described.textContent).toBe(request.question);
    expect(dialog.text()).toContain("An AI agent asked to run: Delete newsroom entity");
    expect(dialog.text()).toContain("slug: openai");
    expect(doc.activeElement).toBe(button(dialog, "Decline"));
    expect(button(dialog, "Approve").className).toContain("button--danger");
    expect(button(dialog, "Decline").className).toContain("button--quiet");

    button(dialog, "Approve").click();
    await expect(answer).resolves.toBe(true);
    expect(doc.dialogs()).toHaveLength(0);
  });

  it("resolves false for Decline and for Escape, and removes the dialog", async () => {
    const { doc, presenter, button } = setup();
    const declined = presenter.confirm(request);
    await tick();
    button(doc.modals[0], "Decline").click();
    await expect(declined).resolves.toBe(false);

    const escaped = presenter.confirm(request);
    await tick();
    doc.modals[0].escape();
    await expect(escaped).resolves.toBe(false);
    expect(doc.dialogs()).toHaveLength(0);
  });

  it("uses the primary style for a request that is not destructive and Italian text for the Italian locale", async () => {
    const { doc, presenter, button } = setup("it");
    const answer = presenter.confirm({ ...request, destructive: false });
    await tick();
    const [dialog] = doc.modals;
    expect(dialog.text()).toContain("Approvare questa azione?");
    expect(dialog.text()).toContain("Un agente AI ha chiesto di eseguire: Delete newsroom entity");
    expect(button(dialog, "Approva").className).toContain("button--primary");
    button(dialog, "Rifiuta").click();
    await expect(answer).resolves.toBe(false);
  });

  it("shows one dialog at a time and keeps the order of the requests", async () => {
    const { doc, presenter, button } = setup();
    const first = presenter.confirm({ ...request, question: "first?" });
    const second = presenter.confirm({ ...request, question: "second?" });
    await tick();

    expect(doc.dialogs()).toHaveLength(1);
    expect(doc.modals[0].text()).toContain("first?");
    button(doc.modals[0], "Approve").click();
    await expect(first).resolves.toBe(true);
    await tick();

    expect(doc.dialogs()).toHaveLength(1);
    expect(doc.modals[0].text()).toContain("second?");
    button(doc.modals[0], "Decline").click();
    await expect(second).resolves.toBe(false);
  });

  it("closes as declined when the call is cancelled, and declines everything after dispose", async () => {
    const { doc, presenter } = setup();
    const controller = new AbortController();
    const cancelled = presenter.confirm(request, controller.signal);
    await tick();
    controller.abort();
    await expect(cancelled).resolves.toBe(false);
    expect(doc.dialogs()).toHaveLength(0);

    const open = presenter.confirm(request);
    const queued = presenter.confirm(request);
    await tick();
    presenter.dispose();
    await expect(open).resolves.toBe(false);
    await expect(queued).resolves.toBe(false);
    await expect(presenter.confirm(request)).resolves.toBe(false);
    expect(doc.dialogs()).toHaveLength(0);
    expect(doc.head.children).toHaveLength(0);
  });

  it("writes agent-supplied text with textContent only", async () => {
    const { doc, presenter, button } = setup();
    const answer = presenter.confirm({ ...request, affected: ["title: <img src=x onerror=alert(1)>"] });
    await tick();
    expect(doc.modals[0].all().some((node) => node.tag === "img")).toBe(false);
    button(doc.modals[0], "Decline").click();
    await answer;
  });
});
