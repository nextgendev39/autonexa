"use client";

import {
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImagePlusIcon,
  Loader2Icon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EmptyState } from "@/components/feedback/empty-state";
import { VehiclePhotoLightbox } from "@/components/inventory/vehicle-photo-lightbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/shared/loading-button";
import { PhotoManagerSkeleton } from "@/components/feedback/skeletons";
import { usePermission } from "@/hooks/use-permission";
import {
  useVehiclePhotoMutations,
  useVehiclePhotos,
  vehiclePhotoKeys,
} from "@/hooks/use-vehicle-photos";
import { cn } from "@/lib/utils";
import {
  PHOTO_UPLOAD_CONCURRENCY,
  buildVehiclePhotoPath,
  runWithConcurrency,
  uploadVehiclePhotoFile,
} from "@/lib/vehicles/photo-upload";
import { validateVehiclePhotoFile } from "@/lib/validation/vehicle-photo";
import type { PendingVehiclePhoto, VehiclePhoto } from "@/types/vehicle-photo";

function ProgressBar({
  value,
  label,
  indeterminate,
  light,
}: {
  value: number;
  label?: string;
  indeterminate?: boolean;
  light?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="grid gap-1">
      {label ? (
        <p className={cn("text-xs", light ? "text-white/90" : "text-muted-foreground")}>{label}</p>
      ) : null}
      <div
        className={cn(
          "h-2 w-full overflow-hidden rounded-full",
          light ? "bg-white/25" : "bg-muted",
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-out",
            light ? "bg-white" : "bg-primary",
            indeterminate && "w-1/3 animate-pulse",
          )}
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

type UploadOverlay = {
  progress: number;
  status: "uploading" | "saving" | "error";
  errorMessage?: string;
};

function PhotoThumb({
  src,
  alt,
  isPrimary,
  featured = false,
  onOpen,
  onPrimary,
  onRemove,
  onMoveLeft,
  onMoveRight,
  canEdit,
  busy,
  upload,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  selecting = false,
  selected = false,
  onToggleSelect,
}: {
  src: string | null;
  alt: string;
  isPrimary: boolean;
  featured?: boolean;
  onOpen?: () => void;
  onPrimary?: () => void;
  onRemove?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canEdit: boolean;
  busy?: boolean;
  upload?: UploadOverlay | null;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: () => void;
  /** Multi-select mode: tapping the photo toggles it instead of opening the lightbox. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const t = useTranslations();
  const uploading = upload?.status === "uploading" || upload?.status === "saving";
  const failed = upload?.status === "error";

  return (
    <li
      className={cn(
        "bg-muted/20 group relative overflow-hidden rounded-2xl ring-1 ring-foreground/8 transition-all duration-200",
        onOpen && "hover:ring-foreground/20 hover:shadow-md",
        featured ? "h-full min-h-48 w-full" : "w-full",
        draggable && "cursor-grab active:cursor-grabbing",
        selected && "ring-primary ring-3",
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className={cn(
          "focus-visible:ring-ring relative block w-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          featured ? "h-full min-h-48" : "aspect-square",
        )}
        onClick={selecting ? onToggleSelect : onOpen}
        disabled={(selecting ? !onToggleSelect : !onOpen) || uploading}
        aria-label={selecting ? t("inventory.photos.selectPhoto", { name: alt }) : alt}
        aria-pressed={selecting ? selected : undefined}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs
          <img
            src={src}
            alt={alt}
            className={cn(
              "absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              uploading && "opacity-80",
            )}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="bg-muted absolute inset-0 flex items-center justify-center">
            <ImagePlusIcon className="text-muted-foreground size-8" aria-hidden />
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-60 transition-opacity duration-200 group-hover:opacity-100" />
        {selecting && selected ? (
          <span aria-hidden className="bg-primary/20 pointer-events-none absolute inset-0" />
        ) : null}
        {selecting ? (
          <span
            aria-hidden
            className={cn(
              "absolute inset-e-2.5 top-2.5 flex size-7 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white bg-black/30 text-transparent",
            )}
          >
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </span>
        ) : null}
      </button>

      {isPrimary && !upload ? (
        <span className="absolute inset-s-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          <StarIcon className="size-3 fill-current" aria-hidden />
          {t("inventory.photos.primary")}
        </span>
      ) : null}

      {upload ? (
        <div className="absolute inset-0 flex flex-col justify-end bg-black/55 p-3">
          <div className="mb-auto flex items-center justify-center pt-8">
            {upload.status !== "error" ? (
              <Loader2Icon className="size-7 animate-spin text-white" aria-hidden />
            ) : null}
          </div>
          <ProgressBar
            value={upload.progress}
            indeterminate={upload.status === "saving"}
            light
            label={
              failed
                ? upload.errorMessage || t("inventory.photos.errors.uploadFailed")
                : upload.status === "saving"
                  ? t("inventory.photos.progress.saving")
                  : t("inventory.photos.progress.uploading", {
                      percent: Math.round(upload.progress),
                    })
            }
          />
        </div>
      ) : null}

      {busy && !upload ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2Icon className="size-6 animate-spin text-white" aria-hidden />
        </div>
      ) : null}

      {canEdit && !uploading && !selecting ? (
        <div
          className="absolute inset-e-2 bottom-2 flex items-center gap-1 rounded-full bg-black/50 p-1 opacity-100 backdrop-blur-md transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          data-row-stop
          onClick={(event) => event.stopPropagation()}
        >
          {onMoveLeft ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-8 text-white hover:bg-white/15 hover:text-white"
              aria-label={t("inventory.photos.moveLeft")}
              onClick={onMoveLeft}
            >
              <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
          ) : null}
          {onMoveRight ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-8 text-white hover:bg-white/15 hover:text-white"
              aria-label={t("inventory.photos.moveRight")}
              onClick={onMoveRight}
            >
              <ChevronRightIcon className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
          ) : null}
          {onPrimary && !isPrimary ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-8 text-white hover:bg-white/15 hover:text-white"
              aria-label={t("inventory.photos.setPrimary")}
              onClick={onPrimary}
            >
              <StarIcon className="size-4" aria-hidden />
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-8 text-white hover:bg-rose-500/80 hover:text-white"
              aria-label={t("inventory.photos.remove")}
              onClick={onRemove}
            >
              <Trash2Icon className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function GalleryToolbar({
  canEdit,
  uploading,
  onAdd,
  onCamera,
  dropActive,
  empty,
}: {
  canEdit: boolean;
  uploading?: boolean;
  onAdd: () => void;
  onCamera: () => void;
  dropActive?: boolean;
  empty?: boolean;
}) {
  const t = useTranslations();
  if (!canEdit) return null;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-dashed transition-colors",
        dropActive
          ? "border-primary bg-primary/8"
          : "border-border/80 bg-muted/20 hover:border-foreground/20 hover:bg-muted/30",
        empty ? "px-4 py-10 sm:py-14" : "px-4 py-4",
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 text-center sm:flex-row sm:text-start",
          !empty && "sm:justify-between",
        )}
      >
        <div className="grid gap-1">
          <p className="text-sm font-medium tracking-tight">
            {empty ? t("inventory.photos.emptyTitle") : t("inventory.photos.add")}
          </p>
          <p className="text-muted-foreground text-xs">
            {empty ? t("inventory.photos.emptyHint") : t("inventory.photos.dropHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            className="h-10 rounded-full px-4"
            disabled={uploading}
            onClick={onAdd}
          >
            {uploading ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlusIcon className="size-4" aria-hidden />
            )}
            {t("inventory.photos.add")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full px-4"
            disabled={uploading}
            onClick={onCamera}
          >
            <CameraIcon className="size-4" aria-hidden />
            {t("inventory.photos.camera")}
          </Button>
        </div>
      </div>
    </div>
  );
}

const GALLERY_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3";
const SIDE_GRID = "grid grid-cols-2 gap-2 sm:gap-3";

function PhotoGalleryList<T extends { isPrimary: boolean }>({
  photos,
  renderThumb,
}: {
  photos: T[];
  renderThumb: (photo: T, index: number, featured: boolean) => ReactNode;
}) {
  if (photos.length === 0) return null;

  const featuredIndex = Math.max(
    0,
    photos.findIndex((photo) => photo.isPrimary),
  );
  const featuredPhoto = photos[featuredIndex]!;
  const others = photos
    .map((photo, index) => ({ photo, index }))
    .filter(({ index }) => index !== featuredIndex);
  const side = others.slice(0, 4);
  const below = others.slice(4);

  if (others.length === 0) {
    return <ul className="grid">{renderThumb(featuredPhoto, featuredIndex, true)}</ul>;
  }

  return (
    <div className="grid gap-2 sm:gap-3">
      <div className="grid gap-2 sm:grid-cols-2 sm:items-stretch sm:gap-3">
        <ul className="grid min-h-48">{renderThumb(featuredPhoto, featuredIndex, true)}</ul>
        <ul className={SIDE_GRID}>
          {side.map(({ photo, index }) => renderThumb(photo, index, false))}
        </ul>
      </div>
      {below.length > 0 ? (
        <ul className={GALLERY_GRID}>
          {below.map(({ photo, index }) => renderThumb(photo, index, false))}
        </ul>
      ) : null}
    </div>
  );
}

type DraftProps = {
  mode: "draft";
  photos: PendingVehiclePhoto[];
  onChange: (photos: PendingVehiclePhoto[]) => void;
  disabled?: boolean;
};

type ManageProps = {
  mode: "manage" | "gallery";
  vehicleId: string;
  readOnly?: boolean;
};

export type VehicleImageManagerProps = DraftProps | ManageProps;

function DraftManager({
  photos,
  onChange,
  disabled,
}: {
  photos: PendingVehiclePhoto[];
  onChange: (photos: PendingVehiclePhoto[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const dragId = useRef<string | null>(null);

  function ensurePrimary(list: PendingVehiclePhoto[]) {
    if (list.length === 0) return list;
    if (list.some((photo) => photo.isPrimary)) return list;
    return list.map((photo, index) => ({ ...photo, isPrimary: index === 0 }));
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files || (files as FileList).length === 0) return;
    const next = [...photos];
    for (const file of Array.from(files)) {
      const errorKey = validateVehiclePhotoFile(file);
      if (errorKey) {
        toast.error(t(errorKey));
        continue;
      }
      next.push({
        localId: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        category: "other",
        isPrimary: next.length === 0,
        status: "ready",
      });
    }
    onChange(ensurePrimary(next));
  }

  function remove(localId: string) {
    const next = photos.filter((photo) => {
      if (photo.localId !== localId) return true;
      if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
      return false;
    });
    onChange(ensurePrimary(next));
  }

  function setPrimary(localId: string) {
    onChange(photos.map((photo) => ({ ...photo, isPrimary: photo.localId === localId })));
  }

  function move(localId: string, direction: -1 | 1) {
    const index = photos.findIndex((photo) => photo.localId === localId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  }

  function dropOn(targetId: string) {
    const fromId = dragId.current;
    if (!fromId || fromId === targetId) return;
    const next = [...photos];
    const from = next.findIndex((photo) => photo.localId === fromId);
    const to = next.findIndex((photo) => photo.localId === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
    dragId.current = null;
  }

  const lightboxPhotos = photos.map((photo) => ({
    id: photo.localId,
    src: photo.previewUrl,
    alt: photo.file.name,
    caption: photo.file.name,
  }));

  return (
    <Card
      className="border-border/70 shadow-none"
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDropActive(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="grid gap-1">
          <CardTitle className="text-base tracking-tight">{t("inventory.photos.title")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("inventory.photos.hint")}</p>
        </div>
        {photos.length > 0 ? (
          <span className="text-muted-foreground rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums">
            {photos.length}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <GalleryToolbar
          canEdit={!disabled}
          onAdd={() => fileRef.current?.click()}
          onCamera={() => cameraRef.current?.click()}
          dropActive={dropActive}
          empty={photos.length === 0}
        />

        <PhotoGalleryList
          photos={photos}
          renderThumb={(photo, index, featured) => (
            <PhotoThumb
              key={photo.localId}
              src={photo.previewUrl}
              alt={photo.file.name}
              isPrimary={photo.isPrimary}
              featured={featured}
              canEdit={!disabled}
              onOpen={() => setLightboxIndex(index)}
              onPrimary={() => setPrimary(photo.localId)}
              onRemove={() => remove(photo.localId)}
              onMoveLeft={index > 0 ? () => move(photo.localId, -1) : undefined}
              onMoveRight={
                index < photos.length - 1 ? () => move(photo.localId, 1) : undefined
              }
              draggable={!disabled}
              onDragStart={() => {
                dragId.current = photo.localId;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(photo.localId)}
            />
          )}
        />

        <VehiclePhotoLightbox
          photos={lightboxPhotos}
          index={lightboxIndex ?? 0}
          open={lightboxIndex != null}
          onOpenChange={(open) => {
            if (!open) setLightboxIndex(null);
          }}
          onIndexChange={setLightboxIndex}
        />
      </CardContent>
    </Card>
  );
}

function ManageManager({
  vehicleId,
  readOnly,
}: {
  vehicleId: string;
  readOnly?: boolean;
}) {
  const t = useTranslations();
  const { can } = usePermission();
  // Managing photos of a saved car is editing it; create-only roles add photos in the create flow.
  const canEdit = !readOnly && can("vehicle.edit");
  const query = useVehiclePhotos(vehicleId);
  const { addMany, update, removeMany, reorder } = useVehiclePhotoMutations(vehicleId);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  /** Photos waiting for confirmation in the delete dialog (one, or the multi-selection). */
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const dragId = useRef<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<
    Array<{
      localId: string;
      previewUrl: string;
      fileName: string;
      progress: number;
      status: "uploading" | "saving" | "error";
      errorMessage?: string;
    }>
  >([]);

  async function uploadFiles(files: FileList | File[] | null) {
    if (!files || (files as FileList).length === 0) return;
    setUploading(true);

    const queue = Array.from(files).flatMap((file) => {
      const errorKey = validateVehiclePhotoFile(file);
      if (errorKey) {
        toast.error(t(errorKey));
        return [];
      }
      const localId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      return [{ file, localId, previewUrl }];
    });

    if (queue.length === 0) {
      setUploading(false);
      return;
    }

    setPendingUploads((current) => [
      ...current,
      ...queue.map(({ file, localId, previewUrl }) => ({
        localId,
        previewUrl,
        fileName: file.name,
        progress: 0,
        status: "uploading" as const,
      })),
    ]);

    function markFailed(localIds: string[], message: string) {
      setPendingUploads((current) =>
        current.map((pending) =>
          localIds.includes(pending.localId)
            ? { ...pending, status: "error", errorMessage: message }
            : pending,
        ),
      );
    }

    let success = 0;
    try {
      // Upload files to Storage in parallel, then save every row in one API call.
      const uploaded = await runWithConcurrency(queue, PHOTO_UPLOAD_CONCURRENCY, async (item) => {
        const path = buildVehiclePhotoPath(vehicleId, item.file.name);
        try {
          await uploadVehiclePhotoFile(item.file, path, (percent) => {
            setPendingUploads((current) =>
              current.map((pending) =>
                pending.localId === item.localId
                  ? { ...pending, progress: percent, status: "uploading" }
                  : pending,
              ),
            );
          });
          setPendingUploads((current) =>
            current.map((pending) =>
              pending.localId === item.localId
                ? { ...pending, progress: 95, status: "saving" }
                : pending,
            ),
          );
          return { ...item, path };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("inventory.photos.errors.uploadFailed");
          markFailed([item.localId], message);
          toast.error(message);
          return null;
        }
      });

      const ready = uploaded.filter((item): item is NonNullable<typeof item> => item !== null);
      if (ready.length > 0) {
        try {
          const saved = await addMany.mutateAsync(
            ready.map((item) => ({
              storagePath: item.path,
              category: "other" as const,
              fileName: item.file.name,
              mimeType: item.file.type || null,
              fileSize: item.file.size,
              isPrimary: false,
            })),
          );

          queryClient.setQueryData<VehiclePhoto[]>(
            vehiclePhotoKeys.all(vehicleId),
            (current) => {
              const list = current ?? [];
              const known = new Set(list.map((photo) => photo.id));
              return [...list, ...saved.filter((photo) => !known.has(photo.id))].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              );
            },
          );

          success = saved.length;
          const savedIds = new Set(ready.map((item) => item.localId));
          setPendingUploads((current) =>
            current.filter((pending) => {
              if (!savedIds.has(pending.localId)) return true;
              if (pending.previewUrl.startsWith("blob:")) URL.revokeObjectURL(pending.previewUrl);
              return false;
            }),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("inventory.photos.errors.uploadFailed");
          markFailed(
            ready.map((item) => item.localId),
            message,
          );
          toast.error(message);
        }
      }
      if (success > 0) {
        toast.success(
          success === 1
            ? t("inventory.photos.toasts.uploaded")
            : t("inventory.photos.toasts.uploadedMany", { count: success }),
        );
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function dismissFailedUpload(localId: string) {
    setPendingUploads((current) =>
      current.filter((pending) => {
        if (pending.localId !== localId) return true;
        if (pending.previewUrl.startsWith("blob:")) URL.revokeObjectURL(pending.previewUrl);
        return false;
      }),
    );
  }

  async function setPrimary(photoId: string) {
    setBusyId(photoId);
    try {
      await update.mutateAsync({ photoId, body: { isPrimary: true } });
      toast.success(t("inventory.photos.toasts.primarySet"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inventory.photos.errors.generic"));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && deleteIds == null) exitSelecting();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting, deleteIds]);

  function exitSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(photoId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  async function handleDelete(photoIds: string[]) {
    if (photoIds.length === 1) setBusyId(photoIds[0]!);
    try {
      await removeMany.mutateAsync(photoIds);
      toast.success(
        photoIds.length === 1
          ? t("inventory.photos.toasts.removed")
          : t("inventory.photos.toasts.removedMany", { count: photoIds.length }),
      );
      setDeleteIds(null);
      exitSelecting();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inventory.photos.errors.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function move(photoId: string, direction: -1 | 1) {
    if (!query.data) return;
    const ordered = [...query.data].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((photo) => photo.id === photoId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    setBusyId(photoId);
    try {
      await reorder.mutateAsync({ orderedIds: next.map((photo) => photo.id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inventory.photos.errors.generic"));
    } finally {
      setBusyId(null);
    }
  }

  async function dropOn(targetId: string) {
    if (!query.data) return;
    const fromId = dragId.current;
    if (!fromId || fromId === targetId) return;
    const ordered = [...query.data].sort((a, b) => a.sortOrder - b.sortOrder);
    const from = ordered.findIndex((photo) => photo.id === fromId);
    const to = ordered.findIndex((photo) => photo.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...ordered];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    dragId.current = null;
    setBusyId(fromId);
    try {
      await reorder.mutateAsync({ orderedIds: next.map((photo) => photo.id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inventory.photos.errors.generic"));
    } finally {
      setBusyId(null);
    }
  }

  if (query.isPending) return <PhotoManagerSkeleton />;
  if (query.isError) {
    return (
      <EmptyState
        title={t("inventory.photos.errors.loadFailed")}
        description={t("inventory.photos.errors.generic")}
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const photos = [...(query.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const lightboxPhotos = photos.map((photo) => ({
    id: photo.id,
    src: photo.url,
    alt: photo.fileName,
    caption: photo.fileName,
  }));
  const isEmpty = photos.length === 0 && pendingUploads.length === 0;
  const deletePhotos = deleteIds ? photos.filter((photo) => deleteIds.includes(photo.id)) : [];
  const allSelected = photos.length > 0 && selectedIds.size === photos.length;

  return (
    <Card
      className="border-border/70 overflow-visible shadow-none"
      onDragOver={(event) => {
        if (!canEdit) return;
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        if (!canEdit) return;
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        setDropActive(false);
        void uploadFiles(event.dataTransfer.files);
      }}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="grid gap-1">
          <CardTitle className="text-base tracking-tight">{t("inventory.photos.title")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("inventory.photos.hint")}</p>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            void uploadFiles(event.target.files);
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            void uploadFiles(event.target.files);
          }}
        />

        <GalleryToolbar
          canEdit={canEdit && !selecting}
          uploading={uploading}
          onAdd={() => fileRef.current?.click()}
          onCamera={() => cameraRef.current?.click()}
          dropActive={dropActive}
          empty={isEmpty}
        />

        {!canEdit && isEmpty ? (
          <EmptyState
            icon={CameraIcon}
            title={t("inventory.photos.emptyTitle")}
            description={t("inventory.photos.emptyHint")}
          />
        ) : null}

        {pendingUploads.length > 0 ? (
          <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-medium tracking-tight">
              {t("inventory.photos.progress.title")}
            </p>
            <ul className={GALLERY_GRID}>
              {pendingUploads.map((photo) => (
                <PhotoThumb
                  key={photo.localId}
                  src={photo.previewUrl}
                  alt={photo.fileName}
                  isPrimary={false}
                  canEdit={photo.status === "error"}
                  upload={{
                    progress: photo.progress,
                    status: photo.status,
                    errorMessage: photo.errorMessage,
                  }}
                  onRemove={
                    photo.status === "error"
                      ? () => dismissFailedUpload(photo.localId)
                      : undefined
                  }
                />
              ))}
            </ul>
          </div>
        ) : null}

        {photos.length > 0 ? (
          // Gallery bar: the count and Select sit right above the photos they act on.
          <div className="flex min-h-9 items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {t("inventory.photos.count", { count: photos.length })}
            </p>
            {canEdit && photos.length > 1 && !selecting ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-full px-3.5"
                onClick={() => setSelecting(true)}
              >
                <CheckIcon aria-hidden />
                {t("inventory.photos.select")}
              </Button>
            ) : null}
          </div>
        ) : null}

        <PhotoGalleryList
          photos={photos}
          renderThumb={(photo, index, featured) => (
            <PhotoThumb
              key={photo.id}
              src={photo.url}
              alt={photo.fileName}
              isPrimary={photo.isPrimary}
              featured={featured}
              canEdit={canEdit}
              busy={busyId === photo.id}
              onOpen={() => setLightboxIndex(index)}
              onPrimary={() => void setPrimary(photo.id)}
              onRemove={() => setDeleteIds([photo.id])}
              onMoveLeft={index > 0 ? () => void move(photo.id, -1) : undefined}
              onMoveRight={
                index < photos.length - 1 ? () => void move(photo.id, 1) : undefined
              }
              selecting={selecting}
              selected={selectedIds.has(photo.id)}
              onToggleSelect={() => toggleSelected(photo.id)}
              draggable={canEdit && !selecting}
              onDragStart={() => {
                dragId.current = photo.id;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void dropOn(photo.id)}
            />
          )}
        />

        {selecting ? (
          // Floats above the mobile tab bar while scrolling through the gallery.
          <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center lg:bottom-6">
            <div
              role="toolbar"
              aria-label={t("inventory.photos.selectedCount", { count: selectedIds.size })}
              className="bg-background/95 ring-foreground/10 flex w-full max-w-lg items-center gap-2 rounded-2xl p-2 shadow-xl ring-1 backdrop-blur-md"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 shrink-0 rounded-full"
                aria-label={t("inventory.actions.cancel")}
                onClick={exitSelecting}
              >
                <XIcon className="size-5" aria-hidden />
              </Button>
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-semibold tabular-nums" aria-live="polite">
                  {selectedIds.size > 0
                    ? t("inventory.photos.selectedCount", { count: selectedIds.size })
                    : t("inventory.photos.selectHint")}
                </span>
                <button
                  type="button"
                  className="text-primary w-fit text-xs font-medium hover:underline"
                  onClick={() =>
                    setSelectedIds(
                      allSelected ? new Set() : new Set(photos.map((photo) => photo.id)),
                    )
                  }
                >
                  {allSelected
                    ? t("inventory.photos.clearSelection")
                    : t("inventory.photos.selectAllCount", { count: photos.length })}
                </button>
              </div>
              <Button
                type="button"
                variant="destructive"
                className="h-10 shrink-0 rounded-full px-4"
                disabled={selectedIds.size === 0}
                onClick={() => setDeleteIds([...selectedIds])}
              >
                <Trash2Icon aria-hidden />
                {t("inventory.photos.deleteAction")}
                {selectedIds.size > 0 ? (
                  <span className="bg-background/25 min-w-5 rounded-full px-1.5 text-xs tabular-nums">
                    {selectedIds.size}
                  </span>
                ) : null}
              </Button>
            </div>
          </div>
        ) : null}

        <VehiclePhotoLightbox
          photos={lightboxPhotos}
          index={lightboxIndex ?? 0}
          open={lightboxIndex != null}
          onOpenChange={(open) => {
            if (!open) setLightboxIndex(null);
          }}
          onIndexChange={setLightboxIndex}
        />

        <Dialog
          open={deleteIds != null}
          onOpenChange={(open) => {
            if (!open && !removeMany.isPending) setDeleteIds(null);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {deletePhotos.length > 1
                  ? t("inventory.photos.confirmDeleteMany", { count: deletePhotos.length })
                  : t("inventory.photos.confirmDelete")}
              </DialogTitle>
              <DialogDescription>
                {deletePhotos.length > 1
                  ? t("inventory.photos.confirmDeleteManyHint")
                  : t("inventory.photos.confirmDeleteHint")}
              </DialogDescription>
            </DialogHeader>
            {deletePhotos.length === 1 && deletePhotos[0]!.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img
                src={deletePhotos[0]!.url}
                alt={deletePhotos[0]!.fileName}
                className="bg-muted aspect-[4/3] w-full rounded-lg object-cover"
              />
            ) : deletePhotos.length > 1 ? (
              <ul className="grid grid-cols-4 gap-1.5">
                {deletePhotos.slice(0, 8).map((photo, index) => (
                  <li
                    key={photo.id}
                    className="bg-muted relative aspect-square overflow-hidden rounded-md"
                  >
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                      <img src={photo.url} alt={photo.fileName} className="size-full object-cover" />
                    ) : null}
                    {index === 7 && deletePhotos.length > 8 ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-medium text-white">
                        +{deletePhotos.length - 7}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={removeMany.isPending}
                onClick={() => setDeleteIds(null)}
              >
                {t("inventory.actions.cancel")}
              </Button>
              <LoadingButton
                type="button"
                variant="destructive"
                loading={removeMany.isPending}
                onClick={() => deleteIds && void handleDelete(deleteIds)}
              >
                {deletePhotos.length > 1
                  ? t("inventory.photos.deleteSelected", { count: deletePhotos.length })
                  : t("inventory.photos.remove")}
              </LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function VehicleImageManager(props: VehicleImageManagerProps) {
  if (props.mode === "draft") {
    return (
      <DraftManager
        photos={props.photos}
        onChange={props.onChange}
        disabled={props.disabled}
      />
    );
  }
  return (
    <ManageManager
      vehicleId={props.vehicleId}
      readOnly={props.readOnly || props.mode === "gallery"}
    />
  );
}

/** Upload draft photos after vehicle creation. Returns failed pending items. */
export async function uploadPendingVehiclePhotos(
  vehicleId: string,
  photos: PendingVehiclePhoto[],
  addPhotos: (
    bodies: Array<{
      storagePath: string;
      category: PendingVehiclePhoto["category"];
      fileName: string;
      mimeType: string | null;
      fileSize: number;
      isPrimary: boolean;
    }>,
  ) => Promise<unknown>,
  onProgress?: (
    localId: string,
    progress: number,
    status: PendingVehiclePhoto["status"],
    errorMessage?: string,
  ) => void,
): Promise<PendingVehiclePhoto[]> {
  const failed: PendingVehiclePhoto[] = [];
  const primaryId =
    photos.find((photo) => photo.isPrimary)?.localId ?? photos[0]?.localId;

  function fail(photo: PendingVehiclePhoto, error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    failed.push({
      ...photo,
      status: "error",
      errorMessage: message,
      progress: photo.progress ?? 0,
    });
    onProgress?.(photo.localId, photo.progress ?? 0, "error", message);
  }

  // Upload files to Storage in parallel, then save every row in one API call.
  const uploaded = await runWithConcurrency(photos, PHOTO_UPLOAD_CONCURRENCY, async (photo) => {
    const path = buildVehiclePhotoPath(vehicleId, photo.file.name);
    try {
      onProgress?.(photo.localId, 0, "uploading");
      await uploadVehiclePhotoFile(photo.file, path, (percent) => {
        onProgress?.(photo.localId, percent, "uploading");
      });
      onProgress?.(photo.localId, 95, "saving");
      return { photo, path };
    } catch (error) {
      fail(photo, error);
      return null;
    }
  });

  const ready = uploaded.filter((item): item is NonNullable<typeof item> => item !== null);
  if (ready.length === 0) return failed;

  try {
    await addPhotos(
      ready.map(({ photo, path }) => ({
        storagePath: path,
        category: photo.category || "other",
        fileName: photo.file.name,
        mimeType: photo.file.type || null,
        fileSize: photo.file.size,
        isPrimary: photo.localId === primaryId,
      })),
    );
    for (const { photo } of ready) {
      onProgress?.(photo.localId, 100, "ready");
      if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
    }
  } catch (error) {
    for (const { photo } of ready) fail(photo, error);
  }

  // Keep the caller's original order for the retry list.
  const order = new Map(photos.map((photo, index) => [photo.localId, index]));
  return failed.sort((a, b) => order.get(a.localId)! - order.get(b.localId)!);
}

export function useRevokePendingPhotos(photos: PendingVehiclePhoto[]) {
  useEffect(() => {
    return () => {
      for (const photo of photos) {
        if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
  }, []);
}
