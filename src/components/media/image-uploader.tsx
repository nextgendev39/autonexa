"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { CameraCapture } from "@/components/media/camera-capture";
import { PhotoGallery } from "@/components/media/photo-gallery";
import type { LocalPhoto } from "@/components/media/types";
import { Button } from "@/components/ui/button";

export function ImageUploader({
  photos,
  onChange,
  maxFiles = 12,
}: {
  photos?: LocalPhoto[];
  onChange?: (photos: LocalPhoto[]) => void;
  maxFiles?: number;
}) {
  const t = useTranslations();
  const [internal, setInternal] = useState<LocalPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const value = photos ?? internal;

  function update(next: LocalPhoto[]) {
    onChange?.(next);
    if (!photos) setInternal(next);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = [...value];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (next.length >= maxFiles) break;
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    update(next);
  }

  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-base font-medium">{t("media.title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("media.hint")}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t("media.count", { count: value.length })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={value.length >= maxFiles}>
          {t("media.add")}
        </Button>
        <CameraCapture onSelect={addFiles} disabled={value.length >= maxFiles} />
      </div>
      <PhotoGallery photos={value} onChange={update} />
    </section>
  );
}
