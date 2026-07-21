import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'image/jpeg', 'image/png', 'image/webp', 'image/gif',
          'video/mp4', 'video/quicktime', 'video/webm',
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 50 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
