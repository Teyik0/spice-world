# Project

A full-stack e-commerce platform.
Key features: product management, categories with dynamic attributes, user authentication, order processing.

## Structure

**apps/server** (port 3000): Elysia API with Drizzle, Better Auth, Stripe

- `/src/modules`: Business logic (products, categories, orders)
- `/drizzle/schema.ts`: Database models

**apps/web** (port 5173): React/Next.js admin dashboard

- Uses Eden Treaty for type-safe API calls
- TanStack Form for form management
- shadcn/ui components

**apps/storefront** (port 3002): React/Furin admin dashboard

- Uses Eden Treaty for type-safe API calls
- TanStack Form for form management
- shadcn/ui components

**packages/emails**: React Email templates
**packages/ui**: UI shadcn shared components

# Relevant code sample

using @elysia/eden in the frontend to fetch data from the elysia backend

```ts
api.<route>(<params>).<method>(<body>)
// example:
const { data, status, error } = await api.attributes({ id: testAttr.id }).get();
const { data, status, error } = await api.attributes.post(newAttrData);
```

- MUST NOT wrap Eden calls in helpers (`unwrap`, etc.): destructure `{ data, error }` and handle the error inline, right where the call is made (loader, action...)

# Code rules

- GUIDELINE correctness > completeness > speed. each phase must be thorough before proceeding
- MUST always create the feature using the fewest possible lines of code. The best code you can produce is the one you never write.
- MUST always use Bun, not npm/node/pnpm
- MUST reuse backend models in frontend, no type duplication
- MUST always use async/await, never `.then()`/`.catch()` chains
- MUST ABSOLUTELY propose YOUR recommendations (considering production-grade / industry standard apps) AND alternatives, regardless of what the user prompts
- MUST check for type error after diff: `bun check <file_path>`
- MUST check for lint error after diff: `bun run biome check <file_path>`
- MUST create test without any mock, the only exception is third party such as the image upload (utapi)

## Required code examples in responses

- MUST include a concrete code example and its target file path for every proposed code change, even when answering a question without editing files.
- MUST also show code for each proposed alternative.
- MUST use the project’s actual names and conventions in examples.
- MUST briefly explain differences, limitations, and effects on type inference.
- MUST distinguish proposed code from changes actually applied and tested.
- Before sending a response, MUST verify that every proposed code change has an accompanying code example; add any missing examples.
- Keep explanations short and let the code explain itself.

## Running the project

**Start development environment**

```sh
cd apps/server && bun dev
cd apps/web && bun dev
cd apps/dashboard && bun dev
cd apps/storefront && bun dev
```

**Formatting, linting and typechecking**

```sh
bun fmt
bun run biome check
bun check -p apps/server
bun check -p apps/web
bun check -p apps/storefront
bun check -p apps/dashboard
```

## Task involving backend end change (apps/server)

- MUST ensure for any services that post, patch and getById return the same object, output type should be the same
- MUST strictly follow atomicity principle: one transaction = many change. E.g. creating a product with attributes and category in one API call. Revert all if any part fails
- MUST create test that run concurrently and in parallel, each test should be isolated
- MUST use tests/utils/helper.ts pattern when needed
- MUST use expect().toMatchObject() when doing asserting api error call (to avoid type issue)
- MUST check how others test are setup and follow the same pattern
- MUST run the associated file(s) test when an endpoint is modified `bun run test tests/<test_file>`, don't rerun the whole tests suite on each pass
- MUST ABSOLUTELY load and apply `elysia` skill for any backend change
- MUST reject any bad input, no magic behavior (no thumbnail auto assign, no input normalization on server side...)

## Task involving frontend end change (apps/web, apps/dashboard or apps/storefront)

- MUST ABSOLUTELY load and apply `frontend-design` and `web-design-guidelines` skills for ANY task involving frontend/UI, regardless of what the user asks
- MUST report to the users if the problem come from furin, we should fix furin first if the issue is in it. No workaround
