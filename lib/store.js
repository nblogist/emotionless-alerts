import { Redis } from '@upstash/redis';

let redis = null;

function getRedis() {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export function isConfigured() {
  return !!getRedis();
}

export async function get(key) {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch (e) {
    console.error(`KV get error [${key}]:`, e.message);
    return null;
  }
}

export async function set(key, value) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value);
  } catch (e) {
    console.error(`KV set error [${key}]:`, e.message);
  }
}

export async function lpush(key, value) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.lpush(key, JSON.stringify(value));
    await r.ltrim(key, 0, 49);
  } catch (e) {
    console.error(`KV lpush error [${key}]:`, e.message);
  }
}

export async function lrange(key, start, end) {
  const r = getRedis();
  if (!r) return [];
  try {
    const items = await r.lrange(key, start, end);
    return items.map((item) => {
      if (typeof item === 'string') {
        try { return JSON.parse(item); } catch { return item; }
      }
      return item;
    });
  } catch (e) {
    console.error(`KV lrange error [${key}]:`, e.message);
    return [];
  }
}
