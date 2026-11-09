import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [mode, source, keyPath, destination] = process.argv.slice(2);
if (!['encrypt', 'decrypt'].includes(mode) || !source || !keyPath || !destination) {
  throw new Error('Uso: node scripts/restore-snapshot.mjs encrypt|decrypt <entrada> <arquivo-chave> <saída>');
}

function decrypt(encrypted, key) {
  if (encrypted.length < 29) throw new Error('Backup cifrado incompleto.');
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  return Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]);
}

const input = readFileSync(source);
const options = { flag: 'wx', mode: 0o600 };
if (mode === 'encrypt') {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const encrypted = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  if (!decrypt(encrypted, key).equals(input)) throw new Error('Verificação do backup falhou.');
  writeFileSync(keyPath, key.toString('hex') + '\n', options);
  writeFileSync(destination, encrypted, options);
  console.log('Backup cifrado com AES-256-GCM e verificado byte a byte.');
} else {
  const encoded = readFileSync(keyPath, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/i.test(encoded)) throw new Error('Chave inválida.');
  const restored = decrypt(input, Buffer.from(encoded, 'hex'));
  writeFileSync(destination, restored, options);
  console.log('Backup autenticado e descriptografado.');
}
