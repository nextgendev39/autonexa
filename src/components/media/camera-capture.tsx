"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function CameraCapture({
  onSelect,
  disabled,
}: {
  onSelect: (files: FileList | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          onSelect(event.target.files);
          event.target.value = "";
        }}
      />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {t("media.camera")}
      </Button>
    </>
  );
}
