# Single-service deploy: Node server serves the built client and the WebSocket endpoint.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app /app
EXPOSE 8787
CMD ["npx", "tsx", "server/src/index.ts"]
