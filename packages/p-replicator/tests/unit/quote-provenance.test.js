const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const packageRoot = path.resolve(__dirname, "../..");
const scriptsDir = path.join(
  packageRoot,
  "templates/.claude/skills/goap-research-ed25519/scripts",
);

function runPython(source, args = []) {
  const result = spawnSync("python3", ["-c", source, ...args], {
    cwd: scriptsDir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("refuses verbatim for excerpt not hash-bound to its FetchRecord", () => {
  const verdict = runPython(`
import hashlib
import evidence_fetch as ef
import quote_provenance as qp
body = b"a phrase captured from source bytes"
record = ef.FetchRecord(url="https://example.test", final_url="https://example.test", status=200,
    sha256_body=hashlib.sha256(body).hexdigest(), bytes_len=len(body),
    fetched_at="2026-09-02T00:00:00Z", content_type="text/plain; charset=utf-8",
    witness=ef._FETCH_WITNESS)
captured = qp.capture_excerpt(body, "phrase captured from source bytes", record)
captured["excerpt"] = "author-forged phrase captured from source bytes"
fact = {"acquisition": "raw-fetch", "source_url": record.final_url,
        "sha256_body": record.sha256_body}
print(qp.verify_verbatim("phrase captured from source bytes", captured, fact))
`);
  assert.equal(verdict, "hash-mismatch");
});

test("verbatim policy accepts normalized exact match and rejects overlap paraphrase", () => {
  const verdicts = runPython(`
import hashlib
import quote_provenance as qp
excerpt = 'The source says “iron\\u00a0status & recovery” — exactly.'
record = {"excerpt": excerpt, "content_type": "text/html; charset=utf-8",
          "source_url": "https://example.test", "sha256_body": "a" * 64,
          "sha256_excerpt": hashlib.sha256(excerpt.encode()).hexdigest()}
fact = {"acquisition": "raw-fetch", "source_url": "https://example.test", "sha256_body": "a" * 64}
print(qp.verify_verbatim('iron status &amp; recovery" - exactly', record, fact))
print(qp.verify_verbatim("iron status recovery was described exactly", record, fact))
`);
  assert.deepEqual(verdicts.split("\n"), ["verbatim-confirmed", "not-in-excerpt"]);
});

test("non-text body triggers named verbatim refusal", () => {
  const refusal = runPython(`
import hashlib
import evidence_fetch as ef
import quote_provenance as qp
body = b"%PDF-1.7 quoted phrase in a binary body"
record = ef.FetchRecord(url="https://example.test/file.pdf", final_url="https://example.test/file.pdf",
    status=200, sha256_body=hashlib.sha256(body).hexdigest(), bytes_len=len(body),
    fetched_at="2026-09-02T00:00:00Z", content_type="application/pdf", witness=ef._FETCH_WITNESS)
try:
    qp.capture_excerpt(body, "quoted phrase in a binary body", record)
except qp.ExcerptCaptureRefused as exc:
    print(str(exc))
else:
    raise AssertionError("PDF body unexpectedly produced an excerpt")
`);
  assert.match(refusal, /non-text body/);
  assert.match(refusal, /application\/pdf/);
});

test("capture run writes gitignore that excludes excerpts", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "quote-provenance-"));
  try {
    const init = spawnSync("git", ["init", "--quiet", temporary], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const store = path.join(temporary, "evidence_excerpts");
    const excerptId = runPython(`
import hashlib
import sys
import evidence_fetch as ef
import quote_provenance as qp
body = b"captured phrase from a fetched source"
record = ef.FetchRecord(url="https://example.test", final_url="https://example.test", status=200,
    sha256_body=hashlib.sha256(body).hexdigest(), bytes_len=len(body),
    fetched_at="2026-09-02T00:00:00Z", content_type="text/plain; charset=utf-8",
    witness=ef._FETCH_WITNESS)
captured = qp.capture_excerpt(body, "captured phrase from a fetched source", record)
qp.write_excerpt(sys.argv[1], captured)
print(captured["excerpt_id"])
`, [store]);
    assert.equal(readFileSync(path.join(store, ".gitignore"), "utf8"), "*\n");
    const ignored = spawnSync(
      "git",
      ["-C", temporary, "check-ignore", "--quiet", path.join("evidence_excerpts", excerptId)],
      { encoding: "utf8" },
    );
    assert.equal(ignored.status, 0, ignored.stderr || "captured excerpt was not ignored");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("unknown or absent acquisition method fails closed", () => {
  const states = runPython(`
import hashlib
import quote_provenance as qp
text = "a captured phrase long enough to be checked"
record = {"excerpt": text, "content_type": "text/plain; charset=utf-8",
          "source_url": "https://example.test", "sha256_body": "b" * 64,
          "sha256_excerpt": hashlib.sha256(text.encode()).hexdigest()}
for method in (None, "Raw-Fetch", "webfetch"):
    fact = {"acquisition": method, "source_url": "https://example.test", "sha256_body": "b" * 64}
    print(qp.verify_verbatim(text, record, fact))
`);
  assert.deepEqual(states.split("\n"), ["method-unknown", "method-unknown", "method-unknown"]);
});
