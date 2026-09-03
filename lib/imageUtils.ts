import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_WIDTH = 1600;
const COMPRESS_QUALITY = 0.6;

const getImageDimensions = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }) // Unknown size -- skip resizing, still recompress below.
    );
  });

/**
 * Resizes a captured photo down to MAX_WIDTH (device cameras commonly shoot
 * 3000px+/multiple MB) and re-encodes it as JPEG, returning a base64 data URI
 * ready for preview and Cloudinary upload. Pass originalWidth/originalHeight
 * when already known (e.g. from an ImagePicker asset) to skip a redundant size
 * lookup and to avoid ever upscaling an image that's already smaller than
 * MAX_WIDTH.
 *
 * The target height is always computed explicitly here rather than passed as
 * `height: null` (the documented way to let the library auto-calculate it) --
 * expo-image-manipulator's web resize implementation throws
 * ("createImageData: source height is zero or not a number") when given a
 * null height, silently falling back to the uncompressed original everywhere
 * this was awaited without its own catch.
 */
export const compressImageToDataUri = async (
  uri: string,
  originalWidth?: number,
  originalHeight?: number
): Promise<string> => {
  let width = originalWidth;
  let height = originalHeight;
  if (!width || !height) {
    const dims = await getImageDimensions(uri);
    width = dims.width;
    height = dims.height;
  }

  const context = ImageManipulator.manipulate(uri);
  if (width && height && width > MAX_WIDTH) {
    const targetHeight = Math.round(height * (MAX_WIDTH / width));
    context.resize({ width: MAX_WIDTH, height: targetHeight });
  }

  const renderedImage = await context.renderAsync();
  const result = await renderedImage.saveAsync({
    format: SaveFormat.JPEG,
    compress: COMPRESS_QUALITY,
    base64: true,
  });

  return `data:image/jpeg;base64,${result.base64}`;
};
