# API Response Conventions

## 1. Overview

The BMS backend uses a consistent response envelope for all API endpoints.

The purpose of this convention is to provide frontend clients with a predictable response structure regardless of the controller or business domain handling the request.

All public API endpoints are exposed under the versioned API namespace described in `api-versioning.md`.

## 2. Success Responses

Successful responses use the following envelope:

```json
{
  "success": true,
  "data": {}
}
```

The `data` property contains the actual result returned by the endpoint.

### Object Response

Example:

```json
{
  "success": true,
  "data": {
    "id": "product-123",
    "name": "Product Name"
  }
}
```

### Collection Response

Example:

```json
{
  "success": true,
  "data": [
    {
      "id": "product-123",
      "name": "Product A"
    },
    {
      "id": "product-456",
      "name": "Product B"
    }
  ]
}
```

### Empty Response

When an operation succeeds without returning data, `data` is `null`.

Example:

```json
{
  "success": true,
  "data": null
}
```

## 3. Error Responses

Failed requests use the following envelope:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

The `error.code` provides a stable machine-readable identifier.

The `error.message` provides a human-readable description of the failure.

### Example

A request for a resource that does not exist may return:

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Product not found"
  }
}
```

## 4. HTTP Status Codes and Error Codes

HTTP status codes communicate the general category of the result.

Application error codes provide a stable identifier for frontend logic.

For example:

```text
HTTP 404
code: RESOURCE_NOT_FOUND
```

The frontend should use the HTTP status code for transport-level handling and the application error code when application-specific behavior is required.

## 5. Standard Error Codes

The backend currently defines the following standard error codes:

| HTTP Status | Error Code | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | The request is malformed or invalid. |
| 401 | `UNAUTHORIZED` | Authentication is required or has failed. |
| 403 | `FORBIDDEN` | The authenticated user is not permitted to perform the operation. |
| 404 | `RESOURCE_NOT_FOUND` | The requested resource does not exist. |
| 409 | `CONFLICT` | The requested operation conflicts with the current resource state. |
| 422 | `VALIDATION_ERROR` | Request data failed validation. |
| 500 | `INTERNAL_SERVER_ERROR` | An unexpected server-side error occurred. |

Additional domain-specific error codes may be introduced as business modules are implemented.

## 6. Controller Responsibilities

Controllers should return the actual application result.

Example:

```ts
return product;
```

Controllers should not manually construct the success envelope.

Do not write:

```ts
return {
  success: true,
  data: product,
};
```

The global response interceptor automatically applies the success envelope.

## 7. Exception Handling

Controllers and application services should throw appropriate NestJS exceptions when an operation cannot be completed.

Example:

```ts
throw new NotFoundException('Product not found');
```

The global exception filter converts the exception into the standard error envelope.

Controllers should not manually construct error envelopes.

Do not write:

```ts
return {
  success: false,
  error: {
    code: 'RESOURCE_NOT_FOUND',
    message: 'Product not found',
  },
};
```

The exception filter is responsible for creating the standardized error response.

## 8. Response Processing

The response pipeline is implemented using shared infrastructure under:

src/common/

Successful responses are standardized by:

src/common/interceptors/response.interceptor.ts

Errors are standardized by:

src/common/filters/http-exception.filter.ts

This keeps response formatting out of individual controllers and maintains a consistent API contract across all domains.

## 9. Frontend Consumption

Frontend clients should first determine whether the request succeeded by checking the `success` property.

### Successful Response

```ts
if (response.success) {
  const data = response.data;
}
```

### Error Response

```ts
if (!response.success) {
  const code = response.error.code;
  const message = response.error.message;
}
```

Frontend code should not rely on endpoint-specific response envelopes.

The same success and error structure applies across all API domains.

## 10. Contract Stability

The response envelope is part of the public API contract.

Non-breaking additions should preserve the existing structure.

Breaking changes to the response contract require consideration of API versioning according to the strategy defined in `api-versioning.md`.

The following structures should remain stable within an API version:

```text
Success:
success
data

Error:
success
error.code
error.message
```
