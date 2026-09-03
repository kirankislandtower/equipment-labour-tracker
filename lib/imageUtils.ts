import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_WIDTH = 1600;
const COMPRESS_QUALITY = 0.6;

const getImageWidth = (uri: string): Promise<number> =>
  new Promise((resolve) => {
    Image.getSize(
      uri,
      (width) => resolve(width),
      () => resolve(0) // Unknown size -- fall through to resizing anyway.
    );
  });

/**
 * Resizes a captured photo down to MAX_WIDTH (device cameras commonly shoot
 * 3000px+/multiple MB) and re-encodes it as JPEG, returning a base64 data URI
 * ready for preview and Cloudinary upload. Pass originalWidth when already
 * known (e.g. from an ImagePicker asset) to skip a redundant size lookup and
 * to avoid ever upscaling an image that's already smaller than MAX_WIDTH.
 */
export const compressImageToDataUri = async (
  uri: string,
  originalWidth?: number
): Promise<string> => {
  const width = originalWidth ?? (await getImageWidth(uri));

  const context = ImageManipulator.manipulate(uri);
  if (!width || width > MAX_WIDTH) {
    context.resize({ width: MAX_WIDTH, height: null });
  }

  const renderedImage = await context.renderAsync();
  const result = await renderedImage.saveAsync({
    format: SaveFormat.JPEG,
    compress: COMPRESS_QUALITY,
    base64: true,
  });

  return `data:image/jpeg;base64,${result.base64}`;
};
