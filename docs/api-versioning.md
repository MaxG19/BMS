# API Versioning Strategy

## Current Version

The BMS backend currently exposes its API under:

/api/v1

The `/api/v1` prefix is configured globally in `src/main.ts` using NestJS's global prefix configuration.

This means all controllers are automatically exposed under the `/api/v1` namespace.

## Example

A controller route:

@Get()

is exposed as:

GET /api/v1/

rather than:

GET /

## Future Versions

When a breaking API contract is introduced, a new version can be introduced under:

/api/v2

Version 1 will remain available for existing clients while version 2 is developed and adopted.

Example:

GET /api/v1/products
GET /api/v2/products

Non-breaking changes should generally remain within the existing API version.

## Versioning Principles

- All public API endpoints use an explicit version prefix.
- Breaking changes require a new API version.
- Existing API versions should remain stable for existing clients.
- Version-specific contracts should be documented before implementation.