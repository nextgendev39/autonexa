"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { LocalPhoto } from "@/components/media/types";

export function PhotoPreview({
  photo,
  onRemove,
}: {
  photo: LocalPhoto;
  onRemove?: () => void;
}) {
  const t = useTranslations();

  return (
    <figure className="bg-muted relative overflow-hidden rounded-lg border">
      {/* Local camera previews use object URLs, which the image optimizer cannot fetch. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.previewUrl} alt="" className="aspect-[4/3] w-full object-cover" />
      {onRemove ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute end-2 top-2"
          onClick={onRemove}
        >
          {t("media.remove")}
        </Button>
      ) : null}
    </figure>
  );
}
