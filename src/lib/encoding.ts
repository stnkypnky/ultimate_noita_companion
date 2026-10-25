// URL-safe binary helpers shared by sync codes and wand share links.

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** JSON → deflate-raw → base64url */
export async function packJson(value: unknown): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('deflate-raw')));
}

/** Inverse of packJson. Throws on malformed input. */
export async function unpackJson<T>(code: string): Promise<T> {
  const bytes = await pipe(fromBase64Url(code.trim()), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
