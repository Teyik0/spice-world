# Project

Spice World is a full-stack e-commerce platform. 
Key features: product management, categories with dynamic attributes, user authentication, order processing.

## Structure

**apps/server** (port 3000): Elysia API with Prisma, Better Auth, Polar
  - `/src/routes`: API endpoints
  - `/src/modules`: Business logic (products, categories, orders)
  - `/prisma/schema.prisma`: Database models

**apps/web** (port 5173): React/Next.js admin dashboard
  - Uses Eden Treaty for type-safe API calls
  - TanStack Form for form management
  - shadcn/ui components

**packages/emails**: React Email templates

# Relevant code sample

using @elysiajs/eden in the frontend to fetch data from the elysia backend
```ts
api.<route>(<params>).<method>(<body>)
// example:
const { data, status, error } = await api.attributes({ id: testAttr.id }).get();
const { data, status, error } = await api.attributes.post(newAttrData);
```

# Code rules

- Bun-first: Always use Bun, not npm/node/pnpm
- Type safety: Reuse backend models in frontend. No type duplication
- Strictly follow atomicity principle: one transaction = many change. E.g. creating a product with attributes and category in one API call. Revert all if any part fails
- Always check and ensure when coding that you follow API documentation related to the library you are using with context7
- Always check for type error in your new code: bun run tsc <file_path> --noEmit

# Key Patterns

## Environment Setup
Required env vars are in `.env.example` for each app

## Authentication
Better Auth provides `user`, `isLogin`, `isAdmin` macros in routes

## API Type Safety
The server exports `export type App = typeof app`
Frontend uses Eden Treaty for end-to-end type-safe API calls

## Running the project

**Start development environment**
```sh
# Start all services (server, web, emails)
bun run dev
# Or start services individually
cd apps/server && bun run dev
cd apps/web && bun run dev
```

**Prisma database management**
```sh
cd apps/server && bun run db:start    # Start Prisma Postgres
cd apps/server && bun run prisma generate
cd apps/server && bun run prisma studio
```

**Linting and typechecking**
```sh
bun run format # Auto-fix with Biome (ultracite)
cd apps/server && bun run tsc --noEmit
cd apps/web && bun run tsc --noEmit
```

## Plan mode mandatory steps

### Analyses
- Launch **parallel subagents** to search codebase (`explore-codebase` agent is good for that)
- Launch **parallel subagents** to gather online information (`websearch` agent is good for that)
- Find files to use as **examples** or **edit targets**
- Return relevant file paths and useful context
- **CRITICAL**: Think deeply before starting agents - know exactly what to search for
- Use multiple agents to search across different areas

### Plan 
1. Provide your initial answer
2. Generate 3-5 question that would expose error in your answer. Always try to think out the box and think of the current architecture
3. Double check any library/documentation using context7 MCP to ensure you are correct
4. Answer yourself each verification question independently
5. Provide you final revised answer based on the verification

### Priority

Understanding > Speed > Completeness. Every bug/feature must be fully understood before giving the plans.
