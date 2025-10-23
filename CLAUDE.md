# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spice World is a full-stack e-commerce platform built with a monorepo architecture using Bun workspaces. The project consists of:
- **Server** (Elysia + Prisma): REST API with authentication, products, categories, and order management
- **Dashboard** (Qwik): Admin interface for managing products, users, and orders
- **Emails** (React Email): Transactional email templates

## Technology Stack

- **Runtime**: Bun (package manager, bundler, and runtime)
- **Server Framework**: Elysia (fast, type-safe API framework)
- **Frontend Framework**: Qwik (resumable, edge-optimized framework)
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Better Auth with Google OAuth and email/password
- **Email**: React Email with Resend
- **Linting/Formatting**: Ultracite (Biome-based strict linter)
- **Git Hooks**: Lefthook for pre-commit validation
- **Observability**: OpenTelemetry with Axiom

## Development Commands

### Running the Project
```bash
# Start all services (server, dashboard, emails, Prisma Studio)
bun run dev

# Run individual services
cd apps/server && bun run dev
cd apps/dashboard && bun run dev
cd packages/emails && bun run dev
```

### Database Management
```bash
# Start PostgreSQL (via Docker)
docker-compose up -d postgresdb
# Start PostgreSQL (via CLI using local Prisma Postgres, Docker not needed)
cd apps/server && bun run db:start # Runs: prisma dev

# Generate Prisma client
cd apps/server && bun run prisma generate

# Run Prisma Studio
cd apps/server && bun run prisma studio

# Reset database (useful for testing)
cd apps/server && bun run db:reset
```

### Code Quality
```bash
# Format and fix all code
bun run format  # Runs: ultracite fix

# Type check individual services
cd apps/server && bun run tsc --noEmit
cd apps/dashboard && bun run tsc --noEmit
cd packages/emails && bun run tsc --noEmit
```

### Building
```bash
# Build services for production
cd apps/server && bun run build
cd apps/dashboard && bun run build
```

## Architecture

### Monorepo Structure
```
apps/
  ├── server/          # Elysia API backend
  │   ├── src/
  │   │   ├── index.ts           # App entry point with middleware setup
  │   │   ├── routes/            # API route handlers (product, category, tag, attribute)
  │   │   ├── plugins/           # Elysia plugins (better-auth, prisma)
  │   │   ├── lib/               # Utilities (prisma client, trycatch, images)
  │   │   └── prisma/            # Generated Prisma client
  │   └── prisma/
  │       └── schema.prisma      # Database schema
  ├── dashboard/       # Qwik frontend admin panel
  │   └── src/
  │       ├── routes/            # File-based routing
  │       ├── components/        # Reusable UI components
  │       └── lib/               # Client utilities
packages/
  └── emails/          # React Email templates
```

### Database Schema Key Models
- **User/Account/Session**: Better Auth managed authentication
- **Product**: Core product model with variants, images, tags, categories
- **ProductVariant**: SKU-based variants with attributes (color, size, etc.)
- **Category/Attribute/AttributeValue**: Hierarchical product categorization
- **Order**: Payment tracking with Stripe integration
- **Comment**: User reviews on products

### Server Architecture (Elysia)

The server uses Elysia's plugin system and middleware chain:

1. **OpenTelemetry**: Distributed tracing to Axiom
2. **OpenAPI**: Auto-generated API documentation at `/swagger`
3. **CORS**: Configured for localhost:3000 and localhost:5173
4. **Better Auth**: Authentication middleware with session management
5. **Guard Middleware**: Admin-only write operations (GET requests are public)
6. **Routes**: Product, Category, Tag, and Attribute routers

**Authentication Flow**:
- `betterAuthPlugin` provides `user`, `isLogin`, and `isAdmin` macros
- Routes can use `.guard({ user: true })` for authenticated endpoints
- Admin role required for POST/PUT/DELETE operations (enforced in `onBeforeHandle`)

**Type Safety**:
- The server exports its type: `export type App = typeof app`
- Dashboard uses Eden Treaty for end-to-end type-safe API calls

### Dashboard Architecture (Qwik)

- **File-based routing**: Routes in `src/routes/` map to URLs
- **Grouped routes**: `(dashboard)` and `(login)` for layout grouping
- **Path aliases**: `@/*` maps to `./src/*`
- **Better Auth client**: Integrated for session management

## Environment Variables

Required environment variables (see `.env.example`):

**Server** (`apps/server`):
- `DATABASE_URL`: PostgreSQL connection string
- `UPLOADTHING_TOKEN`: UploadThing API token for image uploads
- `BETTER_AUTH_SECRET`: Random secret for auth encryption
- `BETTER_AUTH_URL`: Base URL (http://localhost:3000 in dev)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: OAuth credentials
- `RESEND_API_KEY`: Email sending service

**Dashboard** (`apps/dashboard`):
- `PUBLIC_BETTER_AUTH_URL`: Public-facing auth URL

## Code Style (Ultracite/Biome)

This project uses **Ultracite** with extremely strict rules. Key requirements:

- **TypeScript**: No `any`, no enums, no namespaces, prefer interfaces over types
- **React/JSX**: No inline component definitions, proper key props, no index keys
- **Imports**: Use `import type` for types, `node:` protocol for Node builtins
- **Functions**: Prefer arrow functions over function expressions
- **Async**: No await in loops, proper Promise handling
- **Accessibility**: Comprehensive ARIA and semantic HTML requirements

Configuration: `biome.jsonc` extends `ultracite` with `useConsistentTypeDefinitions: "interface"`

## Git Workflow

### Commit Message Format
Conventional commits are enforced via Lefthook:
```
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build
Examples:
  feat: add product variant support
  fix(auth): resolve session timeout issue
  docs: update API documentation
```

### Pre-commit Hooks (Lefthook)
- TypeScript type checking on server files
- Commit message validation via `scripts/validate-commit.sh`

## Key Patterns

### Error Handling
Use the `trycatch` utility from `apps/server/src/lib/trycatch.ts` for consistent error handling in route handlers.

### Prisma Client
Import from `apps/server/src/lib/prisma.ts` which provides a singleton instance with proper Bun adapter configuration.

### Image Management
The `apps/server/src/lib/images.ts` utility handles UploadThing integration and Sharp-based image processing.

### API Routes
Routes use Elysia's fluent API with type inference:
```typescript
.get("/endpoint", async ({ params }) => {
  // Handler logic
})
.post("/endpoint", async ({ body }) => {
  // Handler logic
}, {
  body: t.Object({ /* validation schema */ })
})
```

### Authentication Macros
```typescript
// Require any user
.guard({ user: true })

// Require logged-in user
.guard({ isLogin: true })

// Require admin
.guard({ isAdmin: true })
```

## Testing

Server tests use Bun's built-in test runner. Database reset utility available at `apps/server/tests/utils/reset-db.ts`.

## Docker Deployment

Use `docker-compose.yaml` for containerized deployment:
- PostgreSQL database on port 5432
- API server on port 3000
- Health checks configured for database readiness

## Important Notes

- **Bun-first**: This project uses Bun for all JavaScript/TypeScript operations
- **Strict typing**: Enable all TypeScript strict flags, avoid type assertions
- **Prisma output**: Generated client outputs to `apps/server/src/prisma` (not default location)
- **Module format**: All packages use ESM (`"type": "module"`)
- **Workspace dependencies**: Use `workspace:*` protocol for internal package references
