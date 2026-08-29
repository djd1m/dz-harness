---
name: "terraform"
description: "Designs and reviews Terraform/OpenTofu IaC — modules, state management, provider config, security, and drift detection."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# terraform

Design, review, and harden Terraform/OpenTofu infrastructure-as-code. Covers the full lifecycle from project scaffolding through module design, state management, security scanning, CI/CD integration, and drift detection. Produces production-grade IaC that follows HashiCorp and community best practices.

## When to use

- User wants to create a new Terraform project or module from scratch
- User asks to review existing Terraform code for best practices
- User needs help with state management (remote backends, locking, migration)
- User wants to set up CI/CD for Terraform (plan on PR, apply on merge)
- User asks about drift detection or state reconciliation
- User needs to import existing infrastructure into Terraform
- User wants to compare Terraform vs OpenTofu vs Pulumi vs CloudFormation
- User asks about multi-environment (dev/staging/prod) project structure
- User needs help with provider configuration or multi-region setups
- User asks about Terraform security scanning (tfsec, checkov, sentinel)

## When NOT to use

- User wants to write application code that runs on the infrastructure (that is general development)
- User wants to configure Kubernetes manifests or Helm charts (use a Kubernetes-specific skill)
- User wants to write Ansible playbooks or Chef recipes (configuration management, not IaC provisioning)
- User wants to debug a CI pipeline failure unrelated to Terraform (use `ci-fix`)
- User wants a security audit of application code (use `security-audit`)
- User wants to set up monitoring/alerting dashboards (that is observability work)

## Procedure

### Step 1. Choose runtime

Determine the right IaC tool for the user's context. Do not assume Terraform is always the answer.

| Criterion | Terraform | OpenTofu | Pulumi | CloudFormation |
|-----------|-----------|----------|--------|----------------|
| License | BSL 1.1 (post-1.5.6) | MPL 2.0 (open source) | Apache 2.0 | AWS proprietary |
| Language | HCL | HCL (compatible) | Python/TS/Go/C# | JSON/YAML |
| Multi-cloud | Yes | Yes | Yes | AWS only |
| State mgmt | Terraform Cloud or self-managed | Self-managed or third-party | Pulumi Cloud or self-managed | Built-in (CloudFormation stacks) |
| Module registry | registry.terraform.io | OpenTofu registry + TF-compatible | Pulumi Registry | AWS CloudFormation Registry |
| Community | Largest | Growing (TF-compatible) | Strong in general-purpose lang ecosystems | AWS-native shops |
| Best for | Multi-cloud, mature ecosystem | Open-source-first teams | Teams preferring real programming languages | AWS-only, deep AWS integration |

**Decision rule:** If the user has no strong preference and targets multiple clouds, recommend Terraform or OpenTofu. If they are AWS-only and already invested in AWS tooling, CloudFormation is acceptable. If the team prefers TypeScript/Python over HCL, consider Pulumi.

For the rest of this procedure, examples use Terraform/OpenTofu HCL syntax. The principles (state management, module design, CI/CD) apply universally.

### Step 2. Project structure

Establish a clean directory layout before writing any resources. A well-organized project prevents environment drift and makes code reviewable.

```
project-root/
  environments/
    dev/
      main.tf
      terraform.tfvars
      backend.tf
    staging/
      main.tf
      terraform.tfvars
      backend.tf
    prod/
      main.tf
      terraform.tfvars
      backend.tf
  modules/
    networking/
      main.tf
      variables.tf
      outputs.tf
      README.md
    compute/
      main.tf
      variables.tf
      outputs.tf
      README.md
  providers.tf
  variables.tf
  outputs.tf
  versions.tf
  .terraform.lock.hcl    # committed to git
  .gitignore
```

**Rules:**
- Each environment directory has its own `backend.tf` pointing to a separate state file.
- Shared logic lives in `modules/`. Environments call modules with environment-specific variables.
- Commit `.terraform.lock.hcl` to version control. It pins provider versions across the team.
- The `.gitignore` must exclude `.terraform/`, `*.tfstate`, `*.tfstate.backup`, `*.tfvars` containing secrets, and `crash.log`.

### Step 3. State management

Remote state is mandatory for any team project. Local state files are only acceptable for throwaway experiments.

**Backend configuration example (S3 + DynamoDB):**

```hcl
# environments/prod/backend.tf
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "prod/infrastructure.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    # Use a dedicated IAM role for state access
    # role_arn     = "arn:aws:iam::123456789012:role/TerraformStateAccess"
  }
}
```

**State locking:** Always enable locking. S3 backend uses DynamoDB. GCS uses built-in locking. Azure Blob uses blob leases. Without locking, concurrent `terraform apply` runs corrupt state.

**State encryption:** Enable `encrypt = true` for S3. Use customer-managed KMS keys for regulated workloads. GCS encrypts at rest by default but supports CMEK.

**State separation:** One state file per environment per logical boundary. Never share a single state file across dev and prod. Consider separate state files for networking vs compute vs data layers within the same environment if the infrastructure is large.

**State access control:** Restrict who can read/write state. State files contain sensitive outputs (database passwords, API keys). Use IAM policies to limit access to the state bucket.

### Step 4. Provider config

Pin provider versions to avoid breaking changes from upstream releases.

```hcl
# versions.tf
terraform {
  required_version = ">= 1.5.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# providers.tf
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = var.project_name
    }
  }
}

# Multi-region with provider alias
provider "aws" {
  alias  = "us_west"
  region = "us-west-2"

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = var.project_name
    }
  }
}
```

**Version constraint operators:**
- `~> 5.0` allows `5.x` but not `6.0` (pessimistic constraint, recommended for most providers)
- `>= 5.0, < 6.0` explicit range, equivalent to `~> 5.0`
- `= 5.31.0` exact pin (use only when a specific version is required for compatibility)
- Never leave provider versions unconstrained. A `terraform init` on Monday and Friday can pull different versions and break your infrastructure.

### Step 5. Module design

Modules are the unit of reuse. A good module is self-contained, documented, and versioned.

**Complete module example -- AWS VPC + EC2:**

```hcl
# modules/networking/variables.tf
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "Must be a valid CIDR block."
  }
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of AZs to deploy subnets into"
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for public subnets (one per AZ)"
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for private subnets (one per AZ)"
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# modules/networking/main.tf
locals {
  common_tags = {
    Module      = "networking"
    Environment = var.environment
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${var.environment}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-igw"
  })
}

resource "aws_subnet" "public" {
  for_each = zipmap(var.availability_zones, var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value
  availability_zone       = each.key
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${var.environment}-public-${each.key}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  for_each = zipmap(var.availability_zones, var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value
  availability_zone = each.key

  tags = merge(local.common_tags, {
    Name = "${var.environment}-private-${each.key}"
    Tier = "private"
  })
}

resource "aws_nat_gateway" "main" {
  for_each = aws_subnet.public

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = each.value.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-nat-${each.key}"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_eip" "nat" {
  for_each = aws_subnet.public
  domain   = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-eip-${each.key}"
  })
}

# modules/networking/outputs.tf
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "ID of the created VPC"
}

output "public_subnet_ids" {
  value       = [for s in aws_subnet.public : s.id]
  description = "IDs of public subnets"
}

output "private_subnet_ids" {
  value       = [for s in aws_subnet.private : s.id]
  description = "IDs of private subnets"
}

output "nat_gateway_ips" {
  value       = [for eip in aws_eip.nat : eip.public_ip]
  description = "Public IPs of NAT gateways"
}
```

**EC2 instance using the networking module:**

```hcl
# modules/compute/main.tf
variable "vpc_id" {
  type        = string
  description = "VPC ID to deploy into"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for instance placement"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type"
  default     = "t3.micro"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "instance" {
  name_prefix = "${var.environment}-instance-"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-instance-sg"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "main" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_ids[0]
  vpc_security_group_ids = [aws_security_group.instance.id]

  metadata_options {
    http_tokens   = "required"  # IMDSv2 only
    http_endpoint = "enabled"
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
  }

  tags = {
    Name        = "${var.environment}-instance"
    Environment = var.environment
  }
}

output "instance_id" {
  value       = aws_instance.main.id
  description = "ID of the EC2 instance"
}
```

**Module composition in environment:**

```hcl
# environments/prod/main.tf
module "networking" {
  source = "../../modules/networking"

  vpc_cidr           = "10.0.0.0/16"
  environment        = "prod"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

module "compute" {
  source = "../../modules/compute"

  vpc_id        = module.networking.vpc_id
  subnet_ids    = module.networking.private_subnet_ids
  instance_type = "t3.large"
  environment   = "prod"
}
```

**Module versioning:** When publishing modules to a registry, use semantic versioning. In source references, pin to a version tag: `source = "git::https://github.com/org/terraform-aws-vpc.git?ref=v2.1.0"`. Never point to `main` or `HEAD` in production.

### Step 6. Resource patterns

Use the right looping and lifecycle constructs for each situation.

**`for_each` vs `count`:**
- Use `for_each` when each instance has a meaningful key (subnets by AZ, users by email). Removing an item from the middle does not force re-creation of other items.
- Use `count` only for simple on/off toggles (`count = var.enable_monitoring ? 1 : 0`). Avoid `count` for lists because removing index 2 shifts indices 3, 4, 5 and forces re-creation.

**Dynamic blocks:**

```hcl
resource "aws_security_group" "example" {
  name_prefix = "example-"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
      description = ingress.value.description
    }
  }
}
```

**Lifecycle rules:**
- `prevent_destroy = true` on databases, S3 buckets with data, and any resource where accidental deletion is catastrophic.
- `ignore_changes` for attributes managed outside Terraform (e.g., ASG desired count managed by autoscaling policies).
- `create_before_destroy = true` for zero-downtime replacements (security groups, launch templates).

**Conditional resources:**

```hcl
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.environment}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
}
```

### Step 7. Security

Security is not optional. Every Terraform project must address these concerns.

**No hardcoded secrets.** Never put AWS keys, database passwords, API tokens, or any credential in `.tf` files or `.tfvars` committed to git. Use:
- Environment variables (`TF_VAR_db_password`)
- AWS Secrets Manager / HashiCorp Vault data sources
- Terraform Cloud/Enterprise workspace variables marked as sensitive

**Sensitive variables:**

```hcl
variable "db_password" {
  type        = string
  sensitive   = true
  description = "Database master password"
}
```

**Data encryption:** Enable encryption at rest for all storage resources (S3 buckets, EBS volumes, RDS instances, DynamoDB tables). Enable encryption in transit (TLS) for all endpoints.

**IAM least privilege:** Terraform itself needs broad permissions to create resources, but the resources it creates should follow least privilege. Use `aws_iam_policy_document` data sources to build precise IAM policies.

**tfsec/checkov scanning example:**

```bash
# tfsec -- static analysis for Terraform
tfsec .
tfsec . --format json --out tfsec-results.json

# checkov -- policy-as-code for Terraform
checkov -d . --framework terraform
checkov -d . --output json > checkov-results.json

# trivy -- can also scan Terraform
trivy config .
```

**Common tfsec findings to address:**
- `aws-ec2-no-public-ingress-sgr` -- security group allows 0.0.0.0/0 ingress
- `aws-s3-enable-bucket-encryption` -- S3 bucket without encryption
- `aws-ec2-enforce-http-token-imds` -- EC2 instance not requiring IMDSv2
- `aws-rds-encrypt-instance-storage` -- RDS instance without encryption

### Step 8. Networking

Common cloud networking patterns in Terraform.

**AWS VPC pattern:** See the complete module example in Step 5. Key points:
- Public subnets get an Internet Gateway route. Private subnets get a NAT Gateway route.
- Deploy across at least 2 AZs for high availability.
- Use separate subnets for different tiers (public, private, data).

**Security group rules:**
- Default deny all inbound. Explicitly allow only required ports.
- Use `cidr_blocks` for known IP ranges, `security_groups` for service-to-service communication.
- Use `description` on every rule for auditability.

**Load balancer pattern:**

```hcl
resource "aws_lb" "main" {
  name               = "${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.networking.public_subnet_ids

  enable_deletion_protection = var.environment == "prod" ? true : false

  tags = {
    Environment = var.environment
  }
}
```

**DNS with Route53:**

```hcl
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.environment}.example.com"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
```

### Step 9. CI/CD

Automate Terraform workflows. Never run `terraform apply` manually from a developer laptop in production.

**GitHub Actions CI/CD workflow:**

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  pull_request:
    paths:
      - 'environments/**'
      - 'modules/**'
      - '*.tf'
  push:
    branches: [main]
    paths:
      - 'environments/**'
      - 'modules/**'
      - '*.tf'

permissions:
  contents: read
  pull-requests: write
  id-token: write  # For OIDC auth

env:
  TF_VERSION: "1.7.0"
  TF_IN_AUTOMATION: "true"

jobs:
  plan:
    name: Terraform Plan
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    strategy:
      matrix:
        environment: [dev, staging, prod]
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Terraform Init
        working-directory: environments/${{ matrix.environment }}
        run: terraform init -input=false

      - name: Terraform Validate
        working-directory: environments/${{ matrix.environment }}
        run: terraform validate

      - name: Terraform Plan
        working-directory: environments/${{ matrix.environment }}
        run: terraform plan -input=false -no-color -out=tfplan
        continue-on-error: true

      - name: Post plan to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const output = `#### Terraform Plan - ${{ matrix.environment }}
            \`\`\`
            ${fs.readFileSync('environments/${{ matrix.environment }}/tfplan.txt', 'utf8').substring(0, 65000)}
            \`\`\``;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            });

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: tfsec
        uses: aquasecurity/tfsec-action@v1.0.3
        with:
          soft_fail: false

      - name: checkov
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: .
          framework: terraform
          soft_fail: false

  cost:
    name: Cost Estimation
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Infracost
        uses: infracost/actions/setup@v3
        with:
          api-key: ${{ secrets.INFRACOST_API_KEY }}

      - name: Generate cost diff
        run: |
          infracost diff --path=. \
            --format=json \
            --out-file=/tmp/infracost.json

      - name: Post cost comment
        run: |
          infracost comment github \
            --path=/tmp/infracost.json \
            --repo=${{ github.repository }} \
            --pull-request=${{ github.event.pull_request.number }} \
            --github-token=${{ secrets.GITHUB_TOKEN }}

  apply:
    name: Terraform Apply
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production
    # No `needs:` on plan/security: those jobs run only on pull_request events
    # (see their `if:` guards above), so they are always skipped on a push to
    # main. A job that `needs` skipped jobs is itself skipped unless it uses
    # always()/!cancelled() — which would defeat the gate. Plan and security are
    # the required checks on the PR that gates the merge; the production
    # Environment protection rule below is the apply-time gate.
    strategy:
      max-parallel: 1
      matrix:
        environment: [dev, staging, prod]
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Terraform Init
        working-directory: environments/${{ matrix.environment }}
        run: terraform init -input=false

      - name: Terraform Apply
        working-directory: environments/${{ matrix.environment }}
        run: terraform apply -input=false -auto-approve
```

**Key CI/CD rules:**
- Plan on every PR. Developers see what will change before merge.
- Apply only on merge to main, never on PR events.
- Use OIDC for AWS authentication, not long-lived access keys.
- Run security scans (tfsec, checkov) as a required check.
- Run cost estimation (Infracost) to catch expensive changes.
- Apply environments sequentially (dev, staging, prod) with `max-parallel: 1`.
- Use GitHub Environments with protection rules for prod apply.

### Step 10. Import and migration

Bring existing infrastructure under Terraform management without downtime.

**`terraform import` (legacy, pre-1.5):**

```bash
terraform import aws_instance.main i-1234567890abcdef0
terraform import 'aws_subnet.public["us-east-1a"]' subnet-0123456789abcdef0
```

**Import blocks (Terraform 1.5+, recommended):**

```hcl
import {
  to = aws_instance.main
  id = "i-1234567890abcdef0"
}

import {
  to = aws_s3_bucket.logs
  id = "mycompany-access-logs"
}
```

Run `terraform plan` after adding import blocks. Terraform generates the config. Review it, adjust to match desired state, then apply.

**Moved blocks (refactoring without destroy/create):**

```hcl
# Renamed a resource
moved {
  from = aws_instance.web
  to   = aws_instance.main
}

# Moved into a module
moved {
  from = aws_vpc.main
  to   = module.networking.aws_vpc.main
}
```

**State manipulation (use sparingly):**

```bash
# Move a resource in state (when moved blocks are insufficient)
terraform state mv aws_instance.old aws_instance.new

# Remove from state without destroying (resource continues to exist in cloud)
terraform state rm aws_instance.orphan

# List resources in state
terraform state list

# Show a specific resource's state
terraform state show aws_instance.main
```

**Migration rules:**
- Always take a state backup before any state manipulation: `terraform state pull > backup.tfstate`
- Use `moved` blocks over `terraform state mv` when possible -- they are declarative and reviewable in PRs.
- Import one resource at a time and verify with `terraform plan` showing no changes before importing the next.
- Never import into a state file that has pending changes. Apply or discard first.

### Step 11. Testing

Validate Terraform code at multiple levels.

**Level 1 -- Static validation:**

```bash
# Built-in validation
terraform validate
terraform fmt -check -recursive

# Linting with tflint
tflint --init
tflint --recursive
```

**Level 2 -- Plan assertions:**

```bash
# Save plan as JSON for programmatic checks
terraform plan -out=tfplan
terraform show -json tfplan > plan.json

# Use jq or a script to assert plan contents
jq '.resource_changes[] | select(.change.actions | contains(["delete"]))' plan.json
```

**Level 3 -- Integration tests with Terratest:**

```go
// test/vpc_test.go
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
)

func TestVpcModule(t *testing.T) {
    t.Parallel()

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../modules/networking",
        Vars: map[string]interface{}{
            "environment": "test",
            "vpc_cidr":    "10.99.0.0/16",
        },
    })

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    vpcId := terraform.Output(t, terraformOptions, "vpc_id")
    assert.NotEmpty(t, vpcId)

    publicSubnetIds := terraform.OutputList(t, terraformOptions, "public_subnet_ids")
    assert.Equal(t, 3, len(publicSubnetIds))
}
```

**Level 4 -- Policy-as-code with Sentinel (Terraform Cloud/Enterprise):**

```python
# sentinel/restrict-instance-types.sentinel
import "tfplan/v2" as tfplan

allowed_types = ["t3.micro", "t3.small", "t3.medium", "t3.large"]

main = rule {
    all tfplan.resource_changes as _, rc {
        rc.type is "aws_instance" implies
        rc.change.after.instance_type in allowed_types
    }
}
```

**Testing rules:**
- `terraform validate` and `terraform fmt -check` run on every PR. They are fast and catch syntax errors.
- tflint catches provider-specific issues (invalid instance types, deprecated arguments).
- Terratest runs in a dedicated AWS account (never prod). Use `t.Parallel()` and `defer terraform.Destroy()`.
- Sentinel policies enforce organizational guardrails (no public S3, no oversized instances).

### Step 12. Drift detection

Infrastructure drifts when someone makes changes outside Terraform (console clicks, CLI commands, other tools).

**Scheduled drift detection:**

```yaml
# .github/workflows/drift-detection.yml
name: Drift Detection

on:
  schedule:
    - cron: '0 8 * * 1-5'  # Weekdays at 8am UTC
  workflow_dispatch: {}

jobs:
  detect:
    name: Detect Drift
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [dev, staging, prod]
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.7.0"

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Terraform Init
        working-directory: environments/${{ matrix.environment }}
        run: terraform init -input=false

      - name: Detect drift
        id: drift
        working-directory: environments/${{ matrix.environment }}
        run: |
          terraform plan -input=false -detailed-exitcode -no-color > plan.txt 2>&1 || echo "exit_code=$?" >> "$GITHUB_OUTPUT"

      - name: Alert on drift
        if: steps.drift.outputs.exit_code == '2'
        uses: slackapi/slack-github-action@v1.25.0
        with:
          payload: |
            {
              "text": "Drift detected in ${{ matrix.environment }}! Review the Terraform plan.",
              "channel": "#infra-alerts"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

**`-detailed-exitcode` values:**
- `0` -- No changes (no drift)
- `1` -- Error in plan
- `2` -- Changes detected (drift exists)

**Reconciliation process:**
1. Review the drift plan output to understand what changed.
2. Decide: should Terraform overwrite the manual change, or should the Terraform code be updated to match reality?
3. If the manual change was intentional, update the `.tf` files and commit.
4. If the manual change was accidental, run `terraform apply` to restore desired state.
5. Add `ignore_changes` for attributes legitimately managed outside Terraform (e.g., ASG desired count).

## Anti-patterns

Avoid these common mistakes:

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Hardcoded values | Cannot reuse across environments | Use variables and `.tfvars` files |
| No remote state | Team members overwrite each other's changes | Configure S3/GCS/Azure Blob backend |
| No state locking | Concurrent applies corrupt state | Enable DynamoDB/GCS/blob lease locking |
| `terraform apply` without plan | Unexpected changes go to production unreviewed | Always plan first, review, then apply |
| No module versioning | Module changes break all consumers at once | Tag module releases, pin versions in consumers |
| Monolithic configs | One 3000-line `main.tf` is unreadable and slow | Split into modules by logical boundary |
| Using `count` for lists | Removing item N re-creates items N+1 through end | Use `for_each` with meaningful keys |
| Secrets in `.tfvars` committed to git | Credentials exposed in version history | Use env vars, Vault, or Secrets Manager |
| No `.terraform.lock.hcl` in git | Different team members get different provider versions | Commit the lock file |
| No tagging strategy | Cannot track costs or ownership | Use `default_tags` in provider block |
| Wildcard provider versions | Provider updates break infrastructure silently | Pin with `~>` constraints |
| Manual state surgery | Fragile, error-prone, no audit trail | Use `moved` blocks and `import` blocks |

## Self-check

Before considering the task complete, verify all of the following:

1. [ ] Remote backend is configured with encryption and locking enabled
2. [ ] Provider versions are pinned using `~>` or explicit ranges
3. [ ] `.terraform.lock.hcl` is committed to version control
4. [ ] No secrets or credentials appear in `.tf` or committed `.tfvars` files
5. [ ] All variables have `type`, `description`, and `validation` where appropriate
6. [ ] Modules use `for_each` instead of `count` for collections
7. [ ] `prevent_destroy` is set on critical stateful resources (databases, storage)
8. [ ] Security groups follow default-deny with explicit allow rules
9. [ ] All storage resources have encryption at rest enabled
10. [ ] EC2 instances enforce IMDSv2 (`http_tokens = "required"`)
11. [ ] CI pipeline runs `terraform plan` on PRs and `apply` only on merge to main
12. [ ] Security scanning (tfsec or checkov) runs as a required PR check
13. [ ] Drift detection is scheduled and alerts on detected changes
14. [ ] `.gitignore` excludes `.terraform/`, `*.tfstate`, `*.tfstate.backup`, and `crash.log`
