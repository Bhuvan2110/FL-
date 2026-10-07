/**
 * AES-256-GCM encryption for model weights at rest, using Node's built-in
 * `crypto` module (no third-party crypto library — same "built from
 * first principles" spirit the project already uses for the ML core).
 */
import crypto from 'node:crypto'
import { getConfig } from '../config'

const SALT = 'fedshield-static-salt-v1'
const ITERATIONS = 100_000

function deriveKey(passphrase: string): Buffer {
  return crypto.pbkdf2Sync(passphrase, SALT, ITERATIONS, 32, 'sha256')
}

/** Encrypts a JSON-serialisable value. Returns base64 ciphertext (with the
 * 16-byte GCM auth tag appended, matching the Python version's combined
 * ciphertext+tag convention) and base64 IV. */
export function encryptJson(payload: unknown, passphrase: string): { ciphertext: string; iv: string } {
  const key = deriveKey(passphrase)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([encrypted, authTag])
  return { ciphertext: combined.toString('base64'), iv: iv.toString('base64') }
}

export function decryptJson<T = unknown>(ciphertextB64: string, ivB64: string, passphrase: string): T {
  const key = deriveKey(passphrase)
  const iv = Buffer.from(ivB64, 'base64')
  const combined = Buffer.from(ciphertextB64, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const encrypted = combined.subarray(0, combined.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

export function modelPassphrase(userId: string, experimentId: string): string {
  return `${getConfig().encryptionSecret}:${userId}:${experimentId}`
}
