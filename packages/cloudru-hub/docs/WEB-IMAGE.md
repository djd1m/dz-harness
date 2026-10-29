# Existing-cluster web-image profile

This profile applies a reviewed image to an existing Cloud.ru Kubernetes cluster. It does not create a cluster, build an image or prove source-to-image provenance. The `snake` profile remains the default and keeps its previous exact manifest contract.

## From authored code or a repository

1. For a repository, record its URL and immutable commit SHA. For authored code, record the exact source tree or release artifact used by the build.
2. Build and publish the image in your trusted CI. Record the resulting registry digest, not a mutable tag. Confirm that the target cluster can pull it. This package does not run an untrusted Dockerfile or store registry credentials.
3. Prepare a two-document YAML manifest with the image digest. Use a dedicated namespace that already exists, and ensure the app answers `GET /health` on port 8080 as UID 10001 with a read-only root filesystem. Example shape:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: {name: lesson-web, namespace: lesson-app}
spec:
  replicas: 1
  selector: {matchLabels: {app: lesson-web}}
  template:
    metadata: {labels: {app: lesson-web}}
    spec:
      automountServiceAccountToken: false
      securityContext: {runAsNonRoot: true}
      containers:
        - name: lesson-web
          image: registry.example.com/lesson-web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
          ports: [{containerPort: 8080}]
          readinessProbe: {httpGet: {path: /health, port: 8080}}
          resources:
            requests: {cpu: 50m, memory: 64Mi}
            limits: {cpu: 200m, memory: 256Mi}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsUser: 10001
            runAsGroup: 10001
            capabilities: {drop: [ALL]}
---
apiVersion: v1
kind: Service
metadata: {name: lesson-web, namespace: lesson-app}
spec:
  type: ClusterIP
  selector: {app: lesson-web}
  ports: [{port: 80, targetPort: 8080}]
```

The registry and digest above are placeholders. Replace them with a real, pullable digest before approval. The exact byte sequence of the final manifest is what the approval binds.

4. Compute `sha256sum web.yaml`, review the file and its resource footprint, then run:

```bash
cloudru-hub k8s-approve --cluster-id <uuid> --namespace lesson-app --manifest web.yaml --manifest-sha256 <sha256> --profile web-image
```

5. The agent calls `k8s_apply` with only the returned `approval_id`. The proxy forwards the approved manifest with `create_only=true`. Use the bounded `k8s_kubectl` queries for pods, deployment, service and rollout. An API success is not evidence of a healthy application; inspect the rollout and workload health.

Kubernetes creation across the two documents is not transactional. If one resource is created and the next fails, inspect the exact named resources before cleanup or another attempt. The profile exposes only a ClusterIP; a public endpoint requires a separate, reviewed ingress decision. Cluster and worker charges are outside this approval.
