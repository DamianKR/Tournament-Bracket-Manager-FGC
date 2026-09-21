import imageCompression from 'browser-image-compression';

const AVATAR_MAX_PX = 256;
const AVATAR_MAX_BYTES = 48 * 1024; // ~64KB base64 — fits easily in the JSON store

/**
 * Compress an uploaded image to a small avatar thumbnail.
 * Client-side only (canvas + webp), works fully offline. The result is a
 * data URL small enough to live inside the participant record and sync
 * through the normal outbox — no separate upload endpoint needed.
 */
export async function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File is not an image');
  }
  const compressed = await imageCompression(file, {
    maxSizeMB: AVATAR_MAX_BYTES / (1024 * 1024),
    maxWidthOrHeight: AVATAR_MAX_PX,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.85,
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(compressed);
  });
}
