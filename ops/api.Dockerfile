# Imagem única para api e worker (comando muda no compose). Contexto de build: raiz do repo.
# Backend compila com tsc (sem bundle): o runtime leva node_modules de produção + dist de cada workspace.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY src/shared/package.json src/shared/
COPY src/db/package.json src/db/
COPY src/api/package.json src/api/
COPY src/web/package.json src/web/
COPY tests/package.json tests/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.base.json ./
COPY src/shared src/shared
COPY src/db src/db
COPY src/api src/api
RUN npm run -w @tw/shared build && npm run -w @tw/db build && npm run -w @tw/api build
# só dependências de produção das workspaces do backend
RUN rm -rf node_modules && \
    if [ -f package-lock.json ]; then npm ci --omit=dev -w @tw/api -w @tw/db -w @tw/shared; \
    else npm install --omit=dev -w @tw/api -w @tw/db -w @tw/shared; fi

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src/shared/package.json ./src/shared/package.json
COPY --from=build --chown=node:node /app/src/db/package.json ./src/db/package.json
COPY --from=build --chown=node:node /app/src/db/dist ./src/db/dist
COPY --from=build --chown=node:node /app/src/shared/dist ./src/shared/dist
COPY --from=build --chown=node:node /app/src/api/package.json ./src/api/package.json
COPY --from=build --chown=node:node /app/src/api/dist ./src/api/dist
USER node
WORKDIR /app/src/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
