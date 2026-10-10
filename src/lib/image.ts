const avatarSize = 256;

/** Center-crop an image file to a small square JPEG data URL, suitable for a profile picture. */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That image could not be read. Try a JPEG or PNG."));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = avatarSize;
    canvas.height = avatarSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot resize images.");

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const left = (image.naturalWidth - side) / 2;
    const top = (image.naturalHeight - side) / 2;
    // JPEG has no transparency, so give transparent PNGs a white background instead of black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, avatarSize, avatarSize);
    context.drawImage(image, left, top, side, side, 0, 0, avatarSize, avatarSize);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
