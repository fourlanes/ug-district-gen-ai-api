/**
 * Query processing utilities for OpenAI integration
 */

import { getDataSchema } from './dataLoader.js';
import { getSubcountyBreakdown } from './metrics.js';

/**
 * Build OpenAI prompt from query context
 * @param {string} query - User's natural language query
 * @param {Object} location - Location context
 * @param {string} category - 'health' or 'education'
 * @param {Object} metrics - Calculated metrics
 * @param {Array} facilityData - Raw facility data
 * @returns {string} Formatted prompt for OpenAI
 */
export function buildOpenAIPrompt(query, location, category, metrics, facilityData) {
	const schema = getDataSchema(category, facilityData);

	// Build location context string
	let locationContext = `District: ${location.district}`;
	if (location.subcounty) locationContext += `, Subcounty: ${location.subcounty}`;
	if (location.parish) locationContext += `, Parish: ${location.parish}`;
	if (location.village) locationContext += `, Village: ${location.village}`;

	// Get subcounty breakdown for comparison queries
	const subcountyData = getSubcountyBreakdown(facilityData, null);

	const prompt = `Query: "${query}"

Current Context:
- Location: ${locationContext}
- Category: ${category}
- Total Facilities: ${metrics.totalFacilities}

Aggregated Metrics:
${JSON.stringify(metrics, null, 2)}

Subcounty Breakdown (for comparisons):
${JSON.stringify(subcountyData.slice(0, 10), null, 2)}

Data Schema:
- Available fields: ${schema.fields.join(', ')}
- Total records: ${schema.sampleCount}
- Description: ${schema.description}

Sample Facilities (first 5):
${JSON.stringify(facilityData.slice(0, 5), null, 2)}

Instructions:
1. Analyze the query and determine the best response type:
   - "answer": Direct factual answer with specific data
   - "filter": Query asks to find/show specific facilities (return filter criteria)
   - "comparison": Query compares locations or asks for rankings
   - "clarification": Query is ambiguous or lacks necessary context

2. Use the provided metrics and data to formulate an accurate response
3. Always cite specific numbers and locations
4. Compare to benchmarks when relevant
5. Suggest the most appropriate dashboard view
6. For filter type, specify exact filter criteria based on available fields
7. For comparison type, create rankings array with location comparisons
8. For clarification type, provide helpful suggestions

Return ONLY valid JSON matching this exact structure:
{
  "type": "answer|filter|comparison|clarification",
  "text": "Clear, concise response in simple language",
  "data": {}, // only for answer type - include relevant metrics
  "filters": {}, // only for filter type - exact filter criteria
  "resultCount": 0, // only for filter type
  "facilities": [], // only for filter type - matching facilities (max 10)
  "rankings": [], // only for comparison type - array of {location, value, metric}
  "insights": "", // only for comparison type - key insight
  "suggestions": [], // only for clarification type - array of suggested queries
  "suggestedView": "map|grid|charts|comparison",
  "suggestedAction": "optional action string"
}

Important:
- Only include fields relevant to the response type
- Never fabricate data - use only what's provided
- Keep text responses clear and actionable
- Numbers should be formatted appropriately (e.g., percentages as "45.2%", ratios as "52:1")`;

	return prompt;
}

/**
 * Validate and format OpenAI response
 * @param {Object} response - Raw response from OpenAI
 * @returns {Object} Validated and formatted response
 */
export function validateResponse(response) {
	// Ensure required fields exist
	if (!response.type || !response.text) {
		return {
			type: 'clarification',
			text: 'I encountered an issue processing your query. Please try rephrasing it.',
			suggestions: [
				'Try asking about specific metrics (e.g., "How many schools have electricity?")',
				'Ask for comparisons (e.g., "Which subcounty has the most health facilities?")',
				'Request filtered data (e.g., "Show me schools without water")'
			],
			suggestedView: 'grid'
		};
	}

	// Validate response type
	const validTypes = ['answer', 'filter', 'comparison', 'clarification'];
	if (!validTypes.includes(response.type)) {
		response.type = 'clarification';
	}

	// Set default suggested view if not provided
	if (!response.suggestedView) {
		response.suggestedView = getDefaultView(response.type);
	}

	// Clean up response based on type
	const cleaned = {
		type: response.type,
		text: response.text,
		suggestedView: response.suggestedView
	};

	// Add type-specific fields
	switch (response.type) {
		case 'answer':
			if (response.data) cleaned.data = response.data;
			if (response.suggestedAction) cleaned.suggestedAction = response.suggestedAction;
			break;

		case 'filter':
			if (response.filters) cleaned.filters = response.filters;
			if (response.resultCount !== undefined) cleaned.resultCount = response.resultCount;
			if (response.facilities) cleaned.facilities = response.facilities;
			if (response.suggestedAction) cleaned.suggestedAction = response.suggestedAction;
			break;

		case 'comparison':
			if (response.rankings) cleaned.rankings = response.rankings;
			if (response.insights) cleaned.insights = response.insights;
			if (response.suggestedAction) cleaned.suggestedAction = response.suggestedAction;
			break;

		case 'clarification':
			cleaned.suggestions = response.suggestions || [
				'Try being more specific about what you want to know',
				'Specify a location or metric you\'re interested in',
				'Ask about a specific category (health or education)'
			];
			break;
	}

	return cleaned;
}

/**
 * Get default view for response type
 */
function getDefaultView(type) {
	const viewMap = {
		answer: 'grid',
		filter: 'map',
		comparison: 'comparison',
		clarification: 'grid'
	};
	return viewMap[type] || 'grid';
}

/**
 * Detect query intent for optimization
 * @param {string} query - User query
 * @returns {Object} Detected intent
 */
export function detectQueryIntent(query) {
	const lowerQuery = query.toLowerCase();

	const intent = {
		isComparison: false,
		isFilter: false,
		isCount: false,
		isTrend: false,
		mentionsLocation: false,
		mentionsMetric: false
	};

	// Comparison indicators
	const comparisonWords = ['compare', 'versus', 'vs', 'which', 'most', 'least', 'best', 'worst', 'highest', 'lowest', 'rank'];
	intent.isComparison = comparisonWords.some(word => lowerQuery.includes(word));

	// Filter indicators
	const filterWords = ['show', 'find', 'list', 'without', 'with', 'have', 'missing', 'lacking'];
	intent.isFilter = filterWords.some(word => lowerQuery.includes(word));

	// Count indicators
	const countWords = ['how many', 'number of', 'count', 'total'];
	intent.isCount = countWords.some(word => lowerQuery.includes(word));

	// Trend indicators
	const trendWords = ['trend', 'over time', 'change', 'growth', 'decline', 'improvement'];
	intent.isTrend = trendWords.some(word => lowerQuery.includes(word));

	// Location mentions
	const locationWords = ['subcounty', 'parish', 'village', 'district', 'area', 'region'];
	intent.mentionsLocation = locationWords.some(word => lowerQuery.includes(word));

	// Metric mentions
	const metricWords = ['ratio', 'percentage', 'rate', 'teacher', 'pupil', 'electricity', 'water', 'infrastructure'];
	intent.mentionsMetric = metricWords.some(word => lowerQuery.includes(word));

	return intent;
}

/**
 * Build example queries for clarification
 * @param {string} category - 'health' or 'education'
 * @returns {Array<string>} Example queries
 */
export function getExampleQueries(category) {
	if (category === 'education') {
		return [
			'Which subcounty has the highest pupil-teacher ratio?',
			'Show me schools without electricity',
			'How many schools have ICT labs?',
			'Compare teacher distribution across subcounties',
			'Which schools need infrastructure improvements?'
		];
	} else {
		return [
			'Which subcounty has the most health facilities?',
			'Show me facilities without electricity',
			'How many facilities offer maternal services?',
			'Compare health facility distribution across subcounties',
			'Which facilities need infrastructure improvements?'
		];
	}
}
