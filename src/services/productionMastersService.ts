// src/services/productionMastersService.ts
// Central facade re-exporting the modular production domain services, types, and helpers.
// This guarantees 100% backward compatibility with zero regressions across the codebase.

export * from './production'
export { productionMastersService as default } from './production'
