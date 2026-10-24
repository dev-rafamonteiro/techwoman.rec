# Imagem única para api e worker (comando muda no compose). Contexto de build: raiz do repo.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY src/shared/package.json src/shared/
COPY src/db/package.json src/db/
COPY src/api/package.json src/api/
COPY src/web/package.json src/web/
COPY tests/package.json tests/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM deps AS build
COPY tsconfig.base.json ./
COPY src/shared src/shared
COPY src/db src/db
COPY src/api src/api
RUN npm run -w @tw/shared build && npm run -w @tw/db build --if-present && npm run -w @tw/api build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# api/worker são empacotados (esbuild) em dist/{server,worker,health}.js
COPY --from=build --chown=node:node /app/src/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
