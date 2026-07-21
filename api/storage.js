import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key é obrigatório' });
    const value = await kv.get(key);
    return res.status(200).json({ value: value ?? [] });
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key e value são obrigatórios' });
    }
    await kv.set(key, value);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Método não permitido' });
}
