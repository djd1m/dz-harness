# Knowledge Units — 12factor-port-binding

Deep-lookup reference for the `12factor-port-binding` skill. Machine-distilled Knowledge Units from
The Twelve-Factor App, Factor VII (Port binding). Facts and technique-names preserved; prose
paraphrased in our own words.

Источник: The Twelve-Factor App — Factor VII. Port binding, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors.

---

## 12factor-vii-ku01 — Export services by self-contained port binding
- **Type:** decision-framework

**Problem.** You are deciding how a web (or other network) service becomes reachable. Traditional
stacks drop the app code into a preinstalled server container — PHP running under Apache, Java running
under Tomcat — so the runtime environment has to inject a webserver before the app can serve requests.
That creates a hidden dependency on the deployment environment and makes the app non-portable.

**Content.** Decide that the app should carry everything it needs to serve traffic and open its own
listening socket, rather than being hosted inside an externally supplied server. Heuristic: the
webserver is pulled in as a *declared library dependency* inside the app's own code — Tornado for
Python, Thin for Ruby, Jetty for the JVM — all running in user space; the app itself claims a port and
answers requests on it. Litmus test: if you can give the deploy environment nothing but the app plus
its declared deps and it still answers on `http://localhost:<port>/`, the factor is satisfied. In
production a *separate routing layer* maps a public hostname onto the port-bound processes. Example:
locally the developer hits the port directly, while in deploy the router forwards public requests to
that same bound port.

**Applicability.** Web apps and any process that accepts network requests; containerized/PaaS
deployments where the platform provides only a routing layer and expects the app to bind a port;
twelve-factor migrations.

**Limits.** Not the model for apps that must live inside a mandated app-server container, or where an
ops-managed webserver is a hard requirement. Port assignment and TLS/hostname termination are pushed to
an external routing layer, so it assumes such a layer exists. The factor addresses how the service is
*exported*, not internal request handling.

---

## 12factor-vii-ku02 — Port binding generalizes beyond HTTP and enables app-as-backing-service
- **Type:** heuristic

**Problem.** You have a service that speaks a non-HTTP protocol, or one app that needs to consume
another app as a dependency. Assuming port binding is an HTTP-only trick leads teams to special-case
other servers and to hard-wire inter-app connections instead of treating them as swappable resources.

**Content.** Heuristic: the same bind-a-port-and-listen contract covers essentially any server
software, not just HTTP — for instance ejabberd speaking XMPP, or Redis speaking its own wire protocol.
Architectural consequence: because a service is reached purely through a bound port, one app can act as
a backing service for another; the consumer simply receives that app's URL as a resource handle
supplied through config. Design criterion: route every service export through port binding so each app
stays self-contained and free of runtime webserver injection, which keeps inter-app links configurable
and replaceable rather than baked in.

**Applicability.** Non-HTTP daemons (messaging, cache, database-like services); microservice topologies
where one service backs another; systems that swap backing services per environment via
config-provided URLs.

**Limits.** Requires the consuming app to reference the provider only through a config-injected
resource handle (ties to Factor III config and Factor IV backing services) — hardcoded endpoints break
the benefit. Does not itself address auth, discovery, or transport security between the apps.

---

## Citation

Источник: The Twelve-Factor App — Factor VII. Port binding, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors.
