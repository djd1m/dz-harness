# Knowledge Units — 12factor-admin-processes

Deep-lookup reference for the SKILL.md decision skill. Source: The Twelve-Factor App — Factor XII
(Admin processes), 12factor.net (CC BY 4.0). Machine-distilled, paraphrased, unreviewed (trust_tier 0).
© the Twelve-Factor authors.

---

## 12factor-f12-ku01 — Execute one-off admin/management tasks in a production-identical environment
*type: decision-framework · factor: XII · skill_worthiness: high*

**Problem:** You need to perform an occasional administrative or maintenance action against a running
app — apply a schema migration, open a REPL to inspect or query live models, or run a one-time cleanup
script. The open question is where and how to run it so it stays consistent with the deployed app and
does not drift out of sync.

**Content (paraphrased):** Separate two kinds of work: the long-running process types that serve regular
operations (web requests, background workers) versus one-off admin/management tasks. Each admin task
should run as its own short-lived process rather than being baked into the always-on app or launched from
an unrelated environment. Three decision criteria govern a healthy one-off run: (1) it executes against a
specific release, using the exact same codebase and config as the regular processes; (2) it uses the
identical dependency-isolation mechanism as the app's other process types; (3) one-time scripts are
committed into the repository rather than run from arbitrary local copies. Litmus test — if a Ruby web
process boots via `bundle exec thin start`, the migration should run via `bundle exec rake db:migrate`;
a Python app on Virtualenv invokes its vendored `bin/python` both for the web server and for any
`manage.py` task. If the admin command is launched through a different runtime, dependency set, or config
than the app, the factor is violated. Typical tasks: database migrations (`manage.py migrate`,
`rake db:migrate`), a REPL/console to run code or query the live database, and committed one-time scripts
(e.g. `php scripts/fix_bad_records.php`).

**Applicability:** Any time developers or operators need to run migrations, backfills, data fixes, or
interactive inspection against a deployed app. Locally, invoke the one-off process directly from a shell
in the app's checkout directory; in production, run it through SSH or whatever remote command-execution
mechanism the deploy platform offers.

**Limits:** The heuristic assumes admin tasks share the same release, codebase, and config as the running
processes — that is the whole point, and it prevents synchronization drift. It does NOT cover
long-running or recurring jobs (those belong to the regular process formation, not one-off admin runs).
Ad hoc scripts run outside version control, or through a runtime/dependency set that differs from the
app's, break the guarantee and reintroduce environment-mismatch bugs.

---

## Citation
Источник: The Twelve-Factor App — Factor XII (Admin processes), 12factor.net (CC BY 4.0).
© the Twelve-Factor authors.
