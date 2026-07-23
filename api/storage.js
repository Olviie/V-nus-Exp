import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key é obrigatório' });
    if (!redis) return res.status(503).json({ error: 'Redis não configurado' });
    const value = await redis.get(key);
    return res.status(200).json({ value: value ?? [] });
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key e value são obrigatórios' });
    }
    if (!redis) return res.status(503).json({ error: 'Redis não configurado' });
    await redis.set(key, value);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Método não permitido' });
}
