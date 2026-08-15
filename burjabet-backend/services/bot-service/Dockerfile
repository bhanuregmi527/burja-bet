# Builder stage
FROM node:20-alpine AS builder

ARG SERVICE_DIR=services/bot-service

WORKDIR /app

COPY ${SERVICE_DIR}/package*.json ./
RUN yarn install

COPY ${SERVICE_DIR}/src ./src
COPY ${SERVICE_DIR}/nest-cli.json ./
COPY ${SERVICE_DIR}/tsconfig*.json ./
COPY ${SERVICE_DIR}/.swcrc ./
COPY ${SERVICE_DIR}/scripts ./scripts

COPY shared ./shared
COPY tsconfig.json ./

RUN yarn build

# Runtime stage
FROM node:20-alpine

ARG SERVICE_DIR=services/bot-service

WORKDIR /app

COPY ${SERVICE_DIR}/package*.json ./
RUN yarn install --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared

CMD ["node", "dist/main.js"]


