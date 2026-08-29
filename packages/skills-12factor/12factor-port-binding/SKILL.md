---
name: 12factor-port-binding
description: >
  Decide HOW a service becomes reachable: make the app self-contained and let it open its OWN
  listening socket, instead of dropping code into a preinstalled server container (PHP-in-Apache,
  Java-in-Tomcat) that the runtime must inject. Pull the webserver in as a declared library
  dependency (Tornado/Thin/Jetty) running in user space, claim a port, and answer on
  http://localhost:<port>/; a separate routing layer maps the public hostname onto that bound port
  in production. Same bind-a-port contract covers non-HTTP daemons (XMPP/ejabberd, Redis wire),
  which is what lets one app be a BACKING SERVICE for another. The EXPORT/reachability model ONLY —
  NOT how you attach/consume another app as a resource (→ 12factor-backing-services-as-resources),
  NOT where the port/URL config lives (→ 12factor-config-in-environment).
  Triggers (RU+EN): "нужен ли внешний Apache/Tomcat или сервер внутри приложения",
  "приложение само слушает порт или его хостит контейнер", "как задеплоить на PaaS который даёт
  только роутинг", "выставить не-HTTP сервис (XMPP/Redis) наружу", "одно приложение как бэкенд для
  другого через URL", "should the app embed its own webserver or run under Apache/Tomcat",
  "bind a port and listen instead of deploying into a servlet container", "how does my app serve
  requests on a PaaS that only routes", "expose a non-HTTP daemon by port binding",
  "make one service reachable by another app as a dependency".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net/port-binding to promote to Tier 2"
derived_from: [12factor-vii-ku01, 12factor-vii-ku02]
---

# 12-Factor Port Binding — the app exports itself by claiming a port, not by living inside a server

## Decision
How should a service be exported so that it is reachable over the network?

**Choice: the app carries everything it needs to serve traffic and opens its OWN listening socket.**
It does not get dropped into a preinstalled, externally supplied server container (PHP under Apache,
Java under Tomcat) that the deployment environment has to inject for it. Instead the webserver arrives
as an ordinary **declared library dependency** — Tornado for Python, Thin for Ruby, Jetty for the JVM —
pulled into the app's own code and running entirely in **user space**. The app itself claims a port and
answers requests there. In production a **separate routing layer** maps a public hostname onto the
port-bound process; locally the developer hits the port directly.

The same bind-a-port-and-listen contract is not HTTP-specific — it covers essentially any server
software (ejabberd over XMPP, Redis over its own wire protocol). Because a service is reached purely
through a bound port, **one app can act as a backing service for another**: the consumer just receives
that app's URL as a resource handle supplied through config.

## Protocol

1. **Depend on a webserver library, don't require an injected container.** Declare the HTTP server
   (Tornado / Thin / Jetty, or equivalent) among the app's own dependencies so it runs in user space,
   rather than assuming the environment provides Apache/Tomcat around your code.
2. **Bind the port yourself.** The app process claims a port and listens on it, answering requests
   directly. Nothing outside the app is needed to turn it into a running service.
3. **Prove it with the localhost litmus test.** Hand the deploy environment nothing but the app plus
   its declared deps; if it still answers on `http://localhost:<port>/`, port binding is satisfied.
4. **Push hostname/TLS termination to a routing layer.** In deploy, a separate router forwards public
   requests for a hostname onto the same bound port. The app does not own public-hostname or TLS
   assignment — it assumes such a layer exists in front of it.
5. **Generalize the contract beyond HTTP.** Apply the identical bind-and-listen pattern to non-HTTP
   daemons (messaging, cache, database-like services) — port binding is not an HTTP-only trick.
6. **Consume other apps only through a config-injected URL.** When one app backs another, the consumer
   references the provider solely via a resource handle (URL) supplied through config — never a
   hardcoded endpoint — so the link stays swappable.

### Criteria / litmus table

| Criterion | What must be true | Litmus test | If it fails |
|---|---|---|---|
| **Self-contained export** | App + declared deps serve traffic with no external server injected | Give the env only app+deps → it answers on `http://localhost:<port>/` | Runtime is injecting a webserver; app is not portable |
| **Webserver as library** | HTTP server is a declared dependency in user space (Tornado/Thin/Jetty) | "Is the server in my dependency manifest, not a system container?" | You depend on a mandated Apache/Tomcat container |
| **App owns the port** | The process claims a port and listens itself | "Can I start it and curl the port with nothing else running?" | Something outside the app is required to serve |
| **Routing layer in front** | Public hostname + TLS mapped onto the bound port by a separate router | "Does the app try to own the public hostname/TLS itself?" → no | App conflates export with hostname termination |
| **Protocol-agnostic** | Same bind-a-port contract covers non-HTTP servers | XMPP (ejabberd) / Redis-wire daemon exported the same way | You special-case every non-HTTP server |
| **App-as-backing-service** | Consumer reaches the provider via a config-injected URL handle | "Is the other app's endpoint hardcoded?" → no | Inter-app link is baked in, not replaceable |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|---|---|---|
| Deploying app code into a runtime-supplied server container (PHP-in-Apache, Java-in-Tomcat) | Creates a hidden dependency on the deploy environment; the app can't serve without an injected webserver, so it isn't portable | ku01 |
| Assuming the platform will provide the webserver at runtime | On a PaaS that offers only routing, there is nothing to inject — the app must carry its own server | ku01 |
| The app trying to own public-hostname assignment and TLS termination itself | Port binding pushes hostname/TLS to an external routing layer; conflating them couples the app to deploy topology | ku01 |
| Treating port binding as HTTP-only and special-casing XMPP/Redis/other daemons | The bind-a-port-and-listen contract already covers any server software; special-casing is needless coupling | ku02 |
| Hardcoding another app's endpoint when consuming it as a dependency | Kills the swappable-resource benefit; the app-as-backing-service link must come from config as a URL handle | ku02 |

## Related decisions
- `12factor-backing-services-as-resources` (Factor IV) — port binding is *what makes* an app
  consumable as a backing service; that skill governs how the consumer *attaches* to it (as a
  swappable resource reached through a locator). Port-binding↔backing-services: one exports by a port,
  the other consumes that port's URL as a resource.
- `12factor-config-in-environment` (Factor III) — the provider app's URL/port handed to a consumer is
  a config value; where that locator physically lives is decided there, not here.
- `12factor-explicit-dependencies` (Factor II) — the webserver library (Tornado/Thin/Jetty) is a
  *declared* dependency; port binding relies on that declaration so the server ships with the app.
- `12factor-stateless-processes` (Factor VI) — the port-bound process that answers requests is the
  same share-nothing process; export model here, state model there.

## Источник
Источник: The Twelve-Factor App — Factor VII. Port binding, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors. Paraphrased and restructured derivative (no verbatim runs); deep
reference in references/knowledge-units.md.
KUs: 12factor-vii-ku01 (self-contained port-binding export), 12factor-vii-ku02 (port binding
generalizes beyond HTTP and enables app-as-backing-service).

## Self-check
- [x] Every protocol step / criterion traces to a listed KU (ku01/ku02)?
- [x] Boundary clause routes resource-consumption to backing-services and locator storage to config-in-environment?
- [x] Prose paraphrased — no verbatim run ≥ 8 words from the source?
- [x] Technique/fact names kept accurate (Tornado, Thin, Jetty, Apache, Tomcat, ejabberd/XMPP, Redis, user space, routing layer)?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «нужен ли внешний Apache/Tomcat, или приложение само должно слушать порт?» → embed the webserver as
  a declared dependency (Tornado/Thin/Jetty) in user space and let the app bind its own port; no
  runtime-injected container.
- "how does my app serve requests on a PaaS that only gives me a routing layer?" → the app carries its
  own server, binds a port, and answers on it; the platform's router maps the public hostname onto that
  port.
- «как выставить не-HTTP сервис, например XMPP или Redis, наружу?» → same bind-a-port-and-listen
  contract as HTTP — port binding isn't HTTP-only; the daemon claims a port and listens.
- "we want service B to consume service A as a dependency" → A is reachable by its bound port, so hand
  B A's URL as a config-injected resource handle (never hardcode it) — that's app-as-backing-service.
