# Uganda District Data Query API - Deployment Guide

## Overview

This Cloudflare Worker processes natural language queries about Uganda district health and education data using OpenAI's GPT-4o-mini model.

## Prerequisites

1. **Cloudflare Account**
   - Sign up at https://dash.cloudflare.com/sign-up
   - Workers are free up to 100,000 requests/day

2. **OpenAI API Key**
   - Sign up at https://platform.openai.com/
   - Generate an API key from the API keys section
   - Expected cost: ~$0.0004 per query (~$1/month for 2,500 queries)

3. **Package Manager**
   - This project uses pnpm (specified in package.json)
   - Install: `npm install -g pnpm`

## Local Development Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure OpenAI API Key

For local development, create a `.dev.vars` file:

```bash
echo "OPENAI_API_KEY=your_openai_api_key_here" > .dev.vars
```

**Never commit this file to git!** (Already in .gitignore)

### 3. Start Local Development Server

```bash
pnpm run dev
# or
npm run dev
```

The server will start at `http://localhost:8787`

### 4. Test the API

```bash
curl -X POST http://localhost:8787/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Which subcounty needs more teachers?",
    "location": {"district": "masindi"},
    "category": "education"
  }'
```

## Production Deployment

### 1. Login to Cloudflare

```bash
pnpm wrangler login
```

This will open a browser for authentication.

### 2. Set Production OpenAI API Key

Store the OpenAI API key as a Cloudflare secret (encrypted):

```bash
pnpm wrangler secret put OPENAI_API_KEY
```

You'll be prompted to enter the API key. This is secure and won't be visible in logs.

### 3. Deploy to Cloudflare Workers

```bash
pnpm run deploy
# or
npm run deploy
```

After deployment, you'll get a URL like:
```
https://ug-district-gen-ai-api.YOUR-SUBDOMAIN.workers.dev
```

### 4. Monitor Production

View real-time logs:

```bash
pnpm wrangler tail
```

## Data Management

### Current Approach (Development)

Data files are currently loaded from the `data/` directory. This works for local development but needs adjustment for production.

### Recommended Production Approach

For production deployment, you should:

1. **Option A: Cloudflare R2 Storage** (Recommended for large files)
   - Upload CSV files to R2 bucket
   - Access via R2 bindings in the worker
   - Cost-effective for large datasets

2. **Option B: Cloudflare KV Storage** (For smaller, frequently accessed data)
   - Store parsed JSON data in KV
   - Ultra-fast edge access
   - Good for location hierarchy and smaller datasets

3. **Option C: Bundle with Worker** (Current approach, simplest)
   - Data is bundled with worker code
   - Simple but increases worker size
   - Works well for datasets < 1MB

### Setting up R2 (Recommended)

```bash
# Create R2 bucket
pnpm wrangler r2 bucket create ug-district-data

# Upload data files
pnpm wrangler r2 object put ug-district-data/facilities/health_facilities.csv --file=data/facilities/health_facilities.csv
pnpm wrangler r2 object put ug-district-data/facilities/education_facilities.csv --file=data/facilities/education_facilities.csv
pnpm wrangler r2 object put ug-district-data/locations.json --file=data/locations.json
```

Then update `wrangler.jsonc` to add R2 binding:

```jsonc
{
  // ... existing config
  "r2_buckets": [
    { "binding": "DATA_BUCKET", "bucket_name": "ug-district-data" }
  ]
}
```

And update `dataLoader.js` to fetch from R2:

```javascript
const object = await env.DATA_BUCKET.get(`facilities/${fileName}`);
const csvContent = await object.text();
```

## Configuration

### CORS Settings

Update `src/index.js` to set your dashboard domain:

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://your-dashboard-domain.com',
  // ...
};
```

For development, you can use `'*'` to allow all origins, but restrict it in production.

### Rate Limiting

Current limit: 20 requests per minute per IP

Adjust in `src/index.js`:

```javascript
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60000; // 1 minute
```

### Caching

Current cache TTL: 1 hour

Responses are cached using Cloudflare's Cache API to improve performance and reduce OpenAI costs.

## Monitoring & Debugging

### View Logs

```bash
pnpm wrangler tail
```

### Check Usage

Visit Cloudflare Dashboard:
- Workers → Analytics
- View request count, CPU time, errors

### OpenAI Usage

Monitor at https://platform.openai.com/usage

## Cost Estimation

### Cloudflare Workers

- Free tier: 100,000 requests/day
- Beyond: $0.50 per million requests

### OpenAI API (GPT-4o-mini)

- Input: ~$0.15 per million tokens
- Output: ~$0.60 per million tokens
- Average query: ~1,000 tokens total
- **Cost per query: ~$0.0004**

**Monthly estimate (2,500 queries):**
- Cloudflare Workers: FREE
- OpenAI API: ~$1.00
- **Total: ~$1.00/month**

## API Usage

### Endpoint

```
POST /query
```

### Request Format

```json
{
  "query": "Natural language question",
  "location": {
    "district": "masindi",
    "subcounty": "bikonzi",
    "parish": null,
    "village": null
  },
  "category": "education" | "health"
}
```

### Response Types

1. **answer** - Direct factual answer
2. **filter** - Filtered facility list
3. **comparison** - Rankings/comparisons
4. **clarification** - Request for more context

### Example Queries

**Education:**
- "Which subcounty has the highest pupil-teacher ratio?"
- "Show me schools without electricity"
- "How many schools have ICT labs?"
- "Compare teacher distribution across subcounties"

**Health:**
- "Which subcounty has the most health facilities?"
- "Show me facilities without electricity"
- "How many facilities offer maternal services?"
- "Compare health facility distribution"

## Troubleshooting

### Worker fails to start

Check `wrangler.jsonc` syntax and ensure compatibility flags are correct.

### CSV data not loading

Verify files exist in `data/` directory or implement R2 storage solution.

### OpenAI API errors

- Check API key is set: `pnpm wrangler secret list`
- Verify API key has credits at https://platform.openai.com/
- Check rate limits

### CORS errors from dashboard

Update CORS origin in `src/index.js` to match your dashboard domain.

## Security Best Practices

1. **Never commit API keys** - Always use secrets
2. **Restrict CORS** - Only allow your dashboard domain in production
3. **Rate limiting** - Prevent abuse (already implemented)
4. **Input validation** - Sanitize all user inputs (already implemented)
5. **Monitor usage** - Set up alerts for unusual patterns

## Next Steps

1. Test locally with various queries
2. Deploy to production
3. Integrate with dashboard
4. Monitor performance and costs
5. Consider implementing R2 for data storage
6. Add analytics tracking for query patterns

## Support

- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- OpenAI API Docs: https://platform.openai.com/docs/
- Project Issues: (Add your issue tracker URL)
