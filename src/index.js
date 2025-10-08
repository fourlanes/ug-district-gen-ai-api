import OpenAI from 'openai';
import { loadCSVData, loadLocations } from './utils/dataLoader.js';
import { calculateMetrics } from './utils/metrics.js';
import { buildOpenAIPrompt, validateResponse } from './utils/queryProcessor.js';

// CORS headers for dashboard integration
const corsHeaders = {
	'Access-Control-Allow-Origin': '*', // TODO: Replace with actual dashboard domain
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400',
};

// Rate limiting storage (simple in-memory for now)
const rateLimitMap = new Map();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60000; // 1 minute in ms

export default {
	async fetch(request, env, ctx) {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// Only accept POST requests to /query
		if (request.method !== 'POST') {
			return jsonResponse({ error: 'Method not allowed' }, 405);
		}

		const url = new URL(request.url);
		if (url.pathname !== '/query') {
			return jsonResponse({ error: 'Not found' }, 404);
		}

		try {
			// Rate limiting
			const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
			if (isRateLimited(clientIP)) {
				return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429);
			}

			// Parse and validate request
			const body = await request.json();
			const validation = validateQuery(body);
			if (!validation.valid) {
				return jsonResponse({
					type: 'clarification',
					text: validation.error,
					suggestions: [],
					timestamp: new Date().toISOString()
				}, 400);
			}

			const { query, location, category } = body;

			// Check cache first
			const cacheKey = buildCacheKey(query, location, category);
			const cache = caches.default;
			let response = await cache.match(cacheKey);

			if (response) {
				console.log('Cache hit:', cacheKey);
				return response;
			}

			console.log('Cache miss, processing query:', { query, location, category });

			// Load relevant data
			const facilityData = await loadCSVData(location.district, category);
			const locations = await loadLocations();

			// Calculate aggregated metrics
			const metrics = calculateMetrics(facilityData, location, category);

			// Build OpenAI prompt and get response
			const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

			const prompt = buildOpenAIPrompt(query, location, category, metrics, facilityData);

			const startTime = Date.now();
			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: getSystemPrompt() },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7,
				max_tokens: 1000,
				response_format: { type: 'json_object' }
			});

			const duration = Date.now() - startTime;
			const aiResponse = JSON.parse(completion.choices[0].message.content);

			// Validate and format response
			const finalResponse = validateResponse(aiResponse);
			finalResponse.timestamp = new Date().toISOString();

			// Log for monitoring
			console.log({
				timestamp: finalResponse.timestamp,
				category,
				location: location.district,
				queryLength: query.length,
				responseType: finalResponse.type,
				duration_ms: duration,
				tokensUsed: completion.usage.total_tokens,
				cached: false
			});

			// Create response and cache it
			response = jsonResponse(finalResponse, 200);

			// Cache for 1 hour
			ctx.waitUntil(cache.put(cacheKey, response.clone()));

			return response;

		} catch (error) {
			console.error('Error processing query:', error);

			// Handle specific error types
			if (error.message?.includes('timeout')) {
				return jsonResponse({
					type: 'clarification',
					text: 'The request took too long to process. Please try rephrasing your query.',
					suggestions: [],
					timestamp: new Date().toISOString()
				}, 504);
			}

			return jsonResponse({
				type: 'clarification',
				text: 'Sorry, I encountered an error processing your query. Please try again or rephrase your question.',
				suggestions: [],
				timestamp: new Date().toISOString()
			}, 500);
		}
	}
};

// Helper functions

function validateQuery(body) {
	if (!body.query || typeof body.query !== 'string') {
		return { valid: false, error: 'Query is required and must be a string' };
	}

	if (body.query.length < 3) {
		return { valid: false, error: 'Query is too short. Please provide more details.' };
	}

	if (body.query.length > 500) {
		return { valid: false, error: 'Query is too long. Please keep it under 500 characters.' };
	}

	if (!body.category || !['health', 'education'].includes(body.category)) {
		return { valid: false, error: 'Category must be either "health" or "education"' };
	}

	if (!body.location || !body.location.district) {
		return { valid: false, error: 'Location with at least a district is required' };
	}

	return { valid: true };
}

function isRateLimited(clientIP) {
	const now = Date.now();
	const clientData = rateLimitMap.get(clientIP) || { count: 0, resetTime: now + RATE_WINDOW };

	// Reset if window has passed
	if (now > clientData.resetTime) {
		rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_WINDOW });
		return false;
	}

	// Check if limit exceeded
	if (clientData.count >= RATE_LIMIT) {
		return true;
	}

	// Increment counter
	clientData.count++;
	rateLimitMap.set(clientIP, clientData);
	return false;
}

function buildCacheKey(query, location, category) {
	const locationStr = JSON.stringify(location);
	const hash = simpleHash(query + locationStr + category);
	return new Request(`https://cache/${category}/${location.district}/${hash}`);
}

function simpleHash(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders
		}
	});
}

function getSystemPrompt() {
	return `You are a data analyst helping Ugandan district officials understand their local data.

Your role:
- Interpret natural language questions about health and education facilities
- Analyze provided data to answer questions accurately
- Return responses in a structured JSON format
- Be specific with numbers and locations
- Suggest actionable insights when relevant
- Use simple language appropriate for non-technical users

Available data context:
- Location hierarchy: Districts > Subcounties > Parishes > Villages
- Categories: Health facilities, Education facilities
- Metrics vary by category (see data schema)

Response guidelines:
- Always cite specific numbers from the data
- Compare to benchmarks when available (WHO recommendations, national averages)
- Suggest which dashboard view would best display the information
- If query is ambiguous, ask for clarification
- Never make up data - only use what's provided

You must return a valid JSON object with this structure:
{
  "type": "answer" | "filter" | "comparison" | "clarification",
  "text": "Plain language response",
  "data": {} (for answer type) | "filters": {} (for filter type) | "rankings": [] (for comparison type) | "suggestions": [] (for clarification type),
  "suggestedView": "map" | "grid" | "charts" | "comparison",
  "suggestedAction": "Optional action user should take (string, optional)"
}

For answer type, include data object with relevant metrics.
For filter type, include filters object with filter criteria and resultCount.
For comparison type, include rankings array with location comparisons.
For clarification type, include suggestions array with alternative query options.`;
}
