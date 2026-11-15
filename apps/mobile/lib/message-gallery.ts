import { isGalleryImageMimeType } from '@cairn/shared'

/** ギャラリーに追加できる、メッセージの画像添付 */
export type MessageGalleryImage = {
  fileId: string
  fileName: string
}

/** メッセージの添付のうち、ギャラリーに追加できる画像だけを返す（Web の galleryImagesOf と同じ） */
export function galleryImagesOf(
  attachments: { fileId: string; fileName: string; mimeType: string | null }[],
): MessageGalleryImage[] {
  return attachments
    .filter((attachment) => isGalleryImageMimeType(attachment.mimeType))
    .map((attachment) => ({ fileId: attachment.fileId, fileName: attachment.fileName }))
}

/** 初期選択: 未追加の画像すべて */
export function initialGallerySelection(
  images: MessageGalleryImage[],
  addedFileIds: readonly string[],
): Set<string> {
  const added = new Set(addedFileIds)
  return new Set(images.filter((image) => !added.has(image.fileId)).map((image) => image.fileId))
}
