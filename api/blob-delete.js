import { del } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url é obrigatória' });

  try {
    await del(url);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
