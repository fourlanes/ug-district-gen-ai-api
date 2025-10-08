/**
 * Data loading utilities for CSV and JSON data files
 * For Cloudflare Workers, we'll read data files from the filesystem at runtime
 */

// Cache loaded data in memory during worker execution
const dataCache = new Map();

/**
 * Load CSV data for a specific district and category
 * @param {string} district - District name
 * @param {string} category - 'health' or 'education'
 * @returns {Promise<Array>} Parsed CSV data as array of objects
 */
export async function loadCSVData(district, category) {
	const cacheKey = `${district}_${category}`;

	if (dataCache.has(cacheKey)) {
		return dataCache.get(cacheKey);
	}

	try {
		// Determine file path based on category
		const fileName = category === 'health'
			? 'health_facilities.csv'
			: 'education_facilities.csv';

		// For Cloudflare Workers, we need to fetch the file from the public directory
		// or bundle it as a text asset. For now, we'll use a fetch approach.
		const filePath = `./data/facilities/${fileName}`;

		// In local dev, try to read from file system
		let csvContent;
		try {
			const response = await fetch(new URL(filePath, 'file://' + process.cwd() + '/'));
			csvContent = await response.text();
		} catch (e) {
			console.log(e);
			
			// Fallback: Return empty array for now
			// In production, you would upload CSVs to R2 or KV storage
			console.warn(`Could not load ${filePath}, returning empty data`);
			return [];
		}

		const parsed = parseCSV(csvContent);

		// Filter by district if district field exists
		const filtered = parsed.filter(row => {
			if (!row.district && !row.District) return true; // Include if no district field
			const rowDistrict = (row.district || row.District || '').toLowerCase();
			return rowDistrict === district.toLowerCase() || !district;
		});

		dataCache.set(cacheKey, filtered);
		return filtered;
	} catch (error) {
		console.error(`Error loading CSV data for ${district}/${category}:`, error);
		throw new Error(`Failed to load ${category} data for ${district}`);
	}
}

/**
 * Load locations hierarchy from JSON
 * @returns {Promise<Object>} Locations data
 */
export async function loadLocations() {
	const cacheKey = 'locations';

	if (dataCache.has(cacheKey)) {
		return dataCache.get(cacheKey);
	}

	try {
		const filePath = './data/locations.json';

		let content;
		try {
			const response = await fetch(new URL(filePath, 'file://' + process.cwd() + '/'));
			content = await response.text();
		} catch (e) {
			console.warn('Could not load locations.json, returning empty object');
			return {};
		}

		const locations = JSON.parse(content);
		dataCache.set(cacheKey, locations);
		return locations;
	} catch (error) {
		console.error('Error loading locations:', error);
		throw new Error('Failed to load locations data');
	}
}

/**
 * Load trend data for analysis
 * @param {string} fileName - Trend file name
 * @returns {Promise<Array>} Parsed trend data
 */
export async function loadTrendData(fileName) {
	console.log('Trend data loading not yet implemented:', fileName);
	return [];
}

/**
 * Parse CSV string into array of objects
 * @param {string} csvContent - Raw CSV content
 * @returns {Array<Object>} Parsed data
 */
function parseCSV(csvContent) {
	const lines = csvContent.trim().split('\n');
	if (lines.length === 0) return [];

	// Parse header
	const headers = parseCSVLine(lines[0]);

	// Parse rows
	const data = [];
	for (let i = 1; i < lines.length; i++) {
		if (!lines[i].trim()) continue;

		const values = parseCSVLine(lines[i]);
		const row = {};

		headers.forEach((header, index) => {
			row[header.trim()] = values[index]?.trim() || '';
		});

		data.push(row);
	}

	return data;
}

/**
 * Parse a single CSV line, handling quoted fields
 * @param {string} line - CSV line
 * @returns {Array<string>} Parsed values
 */
function parseCSVLine(line) {
	const values = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				// Escaped quote
				current += '"';
				i++; // Skip next quote
			} else {
				// Toggle quote state
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			// Field separator
			values.push(current);
			current = '';
		} else {
			current += char;
		}
	}

	// Add last field
	values.push(current);

	return values;
}

/**
 * Get data schema for a category
 * @param {string} category - 'health' or 'education'
 * @param {Array} sampleData - Sample data to extract schema from
 * @returns {Object} Schema definition
 */
export function getDataSchema(category, sampleData) {
	if (sampleData.length === 0) {
		return { fields: [], description: 'No data available' };
	}

	const fields = Object.keys(sampleData[0]);

	return {
		category,
		fields,
		sampleCount: sampleData.length,
		description: category === 'health'
			? 'Health facilities with infrastructure and service data'
			: 'Education facilities with enrollment and infrastructure data'
	};
}
