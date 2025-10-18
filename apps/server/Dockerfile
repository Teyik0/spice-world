FROM oven/bun:latest AS build

WORKDIR /ws

COPY ./package.json ./bunfig.toml ./bun.lock ./
COPY ./apps/server/package.json ./apps/server/package.json

RUN bun install

COPY ./apps/server/src ./apps/server/src
COPY ./apps/server/prisma ./apps/server/prisma

WORKDIR /ws/apps/server

ENV NODE_ENV=production

RUN bun run prisma generate && bun run build

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=builder /app/dist /app/dist

ENV NODE_ENV=production

CMD ["bun", "run", "start"]

EXPOSE 3000
