// In-memory mock of lib/store.js for testing
const data = new Map();

export function isConfigured() { return true; }

export async function get(key) {
  return data.get(key) ?? null;
}

export async function set(key, value) {
  data.set(key, value);
}

export async function del(key) {
  data.delete(key);
}

export async function lpush(key, value) {
  if (!data.has(key)) data.set(key, []);
  data.get(key).unshift(value);
}

export async function lrange(key, start, end) {
  const list = data.get(key) || [];
  return list.slice(start, end < 0 ? list.length + end + 1 : end + 1);
}

// Test helper — reset all state between tests
export function _clear() {
  data.clear();
}
