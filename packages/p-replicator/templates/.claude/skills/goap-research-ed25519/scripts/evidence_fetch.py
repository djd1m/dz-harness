#!/usr/bin/env python3
"""
Evidence fetch — the ONLY place that can mint the artifact behind FETCH_VERIFIED.

Why this file exists (ADR-003). Before it, the package had no network path at all
(`grep -rn "requests.get\\|urlopen\\|httpx"` over the skill returned nothing), and
`create_signed_fact(source_content=...)` hashed whatever string the caller passed.
So `source_hash` was a hash of the agent's own words. Any "did you read it?" class
assigned on the agent's word would repeat the failure it is meant to catch: the
model that confidently recites an unread source will just as confidently label it
verified. A checklist item is satisfied by writing it; only running something
produces an artifact.

So FETCH_VERIFIED is earned by an artifact obtainable only by performing the
request: the sha256 of a real response body, its HTTP status, its final URL after
redirects, and the date it happened.

HONEST SCOPE — printed by every surface that shows the class:
  FETCH_VERIFIED means "this script issued an HTTP request and received a body
  with this byte hash on this date".
  It does NOT mean the source is authoritative, that the claim follows from it,
  or that the reader understood it. It is provenance, not truth.

Constraints: stdlib only (no new dependency in a medical package); the network is
never touched implicitly — a caller must ask; offline degrades LOUDLY to
LISTING_ONLY with a stated reason, it never fails the run.
"""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import socket
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import urlparse

DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_MAX_BYTES = 5 * 1024 * 1024  # 5 MiB — a paper/abstract page, not a dataset
# Hard ceiling the caller cannot raise: `read(max_bytes + 1)` with an unbounded
# max_bytes is an unbounded-memory path (Codex QE #12).
HARD_MAX_BYTES = 32 * 1024 * 1024
DEFAULT_MAX_REDIRECTS = 5
USER_AGENT = "health-advisor-evidence-fetch/1.0 (+provenance; stdlib urllib)"

# Only these schemes may be fetched. file:// and friends would let a "fetch"
# read the local disk and pass as network evidence.
ALLOWED_SCHEMES = ("http", "https")


class FetchRefused(ValueError):
    """The request was refused before any I/O (bad scheme, malformed URL)."""


# Process-local witness. A FetchRecord is only accepted as proof if it carries
# THIS process's token, which is handed out exclusively by fetch_source().
# HONEST THREAT MODEL (the narrow promise): the adversary here is a MODEL TAKING A
# SHORTCUT, not an attacker with code execution. Anything running inside this
# interpreter can read _FETCH_WITNESS and forge a record — in-process Python
# cannot be made tamper-proof against its own caller, and pretending otherwise
# would be the very over-claim this feature exists to delete. What this stops is
# the realistic failure: a caller that constructs a plausible-looking record (a
# SimpleNamespace, a hand-built FetchRecord) instead of performing the request.
_FETCH_WITNESS = object()


@dataclass(frozen=True)
class FetchRecord:
    """Proof-of-fetch. Frozen on purpose: the artifact must not be edited after
    the fact by the code that consumes it."""

    url: str
    final_url: str
    status: int
    sha256_body: str
    bytes_len: int
    fetched_at: str
    content_type: Optional[str] = None
    witness: Any = None

    def is_authentic(self) -> bool:
        """True only for a record minted by fetch_source() in this process."""
        return self.witness is _FETCH_WITNESS

    @property
    def ok(self) -> bool:
        """2xx only. A 404 body is a real body, but it is not the source."""
        return 200 <= self.status < 300

    def to_dict(self) -> Dict[str, Any]:
        """Serializable view. The witness is a process-local sentinel: exporting it
        breaks json.dumps, and `asdict()` deep-copies it — destroying the very
        identity that makes it proof (Codex QE r2). It is deliberately dropped."""
        data = {k: v for k, v in asdict(self).items() if k != "witness"}
        data["authentic"] = self.is_authentic()
        return data


@dataclass(frozen=True)
class FetchFailure:
    """A named failure. Never raised into the caller's face — the caller degrades
    to LISTING_ONLY and records `reason` verbatim, so the downgrade is auditable."""

    url: str
    reason: str
    attempted_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _resolved_addresses(host: str, port: Optional[int]) -> list:
    """Every address the host resolves to. ALL of them are checked, because a
    name that resolves to one public and one private address would otherwise
    pass on the public one and connect on the private one."""
    try:
        infos = socket.getaddrinfo(host, port or 0, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError, ValueError) as exc:
        raise FetchRefused(f"cannot resolve host {host!r}: {exc}") from exc
    return [info[4][0] for info in infos]


def _is_public_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    # Loopback, RFC1918, link-local (incl. 169.254.169.254 cloud metadata),
    # multicast, reserved — all off limits for evidence fetching.
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _validate_url(url: str, allow_private: bool = False) -> str:
    """Scheme + host + destination-address check.

    SSRF matters here even though the body is only hashed: a fetch against an
    internal address is still a GET with side effects, and the status/length/hash
    it returns is an oracle about the private network. A research tool has no
    business reaching anything but public web sources (Codex QE #8).

    `allow_private` exists ONLY for the local test server; it is never set by the
    library's own code paths.
    """
    if not isinstance(url, str):
        raise FetchRefused(f"refusing non-string URL of type {type(url).__name__}")
    try:
        parsed = urlparse(url)
    except (ValueError, UnicodeError) as exc:  # malformed IPv6, control chars, lone surrogates
        raise FetchRefused(f"refusing malformed URL {url!r}: {exc}") from exc
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise FetchRefused(
            f"refusing to fetch scheme {parsed.scheme!r}: only {'/'.join(ALLOWED_SCHEMES)} may back FETCH_VERIFIED"
        )
    try:
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:  # invalid port
        raise FetchRefused(f"refusing malformed URL {url!r}: {exc}") from exc
    if not host:
        raise FetchRefused(f"refusing to fetch malformed URL {url!r}: no host")
    if allow_private:
        return url
    for address in _resolved_addresses(host, port):
        if not _is_public_address(address):
            raise FetchRefused(
                f"refusing to fetch {host!r}: resolves to non-public address {address} "
                "(loopback/private/link-local are not evidence sources)"
            )
    return url


class _CappedRedirectHandler(urlrequest.HTTPRedirectHandler):
    """Redirects are followed but FULLY re-validated — scheme AND destination
    address. A public URL redirecting into the internal network is the classic
    SSRF bypass, and checking only the scheme on the hop leaves it open."""

    max_repeats = DEFAULT_MAX_REDIRECTS
    max_redirections = DEFAULT_MAX_REDIRECTS

    def __init__(self, allow_private: bool = False):
        super().__init__()
        self._allow_private = allow_private

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        _validate_url(newurl, allow_private=self._allow_private)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_source_returning_body(
    url: str,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = DEFAULT_MAX_BYTES,
    _allow_private: bool = False,
) -> Tuple["FetchRecord | FetchFailure", Optional[bytes]]:
    """Perform the request and return ``(proof-or-failure, captured-body)``.

    Never raises for network conditions: an unreachable source is a normal state
    of the world, and the caller's correct response is to degrade the evidence
    class, not to abort the research. `_allow_private` is for the test server
    only — the library never sets it. Failures always carry ``None`` as the body,
    so no truncated or error body can cross the witness boundary.
    """
    try:
        max_bytes = int(max_bytes)
    except (TypeError, ValueError):
        return FetchFailure(url=str(url), reason="max_bytes is not an integer", attempted_at=_now_iso()), None
    if max_bytes <= 0 or max_bytes > HARD_MAX_BYTES:
        return FetchFailure(
            url=str(url),
            reason=f"max_bytes must be in 1..{HARD_MAX_BYTES}; refusing an unbounded read",
            attempted_at=_now_iso(),
        ), None
    try:
        _validate_url(url, allow_private=_allow_private)
    except FetchRefused as exc:
        return FetchFailure(url=str(url), reason=str(exc), attempted_at=_now_iso()), None

    opener = urlrequest.build_opener(_CappedRedirectHandler(allow_private=_allow_private))
    try:
        req = urlrequest.Request(url, headers={"User-Agent": USER_AGENT})
    except ValueError as exc:
        return FetchFailure(url=str(url), reason=f"malformed request: {exc}", attempted_at=_now_iso()), None
    try:
        with opener.open(req, timeout=timeout) as response:
            # Read ONE byte past the cap so truncation is detectable rather than
            # silent: a truncated body would hash to something that no repeat
            # fetch could ever reproduce.
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                return FetchFailure(
                    url=url,
                    reason=f"response exceeds max_bytes={max_bytes}; refusing to hash a truncated body",
                    attempted_at=_now_iso(),
                ), None
            status = getattr(response, "status", None) or response.getcode()
            final_url = response.geturl()
            content_type = response.headers.get("Content-Type") if response.headers else None
    except urlerror.HTTPError as exc:
        # An HTTP error still carries a status — report it as a failure with the
        # status named, because a 403/404 page is not the source it stands for.
        return FetchFailure(url=url, reason=f"HTTP {exc.code} {exc.reason}", attempted_at=_now_iso()), None
    except (urlerror.URLError, socket.timeout, TimeoutError, OSError, UnicodeError) as exc:
        return FetchFailure(url=str(url), reason=f"network error: {exc}", attempted_at=_now_iso()), None
    except FetchRefused as exc:
        return FetchFailure(url=url, reason=str(exc), attempted_at=_now_iso()), None
    except (http.client.HTTPException, ValueError) as exc:
        # InvalidURL, bad chunking, control characters in the URL — a NAMED
        # failure, never an exception in the caller's face (Codex QE #11).
        return FetchFailure(url=str(url), reason=f"protocol/URL error: {exc}", attempted_at=_now_iso()), None

    record = FetchRecord(
        url=url,
        final_url=final_url,
        status=int(status),
        sha256_body=hashlib.sha256(body).hexdigest(),
        bytes_len=len(body),
        fetched_at=_now_iso(),
        content_type=content_type,
        witness=_FETCH_WITNESS,  # only real fetches carry it
    )
    if not record.ok:
        return FetchFailure(url=url, reason=f"non-2xx status {record.status}", attempted_at=record.fetched_at), None
    return record, body


def fetch_source(
    url: str,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = DEFAULT_MAX_BYTES,
    _allow_private: bool = False,
) -> "FetchRecord | FetchFailure":
    """Compatibility wrapper: return the existing record/failure shape only."""
    result, _ = fetch_source_returning_body(
        url,
        timeout=timeout,
        max_bytes=max_bytes,
        _allow_private=_allow_private,
    )
    return result
