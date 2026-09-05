// Vercel serverless function. Runs server-side only -- this is the one place allowed
// to hold the Cloudinary API Secret, since that credential can delete assets and
// read everything on the account. It must never ship inside the app bundle the way
// the unsigned upload preset (lib/cloudinary.ts) safely does.
//
// Reads Cloudinary's real account usage and hands the admin dashboard back just the
// numbers it needs to show a live "how close to the free/paid plan ceiling are we"
// indicator -- see https://cloudinary.com/documentation/admin_api#usage.
module.exports = async function handler(req, res) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'kmkkthdk';
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !apiSecret) {
    res.status(500).json({ error: 'CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are not set in this deployment\'s environment variables.' });
    return;
  }

  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `Cloudinary usage lookup failed: ${text}` });
      return;
    }

    const data = await response.json();

    res.status(200).json({
      plan: data.plan ?? null,
      creditsUsed: data.credits?.usage ?? null,
      creditsLimit: data.credits?.limit ?? null,
      usedPercent: data.credits?.used_percent ?? null,
      storageBytes: data.storage?.usage ?? null,
      bandwidthBytes: data.bandwidth?.usage ?? null,
      transformations: data.transformations?.usage ?? null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch Cloudinary usage.' });
  }
};
