# External Secrets (cloud / AWS EKS secret delivery)

Implements the cloud secret-delivery path from spec `08-enterprise-deployment` §8.6 and
`05-security-compliance` §5.2: the **External Secrets Operator (ESO)** syncs **AWS Secrets Manager**
secrets into native Kubernetes `Secret` objects named `cos-<service>-secrets`, which each Helm chart
consumes via `envFrom.secretRef`. Architecture decision 2026-06-29: **Direction A — ESO + AWS SM**.

`sealed-secrets/` is the complementary **git-committed / on-premise** path and produces the same
`cos-<service>-secrets` names. Apply **one** path per cluster (cloud → ESO; on-prem → sealed-secrets);
do not apply both, or they will both try to own the same Secret.

## Files

- `external-secrets-serviceaccount.yaml` — `external-secrets` namespace + `external-secrets-sa`
  ServiceAccount (IRSA annotation — set the role ARN at deploy time).
- `cos-external-secrets.yml` — `ClusterSecretStore` (AWS SM, region `ap-southeast-7`) + one
  `ExternalSecret` per service producing `cos-<service>-secrets`.

## Prerequisites (do before deploy)

### 1. Install the External Secrets Operator

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace
```

### 2. Create the IAM role (IRSA) and bind it to the ServiceAccount

The role's trust policy must allow the `external-secrets/external-secrets-sa` ServiceAccount (OIDC),
and its permissions policy must allow read on `cos/production/*`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:ap-southeast-7:*:secret:cos/production/*"
    }
  ]
}
```

Then set the role ARN in `external-secrets-serviceaccount.yaml`
(`eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/cos-external-secrets`).

### 3. Populate the AWS Secrets Manager secrets

Create one plaintext secret per key under the `cos/production/` prefix (region `ap-southeast-7`),
matching the `remoteRef.key` entries in `cos-external-secrets.yml`. The same prefix/keys are used by
the DR runbook (`docs/runbooks/disaster-recovery/region-failure.md`).

Required keys — each is one AWS SM secret named `cos/production/<KEY>`, grouped by target Secret:

- `cos-backend-secrets`: `DATABASE_URL` (role `cos`), `APP_DATABASE_URL` (role `app_user`),
  `DIRECT_DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `KEYCLOAK_CLIENT_SECRET`, `KAFKA_BROKERS`
- `cos-file-service-secrets`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`,
  `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- `cos-ai-gateway-secrets`: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- `cos-analytics-worker-secrets`: `CLICKHOUSE_URL`, `CLICKHOUSE_PASSWORD`
- `cos-kg-ingestion-worker-secrets`: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `KG_ADMIN_TOKEN`
- `cos-web-secrets`: `NEXTAUTH_SECRET`, `KEYCLOAK_WEB_CLIENT_SECRET`

> `cos-ai-embedding-worker` and `cos-ai-ocr-pipeline` read no secrets today; their chart `envFrom` is
> marked `optional: true`, so no ExternalSecret is required until they need credentials.

### 4. Apply the manifests

```bash
kubectl apply -f external-secrets-serviceaccount.yaml
kubectl apply -f cos-external-secrets.yml
kubectl get externalsecret -n cos   # STATUS should become SecretSynced
```
