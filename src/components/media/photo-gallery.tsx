"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { PhotoPreview } from "@/components/media/photo-preview";
import type { LocalPhoto } from "@/components/media/types";
import { Button } from "@/components/ui/button";

export function PhotoGallery({
  photos,
  onChange,
}: {
  photos: LocalPhoto[];
  onChange: (photos: LocalPhoto[]) => void;
}) {
  const t = useTranslations();
  const [dragId, setDragId] = useState<string | null>(null);

  function move(id: string, direction: -1 | 1) {
    const index = photos.findIndex((photo) => photo.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= photos.length) return;
    const next = [...photos];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    onChange(next);
  }

  function remove(id: string) {
    const photo = photos.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    onChange(photos.filter((item) => item.id !== id));
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...photos];
    const from = next.findIndex((photo) => photo.id === dragId);
    const to = next.findIndex((photo) => photo.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    onChange(next);
    setDragId(null);
  }

  if (photos.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("media.empty")}</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo, index) => (
        <li
          key={photo.id}
          draggable
          onDragStart={() => setDragId(photo.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => dropOn(photo.id)}
          className="grid gap-2"
        >
          <PhotoPreview photo={photo} onRemove={() => remove(photo.id)} />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={index === 0}
              onClick={() => move(photo.id, -1)}
            >
              {t("common.moveEarlier")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={index === photos.length - 1}
              onClick={() => move(photo.id, 1)}
            >
              {t("common.moveLater")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
