# Builder stage
FROM node:20-alpine AS builder

ARG SERVICE_DIR=services/blockchain-service

WORKDIR /app

# Copy service-specific package.json
COPY ${SERVICE_DIR}/package*.json ./
RUN yarn install

# Copy service source files
COPY ${SERVICE_DIR}/src ./src
COPY ${SERVICE_DIR}/nest-cli.json ./
COPY ${SERVICE_DIR}/tsconfig*.json ./
COPY ${SERVICE_DIR}/.swcrc ./

# Copy shared directory (proto/types shared across services)
COPY shared ./shared
COPY tsconfig.json ./

RUN yarn build

# Runtime stage
FROM node:20-alpine

ARG SERVICE_DIR=services/blockchain-service

WORKDIR /app

COPY ${SERVICE_DIR}/package*.json ./
RUN yarn install --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared

EXPOSE 3002

CMD ["node", "dist/main.js"]


