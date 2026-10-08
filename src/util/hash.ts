/** Two independent 32-bit FNV-1a passes => 16 hex chars. Not cryptographic; used for stable ids only. */
export function hashId(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a ^= c;
    a = Math.imul(a, 0x01000193);
    b ^= c + i;
    b = Math.imul(b, 0x85ebca6b);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
