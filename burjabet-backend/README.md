# Burja Bet Backend

High-speed Solana gambling dApp backend built with NestJS microservices architecture.

## Architecture

- **auth-service**: Wallet-based authentication with Sign-In with Solana
- **blockchain-service**: Solana blockchain interactions and event handling
- **game-engine-service**: Game loop, RNG, and betting logic
- **gateway-service**: API gateway with HTTP REST and WebSocket support

## Tech Stack

- NestJS (Microservices)
- SWC Compiler
- PostgreSQL (TypeORM)
- Redis
- Kafka
- gRPC
- Socket.io
- Solana Web3.js
- TweetNaCl

## Getting Started

1. Install dependencies:
```bash
yarn install
```

2. Set up environment variables (see `.env.example` in each service)

3. Start all services:

**Option 1 - Using Yarn (Recommended):**
```bash
yarn start:all
```

**Option 2 - Using Bash Script (Detached):**
```bash
./start-all-detached.sh
```

**Option 3 - Interactive Bash Script:**
```bash
./start-all.sh
```

4. Stop all services:
```bash
./stop-all.sh
```

Or start services individually:
```bash
yarn start:auth
yarn start:blockchain
yarn start:game-engine
yarn start:gateway
```

See [SERVICES.md](./SERVICES.md) for detailed service management guide.

## Kubernetes: assigning `.env` secrets/config

In Kubernetes, you don't use `.env` files directly inside the cluster. You convert them into:
- **ConfigMap** for non-secret values (e.g. URLs)
- **Secret** for sensitive values (e.g. JWT secrets, DB passwords)

Your deployments already load them via `envFrom`:
- `ConfigMap`: `burja-config`
- `Secret`: `burja-secrets`

### Option A (recommended): manage values in-cluster (Lens / kubectl)

Create/update these resources in the `burja` namespace:
- `ConfigMap` **`burja-config`**
- `Secret` **`burja-secrets`**

Example with kubectl (no base64 needed):

```bash
kubectl -n burja create secret generic burja-secrets \
  --from-literal=DB_PASSWORD='postgres' \
  --from-literal=JWT_SECRET='super-long-random-secret' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Restart deployments to pick up updated env vars:

```bash
kubectl -n burja rollout restart deployment
```

### Option B: edit YAML like Yarsha (`deployment/common/common-secrets.yaml`)

If you want to keep the Yarsha-style secret YAML, replace `<base64_encoded_value>` with real base64 strings, then:

```bash
kubectl apply -f deployment/namespace.yaml
kubectl apply -f deployment/common/common-config.yaml
kubectl apply -f deployment/common/common-secrets.yaml
```

