FROM oven/bun:latest AS builder

WORKDIR /ws

COPY ./package.json ./bunfig.toml ./bun.lock ./tsconfig.base.json ./tsconfig.json ./
COPY ./patches ./patches

COPY ./apps/server/package.json ./apps/server/package.json
COPY ./apps/server/tsconfig.json ./apps/server/tsconfig.json

COPY ./packages/emails/package.json ./packages/emails/package.json
COPY ./packages/emails/tsconfig.json ./packages/emails/tsconfig.json

COPY ./apps/web/package.json ./apps/web/package.json
COPY ./apps/web/tsconfig.json ./apps/web/tsconfig.json


RUN bun install --frozen-lockfile --ignore-scripts

COPY ./apps/server/src ./apps/server/src
COPY ./apps/server/drizzle ./apps/server/drizzle
COPY ./packages/emails/src ./packages/emails/src

WORKDIR /ws/apps/server

ENV NODE_ENV=production

RUN bun run build

FROM gcr.io/distroless/cc-debian12

WORKDIR /app

COPY --from=builder /ws/apps/server/dist/server /app/server

ENV NODE_PATH=/app/node_modules
ENV PORT=3001

CMD ["/app/server"]

EXPOSE 3001
