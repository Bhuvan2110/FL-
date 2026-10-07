import { describe, expect, it } from 'vitest'
import '../../test/setup'
import { decryptJson, encryptJson, modelPassphrase } from '../encryption'

describe('AES-256-GCM encryption', () => {
  it('round-trips a JSON payload', () => {
    const payload = { w: [1.23, -0.45, 0.89], b: 0.02 }
    const { ciphertext, iv } = encryptJson(payload, 'test-key-fedshield')
    const recovered = decryptJson<typeof payload>(ciphertext, iv, 'test-key-fedshield')
    expect(recovered).toEqual(payload)
  })

  it('rejects decryption with the wrong passphrase', () => {
    const { ciphertext, iv } = encryptJson({ x: 1 }, 'correct')
    expect(() => decryptJson(ciphertext, iv, 'wrong')).toThrow()
  })

  it('produces a different IV on every call', () => {
    const a = encryptJson({ x: 1 }, 'key')
    const b = encryptJson({ x: 1 }, 'key')
    expect(a.iv).not.toBe(b.iv)
  })
})

describe('modelPassphrase', () => {
  it('differs per user for the same experiment', () => {
    const p1 = modelPassphrase('u1', 'e1')
    const p2 = modelPassphrase('u2', 'e1')
    expect(p1).not.toBe(p2)
  })

  it('differs per experiment for the same user', () => {
    const p1 = modelPassphrase('u1', 'e1')
    const p2 = modelPassphrase('u1', 'e2')
    expect(p1).not.toBe(p2)
  })
})
