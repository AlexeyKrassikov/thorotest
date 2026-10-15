"""WebAuthn configuration and JSON encoding, with no request-derived trust."""
import json
import os
from urllib.parse import urlsplit

from fastapi import HTTPException
from webauthn import options_to_json
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes


def configuration():
    origin = os.getenv("WEBAUTHN_ORIGIN") or os.getenv("TESTHUB_BASE_URL", "")
    try:
        parsed = urlsplit(origin)
        local = parsed.hostname in ("localhost", "127.0.0.1") and os.getenv("ENVIRONMENT") != "production"
        if (not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ("", "/") or (parsed.scheme != "https" and not (local and parsed.scheme == "http"))):
            raise ValueError()
        rp_id = os.getenv("WEBAUTHN_RP_ID") or parsed.hostname
        # This app has one origin; deliberately disallow wider parent-domain RP IDs.
        if rp_id != parsed.hostname:
            raise ValueError()
        return rp_id, origin.rstrip("/"), os.getenv("WEBAUTHN_RP_NAME", "ThoroTest")
    except ValueError:
        raise HTTPException(503, "Passkeys are not configured for this origin")


def options_json(options):
    return json.loads(options_to_json(options))
