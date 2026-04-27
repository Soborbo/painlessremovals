# GitHub Actions Setup Guide

This guide explains how to set up automatic deployment to Cloudflare Pages using GitHub Actions and Wrangler.

---

## Prerequisites

- GitHub repository: `Soborbo/painlessv3`
- Cloudflare account with Pages project
- Cloudflare API Token

---

## Step 1: Get Cloudflare Account ID

1. Go to **Cloudflare Dashboard**
2. Click on any domain/site
3. Scroll down in the right sidebar
4. Copy your **Account ID** (e.g., `abc123def456...`)

---

## Step 2: Create Cloudflare API Token

1. Go to: **https://dash.cloudflare.com/profile/api-tokens**
2. Click **Create Token**
3. Use template: **Edit Cloudflare Workers**
4. Or create custom token with these permissions:
   - **Account** → **Cloudflare Pages** → **Edit**
   - **Account** → **Account Settings** → **Read**
5. Click **Continue to summary** → **Create Token**
6. **Copy the token** (you can't see it again!)

---

## Step 3: Add GitHub Secrets

1. Go to your GitHub repository: **https://github.com/Soborbo/painlessv3**
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these two secrets:

### Secret 1: `CLOUDFLARE_API_TOKEN`
```
Value: [paste your API token from Step 2]
```

### Secret 2: `CLOUDFLARE_ACCOUNT_ID`
```
Value: [paste your Account ID from Step 1]
```

---

## Step 4: Add Cloudflare Secrets (Environment Variables)

These are **separate** from GitHub Secrets. Set them in Cloudflare:

```bash
# Using Wrangler CLI:
wrangler pages secret put TURSO_DATABASE_URL --project-name=painlessv3
wrangler pages secret put TURSO_AUTH_TOKEN --project-name=painlessv3
wrangler pages secret put RESEND_API_KEY --project-name=painlessv3
```

**Or** set them in Cloudflare Dashboard:
- **Pages** → **painlessv3** → **Settings** → **Environment variables**

---

## Step 5: Test Deployment

1. **Push to main branch:**
   ```bash
   git add .
   git commit -m "test: trigger deployment"
   git push origin main
   ```

2. **Check GitHub Actions:**
   - Go to: **https://github.com/Soborbo/painlessv3/actions**
   - You should see a workflow running
   - Click on it to see logs

3. **Verify deployment:**
   - If successful, your site will be live at: `https://painlessv3.pages.dev`

---

## Workflow Behavior

The workflow (`.github/workflows/deploy.yml`) runs on:

- ✅ Every push to `main` branch
- ✅ Manual trigger (via "Run workflow" button in GitHub Actions)

It performs:
1. Type checking
2. Linting
3. Testing
4. Building
5. Deploying to Cloudflare Pages

---

## Troubleshooting

### ❌ "Error: Authentication error"
- Check if `CLOUDFLARE_API_TOKEN` is correct
- Check if token has correct permissions

### ❌ "Error: Account not found"
- Check if `CLOUDFLARE_ACCOUNT_ID` is correct

### ❌ "Error: Project not found"
- Make sure `painlessv3` project exists in Cloudflare Pages
- Or change project name in `.github/workflows/deploy.yml`

### ❌ Build fails
- Check logs in GitHub Actions
- Run `npm run build` locally to reproduce
- Check if all environment variables are set

---

## Manual Deployment (Fallback)

If GitHub Actions fails, you can always deploy manually:

```bash
# Build locally
npm run build

# Deploy via Wrangler
wrangler pages deploy ./dist --project-name=painlessv3
```

---

## Disable Auto-Deployment

To disable automatic deployment:

1. Delete `.github/workflows/deploy.yml`
2. Or rename it to `.github/workflows/deploy.yml.disabled`
3. Push to GitHub

You can still deploy manually via `npm run deploy`.
