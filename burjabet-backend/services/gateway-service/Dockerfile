# Builder stage
FROM node:20-alpine AS builder

ARG SERVICE_DIR=services/gateway-service

WORKDIR /app

# Copy service-specific package.json
COPY ${SERVICE_DIR}/package*.json ./
RUN yarn install

# Copy service source files
COPY ${SERVICE_DIR}/src ./src
COPY ${SERVICE_DIR}/nest-cli.json ./
COPY ${SERVICE_DIR}/tsconfig*.json ./
COPY ${SERVICE_DIR}/.swcrc ./
# Copy shared directory
COPY shared ./shared
# Copy root tsconfig if needed
COPY tsconfig.json ./

RUN yarn build

# Runtime stage
FROM node:20-alpine

ARG SERVICE_DIR=services/gateway-service

WORKDIR /app

# Copy service-specific package.json
COPY ${SERVICE_DIR}/package*.json ./
RUN yarn install --production

COPY --from=builder /app/dist ./dist
# Copy proto files to dist so they're available at runtime
COPY --from=builder /app/src/common/proto ./dist/common/proto

EXPOSE 3004

CMD ["node", "dist/main.js"]
