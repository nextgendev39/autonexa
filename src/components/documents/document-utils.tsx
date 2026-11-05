import { FileImageIcon, FileTextIcon, FileTypeIcon } from "lucide-react";

export function formatFileSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Image, PDF or other-document icon for a file. */
export function FileKindIcon({
  mimeType,
  fileName,
  className,
}: {
  mimeType: string | null;
  fileName: string;
  className?: string;
}) {
  if (mimeType?.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(fileName)) {
    return <FileImageIcon className={className} />;
  }
  if (mimeType === "application/pdf" || /\.pdf$/i.test(fileName)) return <FileTextIcon className={className} />;
  return <FileTypeIcon className={className} />;
}
