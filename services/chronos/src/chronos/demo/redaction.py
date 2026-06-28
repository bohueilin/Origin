"""Redaction helpers for demo reports and publication attempts."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SECRET_KEY_RE = re.compile(
    r"(token|secret|password|api[_-]?key|authorization|cookie|credential|session)", re.I
)
AUTH_HEADER_RE = re.compile(r"(?im)(authorization:\s*)[^\n\r]+")
COOKIE_RE = re.compile(r"(?i)(cookie:\s*)[^\n\r]+")
TOKEN_VALUE_RE = re.compile(
    r"(?i)\b([A-Za-z0-9_]*(token|secret|api[_-]?key)[A-Za-z0-9_]*=)[^\s&]+"
)
TOKEN_COLON_RE = re.compile(
    r"(?i)([\"']?[A-Za-z0-9_ -]*(?:token|secret|api[_-]?key|password)[A-Za-z0-9_ -]*[\"']?\s*:\s*[\"']?)[^\"'\s,}]+"
)
SIGNED_QUERY_KEYS = {
    "x-amz-signature",
    "x-amz-credential",
    "x-amz-security-token",
    "signature",
    "sig",
    "token",
    "access_token",
    "api_key",
}
URL_RE = re.compile(r"https?://[^\s]+")


def redact_text(value: str) -> str:
    """Redact common secret-bearing strings without changing benign text."""

    value = AUTH_HEADER_RE.sub(r"\1<redacted>", value)
    value = COOKIE_RE.sub(r"\1<redacted>", value)
    value = TOKEN_VALUE_RE.sub(r"\1<redacted>", value)
    value = TOKEN_COLON_RE.sub(r"\1<redacted>", value)
    return _redact_signed_url(value)


def redact_record(value: Any) -> Any:
    """Recursively redact a JSON-compatible value."""

    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            if SECRET_KEY_RE.search(str(key)):
                redacted[key] = "<redacted>"
            elif key in {
                "env",
                "environment",
                "environ",
                "subprocess_env",
            } and isinstance(item, dict):
                redacted[key] = {
                    k: (
                        "<redacted>"
                        if SECRET_KEY_RE.search(str(k))
                        else redact_record(v)
                    )
                    for k, v in item.items()
                }
            else:
                redacted[key] = redact_record(item)
        return redacted
    if isinstance(value, list):
        return [redact_record(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def _redact_signed_url(value: str) -> str:
    if not value.startswith(("http://", "https://")):
        return URL_RE.sub(lambda match: _redact_signed_url(match.group(0)), value)
    parts = urlsplit(value)
    if not parts.scheme or not parts.netloc or not parts.query:
        return value
    query = []
    changed = False
    for key, item in parse_qsl(parts.query, keep_blank_values=True):
        if key.lower() in SIGNED_QUERY_KEYS:
            query.append((key, "<redacted>"))
            changed = True
        else:
            query.append((key, item))
    if not changed:
        return value
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )
