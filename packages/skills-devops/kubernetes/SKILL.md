---
name: "kubernetes"
description: "Designs and reviews Kubernetes deployments — manifests, Helm charts, scaling, networking, security, and troubleshooting."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# kubernetes

Design, review, and operate Kubernetes workloads across the full lifecycle. Covers workload selection, manifest authoring, resource management, health checks, networking, storage, security hardening, Helm packaging, autoscaling, debugging, GitOps delivery, and production readiness. Produces cluster-ready configurations that follow upstream Kubernetes and CNCF best practices.

## When to use

- User wants to deploy an application to Kubernetes for the first time
- User asks which workload type (Deployment, StatefulSet, DaemonSet, Job) fits their use case
- User needs help writing or reviewing Kubernetes YAML manifests
- User wants to set up Helm charts for a project
- User asks about horizontal or vertical pod autoscaling
- User needs to configure Ingress, NetworkPolicy, or Service networking
- User wants to harden pod security (RBAC, SecurityContext, PodSecurityStandards)
- User needs to debug a CrashLoopBackOff, OOMKilled, or scheduling failure
- User asks about GitOps with ArgoCD or Flux
- User wants a production readiness review for their Kubernetes deployment

## When NOT to use

- User wants to provision cloud infrastructure (VPCs, IAM roles, RDS) -- use `terraform`
- User wants to write Docker Compose files for local development -- use `docker-compose`
- User wants to build container images or write Dockerfiles (container build, not orchestration)
- User wants to debug application-level code bugs unrelated to Kubernetes -- use `debugging`
- User wants to set up CI pipelines that happen to deploy to Kubernetes -- use `ci-fix` for pipeline issues
- User wants to manage bare-metal servers or VMs without Kubernetes

## Procedure

### Step 1. Choose deployment strategy

Select the correct workload controller for the application's requirements. This decision shapes everything downstream.

| Controller | Use when | Scaling | Identity | Storage | Example |
|-----------|----------|---------|----------|---------|---------|
| Deployment | Stateless apps, interchangeable pods | HPA/VPA | No stable identity | Ephemeral or shared PVC | Web API, frontend, microservices |
| StatefulSet | Stateful apps needing stable identity | Manual or HPA | Stable hostname (`pod-0`, `pod-1`) | Per-pod PVC via volumeClaimTemplates | Databases, Kafka, Elasticsearch |
| DaemonSet | One pod per node | Node count | Per-node | HostPath or local | Log collectors, monitoring agents, CNI plugins |
| Job | Run-to-completion tasks | Parallelism field | None | Ephemeral | Data migrations, batch processing |
| CronJob | Scheduled tasks | N/A | None | Ephemeral | Backups, report generation, cleanup scripts |

**Decision rules:**
- If the app is stateless and horizontally scalable, use a Deployment. This covers 80% of workloads.
- If the app requires stable network identity or per-instance persistent storage (databases, message brokers), use a StatefulSet.
- If exactly one instance must run on every node (or a subset of nodes), use a DaemonSet.
- If the workload runs once and exits, use a Job. If it runs on a schedule, use a CronJob.

### Step 2. Write manifests

Create the core Kubernetes resources. Every production deployment needs at minimum a workload controller, a Service, and a ConfigMap.

**Deployment + Service + ConfigMap:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
  labels:
    app.kubernetes.io/name: myapp
    app.kubernetes.io/version: "1.4.2"
    app.kubernetes.io/component: backend
    app.kubernetes.io/managed-by: helm
spec:
  replicas: 3
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app.kubernetes.io/name: myapp
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: myapp
        app.kubernetes.io/version: "1.4.2"
    spec:
      serviceAccountName: myapp
      securityContext:
        runAsNonRoot: true
        fsGroup: 1000
      containers:
        - name: myapp
          image: registry.example.com/myapp:1.4.2
          ports:
            - containerPort: 8080
              name: http
              protocol: TCP
          envFrom:
            - configMapRef:
                name: myapp-config
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: myapp-secrets
                  key: db-password
          securityContext:
            runAsNonRoot: true
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          startupProbe:
            httpGet:
              path: /healthz
              port: http
            failureThreshold: 30
            periodSeconds: 10
      terminationGracePeriodSeconds: 30
---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
  namespace: production
  labels:
    app.kubernetes.io/name: myapp
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: myapp
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
---
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
  namespace: production
data:
  LOG_LEVEL: "info"
  DB_HOST: "postgres.production.svc.cluster.local"
  DB_PORT: "5432"
  DB_NAME: "myapp"
  CACHE_TTL: "300"
---
# secret.yaml (example structure -- use sealed-secrets or external-secrets in practice)
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
  namespace: production
type: Opaque
stringData:
  db-password: "REPLACE_WITH_SEALED_OR_EXTERNAL_SECRET"
---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - myapp.example.com
      secretName: myapp-tls
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  name: http
```

**PersistentVolumeClaim (when needed):**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data
  namespace: production
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 20Gi
```

**Labeling convention:** Always use the `app.kubernetes.io/*` recommended labels. At minimum: `name`, `version`, `component`, and `managed-by`. These enable consistent querying, monitoring, and tooling integration.

### Step 3. Resource management

Set resource requests and limits for every container. Pods without requests cannot be scheduled predictably. Pods without limits can consume unbounded resources and destabilize the node.

**Requests vs limits:**

| Setting | Purpose | Scheduling impact | OOM behavior |
|---------|---------|-------------------|--------------|
| `requests.cpu` | Guaranteed CPU share | Used by scheduler for bin-packing | CPU throttled, not killed |
| `requests.memory` | Guaranteed memory | Used by scheduler for bin-packing | Pod evicted if node under pressure |
| `limits.cpu` | Maximum CPU | Not used for scheduling | Throttled to limit |
| `limits.memory` | Maximum memory | Not used for scheduling | OOMKilled if exceeded |

**Guidelines:**
- Set `requests` based on steady-state usage (p50 from monitoring).
- Set `limits` based on peak usage (p99) with a safety margin.
- For CPU: `limits` can be 2-5x `requests`. Some teams omit CPU limits entirely to avoid throttling (requires cluster-level ResourceQuota instead).
- For memory: `limits` should be 1.5-2x `requests`. Memory is incompressible -- exceeding the limit kills the pod.

**LimitRange (namespace defaults):**

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - default:
        cpu: 500m
        memory: 512Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      type: Container
    - max:
        cpu: "4"
        memory: 8Gi
      type: Container
```

**ResourceQuota (namespace ceiling):**

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    pods: "100"
    persistentvolumeclaims: "20"
    services.loadbalancers: "5"
```

**VPA (Vertical Pod Autoscaler):**

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Auto"  # or "Off" for recommendations-only
  resourcePolicy:
    containerPolicies:
      - containerName: myapp
        minAllowed:
          cpu: 50m
          memory: 64Mi
        maxAllowed:
          cpu: "2"
          memory: 4Gi
```

### Step 4. Health checks

Configure probes so Kubernetes knows when a pod is alive, ready for traffic, and has finished starting.

**Three probe types:**

| Probe | Purpose | Failure action | When to use |
|-------|---------|----------------|-------------|
| `livenessProbe` | Is the process alive? | Kill and restart the pod | Detect deadlocks, unrecoverable states |
| `readinessProbe` | Can it serve traffic? | Remove from Service endpoints | Detect temporary unavailability (loading cache, warming up) |
| `startupProbe` | Has it finished starting? | Kill and restart (until success) | Slow-starting apps (JVM warmup, large data loads) |

**HTTP probe:**

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
    httpHeaders:
      - name: X-Health-Check
        value: kubernetes
  initialDelaySeconds: 15
  periodSeconds: 20
  timeoutSeconds: 5
  failureThreshold: 3
  successThreshold: 1
```

**TCP probe (databases, message brokers):**

```yaml
readinessProbe:
  tcpSocket:
    port: 5432
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 3
```

**Exec probe (custom scripts):**

```yaml
livenessProbe:
  exec:
    command:
      - /bin/sh
      - -c
      - pg_isready -U postgres -h localhost
  initialDelaySeconds: 30
  periodSeconds: 15
```

**Rules:**
- Every container must have a `readinessProbe`. Without it, pods receive traffic before they can handle it.
- Use `startupProbe` for apps that take more than 10 seconds to start. This prevents the `livenessProbe` from killing slow-starting pods.
- Never use the same endpoint for `livenessProbe` and `readinessProbe` if the liveness check includes dependency checks. A database outage should make the pod unready, not trigger a restart loop.
- Set `timeoutSeconds` to at least 2-3 seconds. Network hiccups cause false positives with 1-second timeouts.

### Step 5. Networking

Configure how traffic reaches your pods and how pods communicate.

**Service types:**

| Type | Use case | Accessibility |
|------|----------|---------------|
| ClusterIP | Internal service-to-service | Cluster-internal only |
| NodePort | Development, testing | Exposed on every node's IP at a static port (30000-32767) |
| LoadBalancer | Direct external access | Cloud provider provisions a load balancer |
| ExternalName | DNS alias to external service | Returns a CNAME record |

**Ingress with nginx:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/rate-limit-connections: "10"
    nginx.ingress.kubernetes.io/rate-limit-rps: "50"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /api/v1
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
          - path: /api/v2
            pathType: Prefix
            backend:
              service:
                name: myapp-v2
                port:
                  number: 80
```

**Ingress with Traefik:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: production
  annotations:
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.middlewares: production-rate-limit@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
```

**NetworkPolicy (deny all, then allow):**

```yaml
# Default deny all ingress and egress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
---
# Allow myapp to receive traffic from ingress controller and talk to postgres
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: myapp-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: myapp
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
          podSelector:
            matchLabels:
              app.kubernetes.io/name: ingress-nginx-controller
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:  # Allow DNS resolution
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

### Step 6. Storage

Configure persistent and ephemeral storage for stateful workloads.

**StorageClass:**

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

**PersistentVolume (manual provisioning):**

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: myapp-pv
spec:
  capacity:
    storage: 100Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: gp3
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: vol-0123456789abcdef0
```

**StatefulSet with volumeClaimTemplates:**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  serviceName: postgres
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: postgres
  template:
    metadata:
      labels:
        app.kubernetes.io/name: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16.3
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 100Mi
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp3
        resources:
          requests:
            storage: 50Gi
```

**Storage rules:**
- Use `WaitForFirstConsumer` binding mode to ensure volumes are created in the same AZ as the pod.
- Set `reclaimPolicy: Retain` on production StorageClasses so data survives PVC deletion.
- Use `emptyDir` for scratch space (caches, temp files). Set `sizeLimit` to prevent runaway disk usage.
- Always set `allowVolumeExpansion: true` -- you will need to resize volumes eventually.
- Use CSI drivers (not in-tree plugins) for all cloud providers. In-tree volume plugins are deprecated.

### Step 7. Security

Harden pods, configure RBAC, and enforce policies at the cluster level.

**ServiceAccount and RBAC:**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/myapp-role"
automountServiceAccountToken: false
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: myapp-role
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["myapp-secrets"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: myapp-binding
  namespace: production
subjects:
  - kind: ServiceAccount
    name: myapp
    namespace: production
roleRef:
  kind: Role
  name: myapp-role
  apiGroup: rbac.authorization.k8s.io
```

**SecurityContext (pod and container level):**

```yaml
spec:
  securityContext:              # Pod-level
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: myapp
      securityContext:          # Container-level
        runAsNonRoot: true
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
          # add: ["NET_BIND_SERVICE"]  # Only if binding to ports < 1024
```

**PodSecurity Standards (built-in since 1.25):**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

**Kyverno policy example (deny privileged containers):**

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: deny-privileged
      match:
        any:
          - resources:
              kinds:
                - Pod
      validate:
        message: "Privileged containers are not allowed."
        pattern:
          spec:
            containers:
              - securityContext:
                  privileged: "false"
```

**Security checklist:**
- Run as non-root. Set `runAsNonRoot: true` at pod level.
- Use read-only root filesystem. Mount writable volumes only where needed.
- Drop all capabilities, add back only what is required.
- Set `allowPrivilegeEscalation: false` on every container.
- Use dedicated ServiceAccounts per workload. Never use the `default` SA.
- Set `automountServiceAccountToken: false` unless the pod needs API access.
- Use NetworkPolicies to restrict pod-to-pod communication (see Step 5).
- Use Sealed Secrets, External Secrets Operator, or a vault integration for secret management. Never commit plain Secrets to git.

### Step 8. Helm charts

Package Kubernetes manifests into reusable, configurable Helm charts.

**Chart structure:**

```
myapp/
  Chart.yaml
  values.yaml
  values-prod.yaml
  templates/
    deployment.yaml
    service.yaml
    configmap.yaml
    ingress.yaml
    hpa.yaml
    pdb.yaml
    serviceaccount.yaml
    _helpers.tpl
    NOTES.txt
    tests/
      test-connection.yaml
```

**Chart.yaml:**

```yaml
apiVersion: v2
name: myapp
description: A Helm chart for the MyApp backend service
type: application
version: 1.2.0
appVersion: "1.4.2"
dependencies:
  - name: postgresql
    version: "15.x"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
```

**values.yaml:**

```yaml
replicaCount: 3

image:
  repository: registry.example.com/myapp
  tag: ""  # Defaults to appVersion from Chart.yaml
  pullPolicy: IfNotPresent

serviceAccount:
  create: true
  name: ""
  annotations: {}

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: myapp.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: myapp-tls
      hosts:
        - myapp.example.com

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

podDisruptionBudget:
  enabled: true
  minAvailable: 2

postgresql:
  enabled: true
```

**_helpers.tpl:**

```yaml
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "myapp.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: {{ include "myapp.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**Helm hooks (database migration before deploy):**

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "myapp.fullname" . }}-migrate
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-1"
    "helm.sh/hook-delete-policy": hook-succeeded,before-hook-creation
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          command: ["./migrate", "--up"]
```

**Helm commands:**

```bash
# Install or upgrade
helm upgrade --install myapp ./myapp -n production -f values-prod.yaml

# Dry-run to preview
helm upgrade --install myapp ./myapp -n production --dry-run --debug

# Rollback
helm rollback myapp 1 -n production

# Template rendering (no cluster needed)
helm template myapp ./myapp -f values-prod.yaml
```

### Step 9. Scaling

Configure automatic scaling for pods and clusters.

**HPA with CPU and memory:**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 3
  maxReplicas: 20
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 120
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

**HPA with custom metrics (requests per second via Prometheus):**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-rps
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
```

**KEDA (event-driven autoscaling):**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: myapp-keda
  namespace: production
spec:
  scaleTargetRef:
    name: myapp
  minReplicaCount: 1
  maxReplicaCount: 30
  pollingInterval: 15
  cooldownPeriod: 120
  triggers:
    - type: rabbitmq
      metadata:
        host: amqp://guest:guest@rabbitmq.production.svc.cluster.local:5672
        queueName: tasks
        queueLength: "50"
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc.cluster.local:9090
        metricName: http_request_duration_seconds_bucket
        query: sum(rate(http_requests_total{service="myapp"}[2m]))
        threshold: "100"
```

**Scaling rules:**
- Set `minReplicas` to at least 2 for high availability, 3 for production workloads.
- Use `behavior` to prevent flapping -- scale up quickly but scale down slowly.
- Combine HPA (horizontal) with VPA in recommendation-only mode. Running both in auto mode on the same Deployment causes conflicts.
- Use KEDA for event-driven workloads (queue depth, scheduled scaling, external metrics).
- Cluster autoscaler (or Karpenter on EKS) handles node scaling. Ensure node groups have enough headroom for burst traffic.

### Step 10. Debugging

Diagnose and resolve common Kubernetes issues.

**Essential commands:**

```bash
# Pod status and events
kubectl get pods -n production -o wide
kubectl describe pod myapp-abc123 -n production
kubectl get events -n production --sort-by=.metadata.creationTimestamp

# Logs
kubectl logs myapp-abc123 -n production
kubectl logs myapp-abc123 -n production --previous    # Crashed container logs
kubectl logs -l app.kubernetes.io/name=myapp -n production --tail=100
kubectl logs myapp-abc123 -n production -c sidecar    # Specific container

# Interactive debugging
kubectl exec -it myapp-abc123 -n production -- /bin/sh
kubectl port-forward svc/myapp 8080:80 -n production

# Ephemeral debug container (no shell in image)
kubectl debug -it myapp-abc123 -n production --image=busybox:1.36 --target=myapp

# Resource usage
kubectl top pods -n production
kubectl top nodes
```

**Common failure patterns:**

| Symptom | Likely cause | Diagnosis | Fix |
|---------|-------------|-----------|-----|
| `CrashLoopBackOff` | App crashes on startup | `kubectl logs --previous` | Fix app error, check env vars, verify image tag |
| `OOMKilled` | Memory limit exceeded | `kubectl describe pod` shows OOMKilled | Increase `limits.memory` or fix memory leak |
| `ImagePullBackOff` | Wrong image name/tag or auth failure | `kubectl describe pod` events | Fix image reference, create/attach `imagePullSecret` |
| `Pending` | No schedulable node | `kubectl describe pod` shows FailedScheduling | Check node resources, taints, affinity rules |
| `0/N nodes available` | Insufficient resources or taints | `kubectl describe nodes` | Scale cluster, adjust requests, remove taints |
| `CreateContainerConfigError` | Missing ConfigMap or Secret | `kubectl describe pod` events | Create the missing resource |
| `Evicted` | Node under disk or memory pressure | `kubectl describe node` conditions | Add resource limits, clean up node, add nodes |

**Debugging flow:**
1. `kubectl get pods` -- check STATUS column.
2. `kubectl describe pod <name>` -- read Events section bottom-up.
3. `kubectl logs <name> --previous` -- if the container restarted.
4. `kubectl exec -it <name> -- /bin/sh` -- inspect filesystem, test connectivity.
5. `kubectl get events --sort-by=.metadata.creationTimestamp` -- cluster-wide events.

### Step 11. GitOps

Deliver Kubernetes manifests through Git using ArgoCD or Flux.

**ArgoCD Application:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: production
  source:
    repoURL: https://github.com/org/k8s-manifests.git
    targetRevision: main
    path: apps/myapp/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - ServerSideApply=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

**App-of-apps pattern:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: apps-root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/k8s-manifests.git
    targetRevision: main
    path: apps
  destination:
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**ArgoCD sync waves (ordered deployment):**

```yaml
# Namespace first (wave -1)
apiVersion: v1
kind: Namespace
metadata:
  name: production
  annotations:
    argocd.argoproj.io/sync-wave: "-1"
---
# ConfigMaps and Secrets second (wave 0)
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
  annotations:
    argocd.argoproj.io/sync-wave: "0"
---
# Deployment third (wave 1)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  annotations:
    argocd.argoproj.io/sync-wave: "1"
```

**Flux Kustomization:**

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 5m
  sourceRef:
    kind: GitRepository
    name: k8s-manifests
  path: ./apps/myapp/overlays/production
  prune: true
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: myapp
      namespace: production
  timeout: 3m
  retryInterval: 1m
```

**GitOps rules:**
- The Git repository is the single source of truth. No `kubectl apply` in production.
- Use Kustomize overlays or Helm values per environment (dev/staging/prod).
- Enable `selfHeal` so manual changes in the cluster are reverted.
- Enable `prune` so deleted manifests are cleaned up.
- Use sync waves to control deployment order (namespaces before deployments, migrations before app).
- Protect the main branch with pull request reviews. A merge to main is a production deployment.

### Step 12. Production checklist

Before going live, verify these production-readiness items.

**PodDisruptionBudget:**

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp
  namespace: production
spec:
  minAvailable: 2    # Or use maxUnavailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: myapp
```

**Topology spread constraints:**

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app.kubernetes.io/name: myapp
    - maxSkew: 1
      topologyKey: kubernetes.io/hostname
      whenUnsatisfiable: ScheduleAnyway
      labelSelector:
        matchLabels:
          app.kubernetes.io/name: myapp
```

**Pod anti-affinity (spread across nodes):**

```yaml
spec:
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app.kubernetes.io/name
                  operator: In
                  values:
                    - myapp
            topologyKey: kubernetes.io/hostname
```

**Production readiness items:**

| Item | Why | How to verify |
|------|-----|---------------|
| Multiple replicas (3+) | Survive pod failures | `kubectl get deploy -n production` |
| PodDisruptionBudget | Survive node drains | `kubectl get pdb -n production` |
| Resource requests and limits | Predictable scheduling, prevent OOM | `kubectl describe pod` |
| Health probes (liveness + readiness) | Automatic recovery and traffic management | Check Deployment spec |
| Topology spread or anti-affinity | Survive zone/node failures | Check pod distribution |
| NetworkPolicy | Limit blast radius | `kubectl get networkpolicy -n production` |
| RBAC with dedicated ServiceAccount | Least-privilege access | `kubectl get sa -n production` |
| SecurityContext (non-root, read-only FS) | Container hardening | Check pod spec |
| Sealed/external secrets | No plain secrets in git | Check secret management |
| Resource quotas on namespace | Prevent resource hogging | `kubectl get resourcequota -n production` |
| Horizontal Pod Autoscaler | Handle traffic spikes | `kubectl get hpa -n production` |
| Ingress with TLS | Encrypted external traffic | `kubectl get ingress -n production` |
| Graceful shutdown (`terminationGracePeriodSeconds`) | Clean connection draining | Check Deployment spec |
| Image tag is a specific version (not `latest`) | Reproducible deployments | Check image field |

## Anti-patterns

Avoid these common mistakes:

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Using `latest` tag | Non-reproducible deployments, silent regressions | Pin images to specific semver tags or SHA digests |
| No resource limits | A single pod can consume all node resources | Set `requests` and `limits` on every container |
| Running as root | Container escape gives host-level access | `runAsNonRoot: true`, `runAsUser: 1000` |
| No health probes | Kubernetes cannot detect dead or unready pods | Add `livenessProbe` and `readinessProbe` to every container |
| Hardcoded secrets in manifests | Credentials exposed in git history | Use Sealed Secrets, External Secrets Operator, or Vault |
| Single replica in production | Any pod failure causes downtime | Set `replicas: 3` minimum, add PDB |
| No PodDisruptionBudget | Node drains take down all replicas simultaneously | Create PDB with `minAvailable` or `maxUnavailable` |
| Privileged containers | Full host access, defeats container isolation | `privileged: false`, drop all capabilities |
| Using default ServiceAccount | Overly broad API permissions shared across pods | Create dedicated SA per workload, set `automountServiceAccountToken: false` |
| No NetworkPolicy | Any pod can talk to any pod (flat network) | Default-deny, then allowlist required paths |
| No namespace isolation | All workloads in `default` namespace | Separate namespaces per team/environment |
| Deploying without readiness gates | Users hit pods that are not ready to serve | Configure readinessProbe with proper thresholds |

## Self-check

Before considering the task complete, verify all of the following:

1. [ ] Correct workload controller chosen (Deployment vs StatefulSet vs DaemonSet vs Job)
2. [ ] All containers have resource `requests` and `limits` defined
3. [ ] `livenessProbe` and `readinessProbe` configured on every container
4. [ ] `startupProbe` added for slow-starting applications
5. [ ] Images use specific version tags, never `latest`
6. [ ] Pod runs as non-root with `readOnlyRootFilesystem` and capabilities dropped
7. [ ] Dedicated ServiceAccount created with `automountServiceAccountToken: false`
8. [ ] NetworkPolicy restricts ingress and egress traffic
9. [ ] Secrets managed through Sealed Secrets, External Secrets, or Vault (not plain manifests in git)
10. [ ] PodDisruptionBudget configured with appropriate `minAvailable`
11. [ ] Topology spread or pod anti-affinity distributes pods across zones/nodes
12. [ ] HPA configured with appropriate metrics and scaling behavior
13. [ ] Ingress configured with TLS termination via cert-manager
14. [ ] Production replicas set to 3 or more
15. [ ] `terminationGracePeriodSeconds` set to allow graceful shutdown
16. [ ] Labels follow `app.kubernetes.io/*` conventions
