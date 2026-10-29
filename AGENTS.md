# Project

A full-stack e-commerce platform. 
Key features: product management, categories with dynamic attributes, user authentication, order processing.

## Structure

**apps/server** (port 3000): Elysia API with Prisma, Better Auth, Stripe
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

- GUIDELINE correctness > completeness > speed. each phase must be thorough before proceeding
- MUST always create the feature using the fewest possible lines of code. The best code you can produce is the one you never write.
- MUST always use Bun, not npm/node/pnpm
- MUST reuse backend models in frontend, no type duplication
- MUST ABSOLUTELY propose YOUR recommendations (considering production-grade / industry standard apps) AND alternatives, regardless of what the user prompts
- MUST check for type error after diff: bun run tsc <file_path> --noEmit
- MUST check for lint error after diff: bun run biome check <file_path>
- MUST create test without any mock, the only exception is third party such as the image upload (utapi)
- MUST explain any proposed adjustment with code and <file_path>.{ts,tsx} inside de conversation, with less sentences. Code should be self-explaining.

## Running the project

**Start development environment**
```sh
cd apps/server && bun dev
cd apps/web && bun dev
```

**Prisma database management**
```sh
cd apps/server && bun run prisma generate
```

**Linting, formatting and typechecking**
```sh
bun run format # Lint, auto-fix and format with Biome (ultracite)
bun check -p apps/server
bun check -p apps/web
```

## Task involving backend end change (apps/server)

- MUST ensure for any services that post, patch and getById return the same object, output type should be the same
- MUST strictly follow atomicity principle: one transaction = many change. E.g. creating a product with attributes and category in one API call. Revert all if any part fails
- MUST create test that run concurrently and in parallel, each test should be isolated
- MUST use tests/utils/helper.ts pattern when needed
- MUST use expect().toMatchObject() when doing asserting api error call (to avoid type issue)
- MUST check how others test are setup and follow the same pattern
- MUST run the associated file(s) test when an endpoint is modified `bun test tests/<test_file>`, don't rerun the whole tests suite

## Task involving frontend end change (apps/web)

- MUST ABSOLUTELY load and apply `frontend-design` and `web-design-guidelines` skills for ANY task involving frontend/UI, regardless of what the user asks
