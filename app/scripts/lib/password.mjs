// 서버(server/crypto.ts)와 같은 비밀번호 해시: PBKDF2-SHA256, 100,000회, 16바이트 salt, 32바이트 결과(16진)
import { webcrypto } from 'node:crypto';

const ITERATIONS = 100_000;

export async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return { hash: Buffer.from(bits).toString('hex'), salt: Buffer.from(salt).toString('hex') };
}
