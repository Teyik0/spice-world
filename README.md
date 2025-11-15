# Spice World - E-Commerce Platform

A modern, single-tenant e-commerce platform built with Bun, Elysia, and Qwik.

---

## Overview

Spice World is a full-stack e-commerce solution designed for managing products with flexible variants, categories, and attributes. The platform features a comprehensive admin dashboard and leverages modern technologies for type safety and performance.

---

## Tech Stack

### Runtime & Framework
- **Bun** - Fast JavaScript runtime, package manager, and bundler
- **Elysia** - Type-safe backend framework with automatic API documentation
- **Qwik** - Resumable frontend framework optimized for edge deployment
- **Prisma** - Type-safe ORM for PostgreSQL

### Authentication & Storage
- **Better Auth** - Complete authentication solution with OAuth and email/password
- **UploadThing** - File upload and image hosting
- **Stripe** - Payment processing integration

### Email & Observability
- **React Email** - Modern email templates
- **Resend** - Transactional email delivery
- **OpenTelemetry + Axiom** - Distributed tracing and monitoring

### Code Quality
- **Ultracite (Biome)** - Strict linting and formatting
- **TypeScript** - Full type safety across the stack
- **Lefthook** - Git hooks for validation

---

## Architecture

### Monorepo Structure

```
apps/
├── server/          # Elysia API backend
│   ├── src/
│   │   ├── modules/     # Products, Categories, Attributes, Tags
│   │   ├── plugins/     # Better Auth, Prisma error handling
│   │   └── lib/         # Utilities, Prisma client, images
│   └── prisma/
│       └── schema.prisma
├── web/             # Qwik admin dashboard
│   └── src/
│       ├── routes/      # File-based routing
│       ├── components/  # UI components
│       └── lib/         # API client, utilities
packages/
└── emails/          # React Email templates
```

### Database Models

**Product Catalog:**
- **Product** - Base product entity with name, description, status
- **ProductVariant** - SKU-based variants with price, stock, and attributes
- **Category** - Product categories with images
- **Attribute** - Category-specific attributes (e.g., weight, origin)
- **AttributeValue** - Specific values for attributes (e.g., "50g", "100g")
- **Tag** - Product tags with custom badge colors
- **Image** - Product and category images

**Users & Auth:**
- **User** - User accounts with role-based access (admin/user)
- **Account** - OAuth and email/password credentials
- **Session** - Active sessions with IP/UA tracking
- **Verification** - Email verification tokens

**Orders:**
- **Order** - Customer orders with Stripe integration
- **Comment** - Product reviews and feedback

---

## Product & Variant System

### How Variants Work

Products support flexible variants based on category-defined attributes:

```
Product: "Paprika Powder"
├── Category: "Spices"
│   ├── Attribute: "Weight"
│   │   └── Values: ["50g", "100g", "250g"]
│   └── Attribute: "Origin"
│       └── Values: ["Hungary", "Spain"]
│
└── Variants:
    ├── Variant 1: €3.99, Stock: 80
    │   └── Attributes: [Weight: 50g]
    ├── Variant 2: €6.99, Stock: 60
    │   └── Attributes: [Weight: 100g]
    └── Variant 3: €14.99, Stock: 30
        └── Attributes: [Weight: 250g]
```

**Key Features:**
- Attributes defined per category
- Flexible attribute combinations
- Unique SKU per variant
- Independent stock tracking

---

## API Structure

### Authentication Endpoints
```
/api/auth/*
├── /sign-up, /sign-in, /sign-out
├── /verify-email, /reset-password
└── /oauth/google/*
```

### Product Management
```
/products
├── GET /              # List with filtering, sorting, pagination
├── GET /count         # Count by status
├── GET /:id           # Single product with variants
├── POST /             # Create with images + variants
├── PATCH /:id         # Update product, variants, images, tags
└── DELETE /:id        # Delete product
```

### Category Management
```
/categories
├── GET /              # List all categories
├── GET /:id           # Single category
├── POST /             # Create with image upload
├── PATCH /:id         # Update
└── DELETE /:id        # Delete
```

### Attribute Management
```
/attributes
├── GET /              # List (filter by categoryId)
├── POST /             # Create with values
├── PATCH /:id         # Update
├── DELETE /:id        # Delete
└── /values
    ├── POST /:id      # Add value
    ├── PATCH /:id     # Update value
    └── DELETE /:id    # Delete value
```

### Tag Management
```
/tags
├── GET /              # List all tags
├── POST /             # Create
├── PATCH /:id         # Update
└── DELETE /:id        # Delete
```

---

## Type Safety

End-to-end type safety using Elysia's Eden Treaty:

```typescript
// Server exports its type
export type App = typeof app;

// Client imports and uses
import { treaty } from "@elysiajs/eden";
import type { App } from "@/server";

const api = treaty<App>("http://localhost:3000");

// Fully typed API calls
const { data } = await api.products.get({
  query: { status: "PUBLISHED" }
});
// data has complete type information
```

---

## Authentication & Authorization

### Features
- Email/password authentication with verification
- Google OAuth integration
- Password reset flow
- Email change verification
- Session management with IP/UA tracking
- Role-based access control (admin/user)

### Access Control

**Admin Guard:**
```typescript
// Write operations require admin role
if (method !== "GET" && user.role !== "admin") {
  return status("Unauthorized");
}
```

**Rate Limiting:**
- 100 requests per 10 seconds (global)
- 3 sign-in attempts per 10 seconds

---

## Image Management

### Upload Pipeline
1. Client uploads files via multipart form
2. UploadThing handles S3 storage
3. Sharp resizes/optimizes to WebP (200x200)
4. Automatic retry (3 attempts)
5. Cleanup on error

### Features
- Max 5 images per product
- Automatic thumbnail generation
- Image metadata management
- Cascade delete on product removal

---

## Development

### Prerequisites
- Bun v1.0+
- PostgreSQL
- Node.js 20+ (for some dependencies)

### Getting Started

```bash
# Install dependencies
bun install

# Start PostgreSQL
docker-compose up -d postgresdb

# Run database migrations
cd apps/server && bun run prisma migrate dev

# Start all services
bun run dev
```

### Available Commands

```bash
# Development
bun run dev                    # Start all services

# Database
cd apps/server
bun run db:start              # Start Prisma Postgres
bun run prisma generate       # Generate Prisma client
bun run prisma studio         # Open Prisma Studio
bun run db:reset              # Reset database

# Code Quality
bun run format                # Format with Ultracite
bun run tsc --noEmit          # Type check

# Testing
cd apps/server
bun test                      # Run tests
```

---

## Project Status

### Implemented ✅
- Product CRUD with variants and attributes
- Category management with images
- Attribute system (per-category)
- Tag management
- User authentication and authorization
- Admin dashboard (products, categories)
- Image upload and optimization
- Type-safe API client

### In Progress 🚧
- Order management UI
- Payment processing (Stripe integration)
- Customer storefront

### Planned 📋
- Shopping cart
- Checkout flow
- Order tracking
- Email notifications (order confirmations)
- Product reviews
- Analytics dashboard

---

## Environment Variables

### Server (`apps/server/.env`)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/spice_world
UPLOADTHING_TOKEN=your_uploadthing_token
BETTER_AUTH_SECRET=random_secret_string
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
RESEND_API_KEY=your_resend_api_key
```

### Web (`apps/web/.env`)
```env
PUBLIC_BETTER_AUTH_URL=http://localhost:3000
```

---

## Code Style

This project uses Ultracite (Biome) with strict rules:

- No `any`, enums, or namespaces
- Prefer interfaces over types
- Use `import type` for type imports
- Arrow functions over function expressions
- Comprehensive accessibility requirements
- Consistent naming conventions

See `biome.jsonc` for full configuration.

---

## Error Handling

### Prisma Error Mapping
```typescript
P2025 → 404 Not Found
P2002 → 409 Conflict (unique constraint)
P2003 → 409 Conflict (foreign key)
P2000 → 400 Bad Request (value too long)
```

### Validation
All endpoints use Elysia's type system for automatic validation:
- UUID format validation
- String patterns (lowercase, alphanumeric)
- Number ranges (min/max)
- Array size constraints
- File upload limits

---

## Testing

Server tests use Bun's built-in test runner with isolated test databases:

```typescript
// Create isolated test database
const testDb = await createTestDatabase("my-test.ts");

// Run tests
bun test tests/product.test.ts

// Cleanup happens automatically
```

---

## Deployment

### Docker
```bash
# Start all services
docker-compose up -d

# PostgreSQL on port 5432
# API server on port 3000
```

### Production Checklist
- [ ] Set secure `BETTER_AUTH_SECRET`
- [ ] Configure production database
- [ ] Set up Stripe webhooks
- [ ] Configure CORS for production domains
- [ ] Enable production logging
- [ ] Set up database backups
- [ ] Configure CDN for images

---

## Contributing

1. Follow the code style enforced by Ultracite
2. Write tests for new features
3. Use conventional commit messages:
   - `feat:` New features
   - `fix:` Bug fixes
   - `docs:` Documentation changes
   - `refactor:` Code refactoring
   - `test:` Test additions/changes

---

## License

[Your License Here]

---

## Support

For issues or questions:
- Create an issue in the repository
- Check existing documentation in `.claude/` and `CLAUDE.md`

---

**Built with ❤️ using modern web technologies**
