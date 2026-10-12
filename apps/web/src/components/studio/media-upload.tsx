"use client";

import { Upload } from "lucide-react";

/** The upload control: a dashed drop area that submits as soon as a file is chosen or dropped on it. */
export function MediaUpload({
  action,
  locale,
  copy,
}: {
  action: (formData: FormData) => void | Promise<void>;
  locale: string;
  copy: { dropzone: string; help: string; label: string };
}) {
  return (
    <form action={action} className="studio-upload">
      <input name="locale" type="hidden" value={locale} />
      <label className="studio-dropzone">
        <Upload aria-hidden="true" className="studio-dropzone__icon" />
        <strong>{copy.dropzone}</strong>
        <span className="studio-muted">{copy.help}</span>
        <input
          accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
          aria-label={copy.label}
          name="asset"
          onChange={(event) => {
            if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit();
          }}
          required
          type="file"
        />
      </label>
    </form>
  );
}
