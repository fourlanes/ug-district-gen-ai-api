# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Cloudflare Workers-based serverless API that processes natural language queries about Uganda district data using OpenAI's GPT models. The API interprets user questions about health and education facilities, analyzes relevant CSV data, and returns structured responses for dashboard consumption.

## Common Commands

### Development
```bash
# Start local development server
npm run dev
# or
wrangler dev

# Deploy to Cloudflare Workers
npm run deploy
# or
wrangler deploy

# Generate TypeScript types for Cloudflare bindings
npm run cf-typegen
```

### Testing Locally
```bash
# Test endpoint with curl
curl -X POST http://localhost:8787/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Which subcounty needs more teachers?",
    "location": {"district": "kayunga"},
    "category": "education"
  }'
```

### Monitoring
```bash
# Tail production logs
wrangler tail
```

## Architecture

### Request Flow
```
Dashboard → POST /query → Cloudflare Worker → Load CSV data → Build context prompt →
OpenAI API (GPT-4o-mini) → Analyze & respond → Format response → Return to Dashboard
```

### Components
- **Cloudflare Worker** ([src/index.js](src/index.js)) - Main serverless function handling query requests
- **OpenAI Integration** - Natural language processing using GPT-4o-mini
- **Data Layer** - CSV files in [data/](data/) directory
  - [data/facilities/](data/facilities/) - Health and education facility data
  - [data/trends/](data/trends/) - Enrollment and analysis trend data
  - [data/locations.json](data/locations.json) - Location hierarchy (districts, subcounties, parishes, villages)

### API Endpoint

**POST /query**

Request body:
```json
{
  "query": "Which subcounty needs more teachers?",
  "location": {
    "district": "kayunga",
    "subcounty": null,
    "parish": null,
    "village": null
  },
  "category": "education"
}
```

### Response Types

The API returns one of four response types:

1. **answer** - Direct answer with metrics (e.g., "Busaana subcounty has highest pupil-teacher ratio")
2. **filter** - Filtered results with facilities list (e.g., "Found 8 schools without electricity")
3. **comparison** - Rankings/comparisons across locations (e.g., teacher distribution by subcounty)
4. **clarification** - Request for more context with suggestions

Each response includes:
- `type` - Response type identifier
- `text` - Plain language response
- `data`/`filters`/`rankings` - Structured data based on type
- `suggestedView` - Recommended dashboard view (map/grid/charts/comparison)
- `timestamp` - ISO-8601 timestamp

## Data Processing

### Data Loading Strategy
- Load only relevant CSV files based on request location and category
- Categories: "health" or "education"
- Pre-calculate aggregated metrics before sending to OpenAI
- Include benchmarks (WHO recommendations, national averages) in context

### OpenAI Prompt Structure
- **Model**: gpt-4o-mini (cost-effective at ~$0.0004 per query)
- **System prompt**: Instructs AI to act as data analyst for Ugandan district officials
- **User prompt**: Includes query, location context, aggregated metrics, and data schema
- **Output**: Structured JSON response only

## Key Implementation Details

### Error Handling
- Rate limiting: 20 queries per minute per IP
- Query validation: 3-500 character length
- OpenAI timeout: 30 seconds max with 1 automatic retry
- CORS: Configured for dashboard domain access

### Performance Optimization
- Cache common queries for 1 hour using Cloudflare cache
- Only load CSVs for requested location/category
- Stream large files when necessary

### Security
- OpenAI API key stored as Cloudflare Worker secret (never in code)
- Input validation and sanitization
- Rate limiting per IP
- CORS restrictions to allowed origins

### Cost Management
- Expected: ~$1/month for 2,500 queries
- Cloudflare Workers: FREE tier (under 100K requests/day)
- OpenAI usage tracking in logs

## Data Files

- [data/facilities/education_facilities.csv](data/facilities/education_facilities.csv) - Education facility data
- [data/facilities/health_facilities.csv](data/facilities/health_facilities.csv) - Health facility data
- [data/trends/](data/trends/) - Contains enrollment data and PLE analysis
- [data/locations.json](data/locations.json) - Uganda location hierarchy

## Configuration

- **Package manager**: pnpm (specified in [package.json](package.json))
- **Runtime**: Cloudflare Workers
- **Entry point**: [src/index.js](src/index.js)
- **Compatibility date**: 2025-10-03 (set in [wrangler.jsonc](wrangler.jsonc))
- **Observability**: Enabled in Wrangler config

## Development Notes

- The API currently has minimal implementation in [src/index.js](src/index.js) - main logic needs to be built
- Detailed specifications are documented in [planning/01.md](planning/01.md)
- The project uses vanilla JavaScript, not TypeScript
- Environment variables and secrets should be configured via Wrangler, not in code
