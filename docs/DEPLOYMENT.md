# Deployment Guide

## Prerequisites

- Cloudflare account
- Turso database created
- Resend API key
- All environment variables ready

---

## Step 1: Database Setup

### Create Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create calculator-boilerplate

# Get credentials
turso db show calculator-boilerplate
```

Save the URL and auth token.

### Run Migrations

```bash
# Set environment variables
export TURSO_DATABASE_URL="libsql://..."
export TURSO_AUTH_TOKEN="..."

# Generate migrations
npm run db:generate

# Run migrations
npm run db:migrate
```

---

## Step 2: Cloudflare Setup

### Create KV Namespaces

```bash
# Rate limiter
wrangler kv:namespace create "RATE_LIMITER"
wrangler kv:namespace create "RATE_LIMITER" --preview

# Sessions
wrangler kv:namespace create "SESSIONS"
wrangler kv:namespace create "SESSIONS" --preview

# CRM queue
wrangler kv:namespace create "CRM_QUEUE"
wrangler kv:namespace create "CRM_QUEUE" --preview
```

Update `wrangler.toml` with the generated IDs.

### Set Secrets

```bash
wrangler secret put TURSO_DATABASE_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put RESEND_API_KEY

# Optional secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SENTRY_DSN
wrangler secret put CRM_WEBHOOK_URL
wrangler secret put CRM_WEBHOOK_SECRET
```

---

## Step 3: Build & Deploy

### Local Test

```bash
# Health check
npm run health-check

# Type check
npm run type-check

# Run tests
npm run test

# Build
npm run build

# Preview
npm run preview
```

### Deploy to Cloudflare

```bash
# Deploy
npm run deploy

# Or manually
wrangler pages deploy ./dist
```

---

## Step 4: Post-Deployment

### Verify Deployment

1. Visit your site: `https://your-subdomain.pages.dev`
2. Check health endpoint: `https://your-site.com/api/health`
3. Test calculator flow
4. Verify email sending
5. Check error tracking

### Setup Custom Domain

```bash
# In Cloudflare Dashboard:
# Pages → Your Project → Custom Domains → Add Domain
```

### Setup Cron Jobs

Add to `wrangler.toml`:

```toml
[triggers]
crons = ["0 2 * * *"]  # Daily at 2 AM
```

Then create cron handler for data cleanup.

---

## Step 5: Monitoring

### Setup Sentry

1. Create Sentry project
2. Get DSN
3. Set secret: `wrangler secret put SENTRY_DSN`
4. Enable in config: `features.sentry = true`

### Setup Analytics

1. Create GA4 property
2. Get measurement ID
3. Set secret: `wrangler secret put GA4_ID`
4. Enable in config: `features.analytics = true`

---

## Troubleshooting

### Build Errors

```bash
# Clear cache
rm -rf node_modules .astro dist
npm install
npm run build
```

### Database Connection Failed

- Verify Turso credentials
- Check IP whitelist (if any)
- Test connection: `turso db shell calculator-boilerplate`

### Email Not Sending

- Verify Resend API key
- Check sender email is verified
- Review Resend dashboard logs

---

## Rollback

```bash
# In Cloudflare Dashboard:
# Pages → Your Project → Deployments → Select Previous → Rollback
```

---

## CI/CD (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run type-check
      - run: npm run test
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy ./dist
```
