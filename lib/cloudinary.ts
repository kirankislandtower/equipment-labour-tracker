/**
 * Utility for uploading images to Cloudinary.
 */

export const uploadToCloudinary = async (
  base64DataUri: string, 
  cloudName: string = 'kmkkthdk', 
  uploadPreset: string = 'foreman_uploads'
): Promise<string> => {
  try {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const formData = new FormData();
    formData.append('file', base64DataUri);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudinary upload failed: ${errorText}`);
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    throw error;
  }
};

/**
 * Automatically applies a text watermark using Cloudinary's URL transformations.
 * This completely eliminates the need for manual canvas drawing!
 *
 * `capturedAt` should be the moment the photo was actually taken, not the moment
 * this function happens to run -- those can differ by hours when an entry sits in
 * the offline queue waiting for signal, and the whole point of the stamp is to
 * prove when the photo was really taken, not when it finished uploading. Photo
 * EXIF metadata would be the "real" source of truth, but the compression step
 * (canvas-based resize) strips EXIF entirely, so this must be captured explicitly
 * at the moment of capture and threaded through instead. Falls back to the current
 * time only if the caller genuinely doesn't have a captured-at moment.
 */
export const getWatermarkedCloudinaryUrl = (originalUrl: string, jobName: string, capturedAt?: Date): string => {
  if (!originalUrl || !originalUrl.includes('res.cloudinary.com')) return originalUrl;

  // Format date manually to avoid slashes (/) and commas (,) which break Cloudinary URLs
  const now = capturedAt || new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  const sanitizedJobName = jobName.replace(/[,/]/g, '').substring(0, 35);
  
  const cleanDate = encodeURIComponent(dateStr);
  const cleanJobName = encodeURIComponent(sanitizedJobName);
  
  // %250A is the encoded newline for Cloudinary URL
  const textStr = `${cleanDate}%250A${cleanJobName}%250AVerified%20Entry`;
  
  // c_limit,w_1200 normalizes the image width so the text size is consistent.
  // b_rgb:000000B3 gives a 70% opacity black background block behind the text.
  const transform = `c_limit,w_1200/l_text:Arial_30_bold_left:${textStr},co_white,b_rgb:000000B3,g_south_west,x_40,y_40`;

  return originalUrl.replace('/upload/', `/upload/${transform}/`);
};
