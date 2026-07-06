"""Vendored pure-Python Ed25519 (RFC 8032), public domain.

Adapted from the Bernstein et al. reference implementation
(https://ed25519.cr.yp.to/python/ed25519.py) — slow but correct, dependency-free.
Used as the asymmetric signing fallback so Passport is secure-by-default even
when the `cryptography` package is not installed: the keyring holds genuine PUBLIC
keys, and the private seed is required to sign. Not constant-time — fine for a local
prototype, NOT for production key handling.

Public API:
    publickey(seed: bytes32) -> bytes32          # derive the public key
    sign(message, seed, public) -> bytes64        # detached signature
    verify(public, message, signature) -> bool    # True iff valid
"""
from __future__ import annotations

import hashlib
import sys

sys.setrecursionlimit(10000)  # reference scalarmult/expmod recurse ~250-510 deep

b = 256
q = 2 ** 255 - 19
_l = 2 ** 252 + 27742317777372353535851937790883648493


def _H(m: bytes) -> bytes:
    return hashlib.sha512(m).digest()


def _inv(x: int) -> int:
    return pow(x, q - 2, q)  # Fermat inverse via C-level modular exponentiation


_d = -121665 * _inv(121666) % q
_I = pow(2, (q - 1) // 4, q)


def _xrecover(y: int) -> int:
    xx = (y * y - 1) * _inv(_d * y * y + 1)
    x = pow(xx, (q + 3) // 8, q)
    if (x * x - xx) % q != 0:
        x = (x * _I) % q
    if x % 2 != 0:
        x = q - x
    return x


_By = 4 * _inv(5) % q
_Bx = _xrecover(_By)
_B = [_Bx % q, _By % q]


def _edwards(P, Q):
    x1, y1 = P
    x2, y2 = Q
    x3 = (x1 * y2 + x2 * y1) * _inv(1 + _d * x1 * x2 * y1 * y2)
    y3 = (y1 * y2 + x1 * x2) * _inv(1 - _d * x1 * x2 * y1 * y2)
    return [x3 % q, y3 % q]


def _scalarmult(P, e):
    if e == 0:
        return [0, 1]
    Q = _scalarmult(P, e // 2)
    Q = _edwards(Q, Q)
    if e & 1:
        Q = _edwards(Q, P)
    return Q


def _encodeint(y: int) -> bytes:
    bits = [(y >> i) & 1 for i in range(b)]
    return bytes(sum(bits[i * 8 + j] << j for j in range(8)) for i in range(b // 8))


def _encodepoint(P) -> bytes:
    x, y = P
    bits = [(y >> i) & 1 for i in range(b - 1)] + [x & 1]
    return bytes(sum(bits[i * 8 + j] << j for j in range(8)) for i in range(b // 8))


def _bit(h: bytes, i: int) -> int:
    return (h[i // 8] >> (i % 8)) & 1


def publickey(seed: bytes) -> bytes:
    h = _H(seed)
    a = 2 ** (b - 2) + sum(2 ** i * _bit(h, i) for i in range(3, b - 2))
    A = _scalarmult(_B, a)
    return _encodepoint(A)


def _Hint(m: bytes) -> int:
    h = _H(m)
    return sum(2 ** i * _bit(h, i) for i in range(2 * b))


def sign(message: bytes, seed: bytes, public: bytes) -> bytes:
    h = _H(seed)
    a = 2 ** (b - 2) + sum(2 ** i * _bit(h, i) for i in range(3, b - 2))
    r = _Hint(h[b // 8 : b // 4] + message)
    R = _scalarmult(_B, r)
    S = (r + _Hint(_encodepoint(R) + public + message) * a) % _l
    return _encodepoint(R) + _encodeint(S)


def _isoncurve(P) -> bool:
    x, y = P
    return (-x * x + y * y - 1 - _d * x * x * y * y) % q == 0


def _decodeint(s: bytes) -> int:
    return sum(2 ** i * _bit(s, i) for i in range(0, b))


def _decodepoint(s: bytes):
    y = sum(2 ** i * _bit(s, i) for i in range(0, b - 1))
    x = _xrecover(y)
    if x & 1 != _bit(s, b - 1):
        x = q - x
    P = [x, y]
    if not _isoncurve(P):
        raise ValueError("decoding point that is not on curve")
    return P


def verify(public: bytes, message: bytes, signature: bytes) -> bool:
    try:
        if len(signature) != b // 4 or len(public) != b // 8:
            return False
        R = _decodepoint(signature[0 : b // 8])
        A = _decodepoint(public)
        S = _decodeint(signature[b // 8 : b // 4])
        h = _Hint(_encodepoint(R) + public + message)
        return _scalarmult(_B, S) == _edwards(R, _scalarmult(A, h))
    except Exception:  # noqa: BLE001 - any decode failure is an invalid signature
        return False
