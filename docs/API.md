# API Documentation

## Base URL
```
Development: http://localhost:4321/api
Production: https://your-domain.com/api
```

## Authentication

Currently, API endpoints are public. Rate limiting is enforced.

---

## Endpoints

### GET /api/health

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "2.0.0",
  "environment": "production",
  "features": {
    "analytics": false,
    "auth": false,
    "crmSync": false,
    "rateLimiting": true
  },
  "checks": {
    "database": true,
    "email": true,
    "kv": true
  }
}
```

---

### POST /api/calculate

Calculate quote based on input data.

**Request:**
```json
{
  "step": "step-01",
  "data": {
    "projectType": "web",
    "quantity": 5
  },
  "language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "totalPrice": 50000,
    "currency": "HUF",
    "breakdown": {
      "base": 10000,
      "quantity": 40000
    }
  }
}
```

**Rate Limit:** 10 requests per minute per IP

---

### POST /api/validate

Validate step data without calculating.

**Request:**
```json
{
  "step": "step-01",
  "data": {
    "projectType": "web",
    "quantity": 5
  }
}
```

**Response:**
```json
{
  "success": true,
  "isValid": true,
  "errors": {}
}
```

Or with errors:
```json
{
  "success": true,
  "isValid": false,
  "errors": {
    "projectType": "Project type is required",
    "quantity": "Quantity must be at least 1"
  }
}
```

---

### POST /api/save-quote

Save a quote to database and send confirmation email.

**Request:**
```json
{
  "data": {
    "projectType": "web",
    "quantity": 5
  },
  "totalPrice": 50000,
  "currency": "HUF",
  "breakdown": {
    "base": 30000,
    "quantity": 20000
  },
  "language": "en",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+36301234567",
  "utm_source": "google",
  "utm_campaign": "summer_sale",
  "gclid": "abc123"
}
```

**Response:**
```json
{
  "success": true,
  "quoteId": 123,
  "message": "Quote saved successfully"
}
```

**Features:**
- Fingerprint-based duplicate prevention
- IP anonymization (GDPR)
- Device detection
- UTM parameter tracking
- Email confirmation sent automatically
- Admin notification sent

**Rate Limit:** 10 requests per minute per IP

---

### GET /api/quotes/:id

Retrieve a quote by ID.

**Response:**
```json
{
  "success": true,
  "quote": {
    "id": 123,
    "totalPrice": 50000,
    "currency": "HUF",
    "breakdown": {
      "base": 30000,
      "quantity": 20000
    },
    "language": "en",
    "status": "new",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Note:** Sensitive data (email, phone, IP) is not returned

---

## Error Responses

All errors include an `errorId` for tracking:
```json
{
  "success": false,
  "error": "Error message",
  "errorId": "a1b2c3d4"
}
```

### Status Codes

- `200` - Success
- `400` - Validation error
- `413` - Payload too large
- `429` - Rate limit exceeded
- `500` - Internal server error

---

## Rate Limiting

- **Limit:** 10 requests per minute per IP
- **Headers:** `Retry-After` header included in 429 responses
- **Key:** Combination of IP address + User-Agent (hashed)

---

## CORS

Allowed origins are configured in `src/lib/config.ts`:
```typescript
security: {
  allowedOrigins: [
    'https://your-domain.com',
    'http://localhost:4321' // dev only
  ]
}
```
