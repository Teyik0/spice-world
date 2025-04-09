FROM oven/bun:latest

WORKDIR /app

COPY package.json ../bun.lock ./

RUN bun install

COPY . .

RUN bun run prisma generate && bun run build

FROM oven/bun:latest

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/dist /app/dist

EXPOSE 3000/tcp

CMD ["bun", "run", "start"]
