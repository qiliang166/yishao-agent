"""License key generator for Yishao Agent.
Standalone developer tool — NOT packaged into builds.
Generates keys in YSAG-XXXXX-... format using AES-256-GCM.
"""
import secrets
import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ── Shared constants (keep in sync with services/license_service.py) ──
_AES_KEY = bytes([
    168, 156, 204, 203, 222, 99, 104, 23, 26, 157, 251, 242, 49, 64, 10, 177,
    63, 247, 203, 223, 109, 119, 149, 106, 9, 56, 103, 203, 102, 192, 3, 215,
])

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # 32 chars, no O/I/L
_DECODE_MAP = {c: i for i, c in enumerate(_ALPHABET)}

MAGIC = b"YS"       # 0x59 0x53
VERSION = 0x01
NONCE_LEN = 12
TAG_LEN = 16
PLAINTEXT_LEN = 6


def _base32_encode(data: bytes) -> str:
    """Encode bytes to Crockford-style Base32 string."""
    result = []
    bits = 0
    bit_count = 0

    for byte in data:
        bits = (bits << 8) | byte
        bit_count += 8
        while bit_count >= 5:
            bit_count -= 5
            result.append(_ALPHABET[(bits >> bit_count) & 0x1F])
            bits &= (1 << bit_count) - 1

    if bit_count > 0:
        result.append(_ALPHABET[(bits << (5 - bit_count)) & 0x1F])

    return "".join(result)


def _base32_decode(s: str) -> bytes:
    """Decode Crockford-style Base32 string to bytes."""
    s = s.upper().strip().replace("-", "").replace(" ", "")
    # Map confusing chars
    s = s.replace("O", "0").replace("I", "1").replace("L", "1")

    bits = 0
    bit_count = 0
    result = bytearray()

    for c in s:
        if c not in _DECODE_MAP:
            continue
        bits = (bits << 5) | _DECODE_MAP[c]
        bit_count += 5
        if bit_count >= 8:
            bit_count -= 8
            result.append((bits >> bit_count) & 0xFF)
            bits &= (1 << bit_count) - 1

    return bytes(result)


def generate_license_key(product_id: int = 1, serial_number: int | None = None) -> tuple:
    """Generate a single license key.

    Returns (formatted_key: str, serial_number: int, product_id: int)
    """
    if serial_number is None:
        serial_number = secrets.randbelow(65536)

    plaintext = bytearray(PLAINTEXT_LEN)
    plaintext[0:2] = MAGIC
    plaintext[2] = VERSION
    plaintext[3] = max(1, min(255, product_id))
    plaintext[4] = (serial_number >> 8) & 0xFF
    plaintext[5] = serial_number & 0xFF

    nonce = secrets.token_bytes(NONCE_LEN)
    aesgcm = AESGCM(_AES_KEY)
    ciphertext = aesgcm.encrypt(nonce, bytes(plaintext), None)

    blob = nonce + ciphertext
    encoded = _base32_encode(blob)

    # Format: YSAG-XXXXX-XXXXX-...
    groups = [encoded[i:i + 5] for i in range(0, len(encoded), 5)]
    formatted = "YSAG-" + "-".join(groups)

    return formatted, serial_number, product_id


def main():
    parser = argparse.ArgumentParser(description="Yishao Agent License Key Generator")
    parser.add_argument("--count", type=int, default=1, help="Number of keys to generate")
    parser.add_argument("--serial", type=int, default=None, help="Specific serial number")
    parser.add_argument("--product-id", type=int, default=1, help="Product type ID")
    args = parser.parse_args()

    if args.count < 1 or args.count > 1000:
        print("Error: count must be between 1 and 1000")
        sys.exit(1)

    print()
    for i in range(args.count):
        sn = args.serial if args.serial is not None else None
        key, sn, pid = generate_license_key(product_id=args.product_id, serial_number=sn)
        print(f"  Serial #{sn:05d}  (product={pid})")
        print(f"  {key}")
        print()


if __name__ == "__main__":
    main()
