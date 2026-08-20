"""
AES-256-GCM encryption for model weights at rest.
Uses the Python `cryptography` library — no simulation.
"""
import os
import json
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from app.core.config import get_settings


def _derive_key(passphrase: str) -> bytes:
    """Derive a 256-bit AES key from a passphrase using PBKDF2-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"fedshield-static-salt-v1",
        iterations=100_000,
    )
    return kdf.derive(passphrase.encode())


def encrypt_json(payload: dict, passphrase: str) -> tuple[str, str]:
    """
    Encrypts a JSON-serialisable dict with AES-256-GCM.
    Returns (ciphertext_b64, iv_b64).
    """
    key = _derive_key(passphrase)
    iv = os.urandom(12)  # 96-bit nonce
    aesgcm = AESGCM(key)
    plaintext = json.dumps(payload).encode()
    ct = aesgcm.encrypt(iv, plaintext, None)
    return base64.b64encode(ct).decode(), base64.b64encode(iv).decode()


def decrypt_json(ciphertext_b64: str, iv_b64: str, passphrase: str) -> dict:
    """Decrypts an AES-256-GCM ciphertext back to a dict."""
    key = _derive_key(passphrase)
    iv = base64.b64decode(iv_b64)
    ct = base64.b64decode(ciphertext_b64)
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ct, None)
    return json.loads(plaintext)


def model_passphrase(user_id: str, experiment_id: str) -> str:
    """Consistent passphrase scoped to user + experiment (mirrors frontend PBKDF2 logic)."""
    secret = get_settings().encryption_secret
    return f"{secret}:{user_id}:{experiment_id}"
