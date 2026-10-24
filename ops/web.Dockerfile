# Nginx com o build do front. Contexto de build: raiz do repo.
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
COPY src/web src/web
RUN npm run -w @tw/shared build && npm run -w @tw/web build

FROM nginx:alpine AS runtime
COPY ops/nginx.conf /etc/nginx/nginx.conf
COPY ops/web-entrypoint.sh /docker-entrypoint-web.sh
COPY --from=build /app/src/web/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint-web.sh
USER nginx
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint-web.sh"]
CMD ["nginx", "-g", "daemon off;"]
