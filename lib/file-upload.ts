/** Photo or PDF ready for the documents endpoint (base64 body, no data: prefix). */
export type PreparedFile = { filename: string; contentType: string; dataBase64: string };

const MAX_IMAGE_SIDE = 1800;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

/** Shrink phone photos to ~1800px JPEG so uploads stay small on cell data. PDFs pass through. */
export async function prepareFileForUpload(file: File): Promise<PreparedFile> {
  if (file.type === "application/pdf") {
    const url = await readAsDataUrl(file);
    return { filename: file.name, contentType: file.type, dataBase64: url.split(",")[1] ?? "" };
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a photo or a PDF");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const url = canvas.toDataURL("image/jpeg", 0.82);
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return { filename: `${base}.jpg`, contentType: "image/jpeg", dataBase64: url.split(",")[1] ?? "" };
}
