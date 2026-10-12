import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  requireEditor: vi.fn(async () => ({ userId: "editor-1" })),
  runEditorCapability: vi.fn(),
  authorize: vi.fn(),
  media: {
    writable: true,
    uploadAsset: vi.fn(),
  },
  repositories: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/editor-auth", () => ({ requireEditor: mocks.requireEditor }));
vi.mock("@/lib/editorial-cache", () => ({
  articlesCacheTag: "articles",
  invalidatePublicEditorialCache: vi.fn(),
}));
vi.mock("@/server/capabilities", () => ({
  runEditorCapability: mocks.runEditorCapability,
  authorizeEditorCapability: mocks.authorize,
}));
vi.mock("@/server/composition", () => ({ getStudioAdminEditorialRepository: mocks.repositories }));

import { listEditorMediaAction, uploadEditorMediaAction } from "./actions";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const eightMiB = 8_388_608;

function pngFile(size = 64, name = "neura-hero.png") {
  const bytes = new Uint8Array(size);
  bytes.set(pngSignature);
  return new File([bytes], name, { type: "image/png" });
}

function uploadForm(file: File, locale = "it") {
  const form = new FormData();
  form.set("locale", locale);
  form.set("asset", file);
  return form;
}

describe("Studio Markdown editor media actions", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear();
    mocks.requireEditor.mockReset().mockResolvedValue({ userId: "editor-1" });
    mocks.runEditorCapability.mockReset();
    mocks.authorize.mockReset().mockResolvedValue({ ok: true });
    mocks.media.writable = true;
    mocks.media.uploadAsset.mockReset().mockImplementation(async (input: { name: string; mimeType: string; bytes: Uint8Array }) => ({
      path: `stored-${input.name}`,
      url: `/media-store/stored-${input.name}`,
      name: input.name,
      mimeType: input.mimeType,
      size: input.bytes.length,
      createdAt: "2026-10-11T00:00:00.000Z",
    }));
    mocks.repositories.mockReset().mockResolvedValue(mocks.media);
  });

  describe("listEditorMediaAction", () => {
    it("stops at the sign-in redirect for anybody who is not an editor", async () => {
      mocks.requireEditor.mockRejectedValueOnce(new Error("REDIRECT:/it/login"));

      await expect(listEditorMediaAction("it")).rejects.toThrow("REDIRECT:/it/login");
      expect(mocks.runEditorCapability).not.toHaveBeenCalled();
    });

    it("lists the library through the admin_list_media capability for the signed-in editor", async () => {
      mocks.runEditorCapability.mockResolvedValue({
        ok: true,
        result: {
          writable: true,
          items: [{ path: "a.png", url: "/media-store/a.png", name: "a.png", mimeType: "image/png", size: 10 }],
        },
      });

      await expect(listEditorMediaAction("it")).resolves.toEqual({
        ok: true,
        writable: true,
        items: [{ path: "a.png", url: "/media-store/a.png", name: "a.png", mimeType: "image/png" }],
      });
      expect(mocks.requireEditor).toHaveBeenCalledWith("it");
      expect(mocks.runEditorCapability).toHaveBeenCalledWith("admin_list_media", {}, { locale: "it" });
    });

    it("passes on the capability's refusal, such as a signed-in account without the scope", async () => {
      mocks.runEditorCapability.mockResolvedValue({
        ok: false,
        status: 403,
        error: "This account is not an editor of the Studio.",
      });

      await expect(listEditorMediaAction("en")).resolves.toEqual({
        ok: false,
        error: "This account is not an editor of the Studio.",
      });
    });
  });

  describe("uploadEditorMediaAction", () => {
    it("stops at the sign-in redirect before anything is stored", async () => {
      mocks.requireEditor.mockRejectedValueOnce(new Error("REDIRECT:/it/login"));

      await expect(uploadEditorMediaAction(uploadForm(pngFile()))).rejects.toThrow("REDIRECT:/it/login");
      expect(mocks.media.uploadAsset).not.toHaveBeenCalled();
    });

    it("runs the scope check of admin_upload_media, and sends nobody who is signed out to the login page", async () => {
      mocks.authorize.mockResolvedValueOnce({ ok: false, status: 401, error: "Sign in." });

      await expect(uploadEditorMediaAction(uploadForm(pngFile()))).rejects.toThrow("REDIRECT:/it/login");
      expect(mocks.authorize).toHaveBeenCalledWith("admin_upload_media", { locale: "it" });
      expect(mocks.media.uploadAsset).not.toHaveBeenCalled();
    });

    it("stores nothing for an editor whose role lacks the scope", async () => {
      mocks.authorize.mockResolvedValueOnce({ ok: false, status: 403, error: "No permission." });

      await expect(uploadEditorMediaAction(uploadForm(pngFile()))).resolves.toEqual({ ok: false, error: "upload" });
      expect(mocks.media.uploadAsset).not.toHaveBeenCalled();
    });

    it("stores a valid image through the media command and returns the URL to insert", async () => {
      await expect(uploadEditorMediaAction(uploadForm(pngFile(64, "neura-hero.png")))).resolves.toEqual({
        ok: true,
        asset: {
          path: "stored-neura-hero.png",
          url: "/media-store/stored-neura-hero.png",
          name: "neura-hero.png",
          mimeType: "image/png",
        },
      });
      expect(mocks.requireEditor).toHaveBeenCalledWith("it");
      expect(mocks.media.uploadAsset).toHaveBeenCalledWith(expect.objectContaining({
        name: "neura-hero.png",
        mimeType: "image/png",
      }));
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/it/studio/media");
    });

    it("refuses types outside the Studio's image list, without storing", async () => {
      const text = new File(["hello"], "notes.txt", { type: "text/plain" });

      await expect(uploadEditorMediaAction(uploadForm(text))).resolves.toEqual({ ok: false, error: "type" });
      expect(mocks.media.uploadAsset).not.toHaveBeenCalled();
    });

    it("refuses bytes that do not match the declared image type", async () => {
      const impostor = new File([new Uint8Array(64)], "fake.png", { type: "image/png" });

      await expect(uploadEditorMediaAction(uploadForm(impostor))).resolves.toEqual({ ok: false, error: "type" });
      expect(mocks.media.uploadAsset).not.toHaveBeenCalled();
    });

    it("accepts 8 MiB and refuses one byte more", async () => {
      const atLimit = new Uint8Array(eightMiB);
      atLimit.set(pngSignature);
      await expect(uploadEditorMediaAction(uploadForm(new File([atLimit], "big.png", { type: "image/png" }))))
        .resolves.toMatchObject({ ok: true });

      const overLimit = new Uint8Array(eightMiB + 1);
      overLimit.set(pngSignature);
      await expect(uploadEditorMediaAction(uploadForm(new File([overLimit], "huge.png", { type: "image/png" }))))
        .resolves.toEqual({ ok: false, error: "size" });
    });

    it("reports read-only storage as a configuration problem, without storing", async () => {
      mocks.media.writable = false;

      await expect(uploadEditorMediaAction(uploadForm(pngFile()))).resolves.toEqual({
        ok: false,
        error: "configuration",
      });
      expect(mocks.media.uploadAsset).not.toHaveBeenCalled();
    });

    it("reports a storage failure as an upload error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mocks.media.uploadAsset.mockRejectedValueOnce(new Error("R2 unavailable"));

      await expect(uploadEditorMediaAction(uploadForm(pngFile()))).resolves.toEqual({ ok: false, error: "upload" });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
  });
});
