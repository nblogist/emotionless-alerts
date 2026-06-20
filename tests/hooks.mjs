// ESM resolve hook: redirects lib/store.js → tests/mock-store.js
export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.endsWith('/lib/store.js')) {
    return { ...result, url: new URL('./mock-store.js', import.meta.url).href };
  }
  return result;
}
