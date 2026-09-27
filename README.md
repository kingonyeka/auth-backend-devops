# Auth System — Backend

A production-grade authentication and verification service built with **Express + Node.js + TypeScript**, designed as a full DevOps learning project covering system design, containerization, infrastructure-as-code, CI/CD, and observability.

Paired frontend: `auth-frontend` (Next.js) — separate repository.

---

## Features

- Email/password signup with email verification
- Login with JWT access + refresh token rotation
- TOTP-based 2FA (enrollment + verification)
- OAuth (Google) via Passport.js
- Session/device tracking with revocation support
- Rate limiting on auth-sensitive endpoints
- Async email/SMS delivery via message queue (RabbitMQ locally, SQS in staging/prod)
- Structured logging, distributed tracing, and error monitoring

---

## Tech Stack

| Layer            | Tools                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Language         | TypeScript (strict mode)                                           |
| Framework        | Express.js                                                         |
| Validation       | Zod                                                                |
| Auth             | JWT, argon2, Passport.js, otplib                                   |
| Database         | PostgreSQL + Prisma                                                |
| Cache / Sessions | Redis (ioredis)                                                    |
| Messaging        | RabbitMQ (dev) / AWS SQS (staging, prod)                           |
| Email / SMS      | AWS SES, Twilio / AWS SNS                                          |
| Testing          | Jest, Supertest                                                    |
| Containers       | Docker, Docker Compose                                             |
| IaC              | Terraform                                                          |
| CI/CD            | GitHub Actions                                                     |
| Cloud            | AWS (ECS Fargate, RDS, ElastiCache, ALB, Route53, Secrets Manager) |
| Observability    | Pino, OpenTelemetry, Sentry, CloudWatch                            |

---

## Project Structure

```
src/
├── config/           # Environment and app configuration
├── modules/
│   ├── auth/         # Signup, login, OAuth
│   ├── users/        # User CRUD
│   ├── tokens/       # JWT issuance/rotation
│   └── verification/ # Email/SMS/2FA verification
├── middleware/        # Auth guard, rate limiting, error handling
├── queues/
│   ├── producers/     # Publish events (user.registered, otp.requested)
│   └── consumers/     # Worker processes handling queue events
├── lib/                # DB, Redis, mailer clients
├── types/              # Shared TS types
└── utils/              # Logger, hashing helpers

tests/
├── unit/
├── integration/
└── e2e/

terraform/
├── modules/
└── environments/{dev,staging,prod}

.github/workflows/      # CI/CD pipelines
docker/                 # Dockerfile, compose files
```

---

## Getting Started (Local Development)

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm

### 1. Clone and install

```bash
git clone <repo-url>
cd auth-backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# fill in local values — see Environment Variables section below
```

### 3. Start local infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d
```

This spins up Postgres, Redis, RabbitMQ, and Mailhog (for catching test emails locally).

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. Start the dev server

```bash
npm run dev
```

Server runs at `http://localhost:4000` by default.

---

## Environment Variables

See `.env.example` for the full list. Never commit `.env`, `.env.staging`, or `.env.prod` — they're gitignored. In staging and production, secrets are pulled from **AWS Secrets Manager** at deploy time rather than stored in plaintext files.

---

## Testing

```bash
npm run test              # unit tests
npm run test:integration  # integration tests (requires local infra running)
npm run test:e2e          # end-to-end auth flow tests
npm run test:coverage     # coverage report
```

---

## Environments

| Environment | Purpose             | Infra                                   |
| ----------- | ------------------- | --------------------------------------- |
| `dev`       | Local development   | Docker Compose only                     |
| `staging`   | Pre-prod validation | AWS (single-AZ, smaller instance sizes) |
| `prod`      | Live traffic        | AWS (Multi-AZ, autoscaling)             |

Deploys to `staging` happen automatically on merge to `develop`. Deploys to `prod` require manual approval in GitHub Actions on merge to `main`.

---

## Infrastructure

Provisioned via Terraform in `terraform/environments/<env>`. Remote state is stored in an S3 backend with DynamoDB state locking.

```bash
cd terraform/environments/staging
terraform init
terraform plan
terraform apply
```

See `docs/` (or project wiki) for the manual AWS CLI walkthrough used to understand each resource before it was automated.

---

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- `lint-test.yml` — runs on every PR (lint, typecheck, unit + integration tests)
- `build-push-ecr.yml` — builds Docker image, pushes to ECR
- `deploy-staging.yml` — auto-deploys to staging on merge to `develop`
- `deploy-prod.yml` — deploys to prod on merge to `main`, gated by manual approval

AWS authentication uses OIDC — no long-lived AWS keys are stored in GitHub Secrets.

---

## Observability

- **Logs**: structured JSON via Pino → shipped to CloudWatch Logs
- **Traces**: OpenTelemetry instrumentation across API → queue → worker
- **Errors**: Sentry (frontend + backend)
- **Metrics/Dashboards**: CloudWatch + Grafana (auth funnel: signups, verification rate, failed logins, 2FA adoption)

---

## Security

- Passwords hashed with argon2
- Refresh tokens rotated and stored in Redis with revocation support
- Rate limiting on login, signup, and verification endpoints
- Secrets stored in AWS Secrets Manager, never in source control
- Dependency scanning via `npm audit` / Snyk in CI
- Secret scanning via gitleaks in CI

---

## Roadmap / Status

- [x] Project scaffolding, folder structure, tooling
- [ ] Core auth flows (signup, login, verification)
- [ ] 2FA enrollment
- [ ] OAuth integration
- [ ] Queue-based email/SMS delivery
- [ ] Dockerize services
- [ ] Manual AWS deploy (EC2 → ECS)
- [ ] Terraform environments (dev/staging/prod)
- [ ] CI/CD pipelines
- [ ] Observability stack
- [ ] Security hardening pass

---

## License

Private — for personal/learning use.
