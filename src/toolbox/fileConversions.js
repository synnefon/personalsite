const LOSSY = new Set(["jpeg", "webp"]);

export const convertableImageFormats = ["jpeg", "jpg", "png", "webp"];

export function getOutputFormats(inputFormat) {
  return {
    "jpeg": ["png", "webp"],
    "jpg": ["png", "webp"],
    "png": ["jpg", "webp"],
    "webp": ["png", "jpg"]
  }[inputFormat]
}

export async function convertImage(file, outputFormat) {
  if (!(file instanceof File)) throw new Error("Input must be a File object");
  const srcUrl = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = srcUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0);

  const blob = await new Promise((res) =>
    canvas.toBlob(
      (b) => {
        URL.revokeObjectURL(srcUrl);
        res(b);
      },
      outputFormat,
      LOSSY.has(outputFormat) ? 0.92 : undefined
    )
  );

  return blob;
}
