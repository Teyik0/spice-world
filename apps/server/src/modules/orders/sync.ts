// This file is deprecated. Polar sync functionality has been moved to:
// - apps/server/src/modules/polar-sync.ts (centralized Polar client and sync functions)
// - apps/server/src/modules/products/service.ts (eager sync on variant creation)
//
// The old "lazy sync" approach (sync at checkout) has been replaced with
// "eager sync" (sync when product is published or when variants are created on published products)

// If you need to import polarClient, use:
// import { polarClient } from "../polar-sync";

// This file can be safely deleted once all references are updated.
export {};
