# UG District Data Query API

A Cloudflare Workers-based serverless API that processes natural language queries about Uganda district data using OpenAI's GPT models. The API interprets user questions about health and education facilities, analyzes relevant CSV data, and returns structured responses for dashboard consumption.

## Features

- **Natural Language Processing**: Uses OpenAI GPT-4o-mini to interpret queries about district data
- **Multi-Category Support**: Handles health and education facility data
- **Location-Aware**: Supports hierarchical location filtering (district → subcounty → parish → village)
- **Smart Response Types**: Returns answers, filters, comparisons, or clarification requests
- **Cost-Effective**: ~$0.0004 per query using GPT-4o-mini
- **Serverless**: Runs on Cloudflare Workers (FREE tier)

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Cloudflare account
- OpenAI API key

### Installation

```bash
# Install dependencies
pnpm install

# Start local development server
pnpm run dev

# Deploy to Cloudflare Workers
pnpm run deploy
```

### Configuration

Set your OpenAI API key as a Cloudflare Worker secret:

```bash
wrangler secret put OPENAI_API_KEY
```

## API Reference

### Endpoint

**POST /query**

### Request Format

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

**Parameters:**
- `query` (string, required): Natural language question (3-500 characters)
- `location` (object, required): Location hierarchy filters
  - `district` (string): District name
  - `subcounty` (string, optional): Subcounty name
  - `parish` (string, optional): Parish name
  - `village` (string, optional): Village name
- `category` (string, required): Either "health" or "education"

### Response Types

#### 1. Answer Response
Direct answer with metrics:
```json
{
  "type": "answer",
  "text": "Busaana subcounty has the highest pupil-teacher ratio at 65:1",
  "data": {
    "metric": "pupil_teacher_ratio",
    "value": 65,
    "location": "Busaana"
  },
  "suggestedView": "charts",
  "timestamp": "2025-10-08T12:00:00Z"
}
```

#### 2. Filter Response
Filtered facility list:
```json
{
  "type": "filter",
  "text": "Found 8 schools without electricity in Kayunga district",
  "filters": {
    "has_electricity": false
  },
  "data": [...],
  "suggestedView": "map",
  "timestamp": "2025-10-08T12:00:00Z"
}
```

#### 3. Comparison Response
Rankings and comparisons:
```json
{
  "type": "comparison",
  "text": "Teacher distribution across subcounties",
  "rankings": [...],
  "suggestedView": "comparison",
  "timestamp": "2025-10-08T12:00:00Z"
}
```

#### 4. Clarification Response
Request for more context:
```json
{
  "type": "clarification",
  "text": "I need more information. Try asking:",
  "suggestions": [...],
  "timestamp": "2025-10-08T12:00:00Z"
}
```

## Development

### Testing Locally

```bash
# Start dev server
pnpm run dev

# Test endpoint
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

### Generate TypeScript Types

```bash
pnpm run cf-typegen
```

## Architecture

### Request Flow
```
Dashboard → POST /query → Cloudflare Worker → Load CSV data → Build context prompt →
OpenAI API (GPT-4o-mini) → Analyze & respond → Format response → Return to Dashboard
```

### Key Components

- **[src/index.js](src/index.js)** - Main serverless function
- **[data/facilities/](data/facilities/)** - Health and education facility CSV data
- **[data/trends/](data/trends/)** - Enrollment and analysis trend data
- **[data/locations.json](data/locations.json)** - Location hierarchy

### Data Loading Strategy

- Loads only relevant CSV files based on location and category
- Pre-calculates aggregated metrics before sending to OpenAI
- Includes benchmarks (WHO recommendations, national averages) in context

### Performance & Cost

- **Caching**: Common queries cached for 1 hour
- **Rate Limiting**: 20 queries per minute per IP
- **Timeout**: 30 seconds max with 1 automatic retry
- **Expected Cost**: ~$1/month for 2,500 queries
- **Cloudflare Workers**: FREE tier (under 100K requests/day)

## Security

- OpenAI API key stored as Cloudflare Worker secret
- Input validation and sanitization
- Rate limiting per IP
- CORS restrictions to allowed origins

## Data Files

- [data/facilities/education_facilities.csv](data/facilities/education_facilities.csv) - Education facility data
- [data/facilities/health_facilities.csv](data/facilities/health_facilities.csv) - Health facility data
- [data/trends/](data/trends/) - Enrollment data and PLE analysis
- [data/locations.json](data/locations.json) - Uganda location hierarchy

## License

ISC

## Additional Documentation

For detailed implementation guidance, see [CLAUDE.md](CLAUDE.md).
