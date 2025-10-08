/**
 * Data loading utilities for CSV and JSON data files
 * For Cloudflare Workers, data files are served as static assets
 */

// Cache loaded data in memory during worker execution
const dataCache = new Map();

/**
 * Clean location value by removing prefixes (d-, s-, p-, v-)
 * @param {string} value - Location value with possible prefix
 * @param {string} districtName - Optional district name to remove from subcounty/parish slugs
 * @param {string} subcountyName - Optional subcounty name to remove from parish slugs
 * @returns {string} Cleaned value
 */
function cleanLocationValue(value, districtName = null, subcountyName = null) {
	if (!value) return '';

	const originalValue = value;

	// Remove prefixes like 'd-', 's-', 'p-', 'v-'
	let cleaned = value.replace(/^[dspv]-/, '');

	// Convert slug format to title case (kayunga-town-council -> Kayunga Town Council)
	cleaned = cleaned
		.split('-')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

	// If district name is provided and the cleaned value starts with it, remove the district prefix
	// e.g., "Kayunga Kayunga Town Council" -> "Kayunga Town Council"
	if (districtName) {
		const districtPrefix = districtName.charAt(0).toUpperCase() + districtName.slice(1).toLowerCase() + ' ';
		if (cleaned.startsWith(districtPrefix)) {
			cleaned = cleaned.substring(districtPrefix.length);
		}
	}

	// For parish slugs, also remove the subcounty prefix
	// e.g., "Kayunga Town Council Kayunga Central" -> "Kayunga Central"
	if (subcountyName && originalValue.startsWith('p-')) {
		const subcountyPrefix = subcountyName + ' ';
		if (cleaned.startsWith(subcountyPrefix)) {
			cleaned = cleaned.substring(subcountyPrefix.length);
		}
	}

	return cleaned;
}

/**
 * Filter facilities by the most specific location in the hierarchy
 * Uses location_code column to filter from bottom-up (village → parish → subcounty → district)
 * @param {Array} facilities - Facility data
 * @param {Object} location - Location filter with codes (e.g., {district: 'D01', village: 'D01S01P01V01'})
 * @returns {Array} Filtered facilities
 */
function filterByLocation(facilities, location) {
	// Determine the most specific location code available (bottom-up)
	let filterCode = null;
	let filterLevel = null;

	if (location.village) {
		filterCode = location.village;
		filterLevel = 'village';
	} else if (location.parish) {
		filterCode = location.parish;
		filterLevel = 'parish';
	} else if (location.subcounty) {
		filterCode = location.subcounty;
		filterLevel = 'subcounty';
	} else if (location.district) {
		filterCode = location.district;
		filterLevel = 'district';
	}

	if (!filterCode) {
		console.log('No location filter specified, returning all facilities');
		return facilities;
	}

	// Filter by location_code - facilities must start with the filter code
	const filtered = facilities.filter(row => {
		const locationCode = row.location_code || row.Location_code || '';
		return locationCode.startsWith(filterCode);
	});

	console.log(`Filtering by ${filterLevel}: "${filterCode}" -> ${filtered.length} facilities found of ${facilities.length}`);
	return filtered;
}

/**
 * Load CSV data for a specific district and category
 * @param {string} districtName - District name (e.g., "Kayunga")
 * @param {string} category - 'health' or 'education'
 * @param {object} env - Environment bindings (for ASSETS if configured)
 * @param {object} location - Full location object with codes for filtering
 * @returns {Promise<Array>} Parsed CSV data as array of objects
 */
export async function loadCSVData(districtName, category, env = null, location = null) {
	const cacheKey = `${districtName.toLowerCase()}_${category}`;

	// Check cache first (district level only)
	let districtData;
	if (dataCache.has(cacheKey)) {
		districtData = dataCache.get(cacheKey);
	} else {
		try {
			// Determine file path based on category
			const fileName = category === 'health'
				? 'health_facilities.csv'
				: 'education_facilities.csv';

			const filePath = `/data/facilities/${fileName}`;

			let csvContent;

			// Try to load from ASSETS binding if available (configured in wrangler)
			if (env?.ASSETS) {
				try {
					const response = await env.ASSETS.fetch(new Request(`https://example.com${filePath}`));
					if (response.ok) {
						csvContent = await response.text();
					}
				} catch (e) {
					console.warn('ASSETS binding failed:', e.message);
				}
			}

			// Fallback: Try to fetch from GitHub
			if (!csvContent) {
				try {
					const response = await fetch(`https://raw.githubusercontent.com/fourlanes/ug-district-gen-ai-api/main${filePath}`);
					if (response.ok) {
						csvContent = await response.text();
					} else {
						console.warn(`HTTP ${response.status} for ${filePath}`);
					}
				} catch (e) {
					console.warn(`Fetch failed for ${filePath}:`, e.message);
				}
			}

			// If still no content, return empty
			if (!csvContent) {
				console.error(`Could not load ${filePath} - no data source available`);
				console.error('Please configure ASSETS binding or upload to R2/KV');
				return [];
			}

			const parsed = parseCSV(csvContent);

			// Filter by district using location_code
			const districtCode = location?.district;
			districtData = parsed.filter(row => {
				const locationCode = row.location_code || row.Location_code || '';
				// If no district code provided, or no location_code in data, include all
				if (!districtCode || !locationCode) return true;
				// Check if location_code starts with district code
				return locationCode.startsWith(districtCode);
			});

			// Cache district-level data
			dataCache.set(cacheKey, districtData);
			console.log(`Loaded ${districtData.length} ${category} facilities for ${districtName} (${districtCode})`);
		} catch (error) {
			console.error(`Error loading CSV data for ${districtName}/${category}:`, error);
			throw new Error(`Failed to load ${category} data for ${districtName}`);
		}
	}

	// Apply subcounty/parish/village filters if provided
	if (location && (location.subcounty || location.parish || location.village)) {
		const filtered = filterByLocation(districtData, location);
		console.log(`Filtered to ${filtered.length} facilities by location`);
		return filtered;
	}

	return districtData;
}

/**
 * Find a location by its code in the locations hierarchy
 * @param {Object} locations - Locations data from loadLocations()
 * @param {string} code - Location code (e.g., 'D01', 'D01S05P01')
 * @returns {Object|null} Location object with {type, code, name, district?, subcounty?, parish?} or null if not found
 */
export function getLocationByCode(locations, code) {
	if (!locations?.districts || !code) return null;

	// Determine location type by code pattern
	const isDistrict = /^D\d+$/.test(code);
	const isSubcounty = /^D\d+S\d+$/.test(code);
	const isParish = /^D\d+S\d+P\d+$/.test(code);
	const isVillage = /^D\d+S\d+P\d+V\d+$/.test(code);

	for (const district of locations.districts) {
		if (district.code === code && isDistrict) {
			return {
				type: 'district',
				code: district.code,
				name: district.name
			};
		}

		// Search subcounties
		for (const subcounty of district.subcounties || []) {
			if (subcounty.code === code && isSubcounty) {
				return {
					type: 'subcounty',
					code: subcounty.code,
					name: subcounty.name,
					district: district.name
				};
			}

			// Search parishes
			for (const parish of subcounty.parishes || []) {
				if (parish.code === code && isParish) {
					return {
						type: 'parish',
						code: parish.code,
						name: parish.name,
						subcounty: subcounty.name,
						district: district.name
					};
				}

				// Search villages
				for (const village of parish.villages || []) {
					if (village.code === code && isVillage) {
						return {
							type: 'village',
							code: village.code,
							name: village.name,
							parish: parish.name,
							subcounty: subcounty.name,
							district: district.name
						};
					}
				}
			}
		}
	}

	return null;
}

/**
 * Load locations hierarchy from JSON
 * @param {object} env - Environment bindings
 * @returns {Promise<Object>} Locations data
 */
export async function loadLocations(env = null) {
	const cacheKey = 'locations';

	if (dataCache.has(cacheKey)) {
		return dataCache.get(cacheKey);
	}

	try {
		const filePath = '/data/locations.json';
		let content;

		// Try ASSETS binding
		if (env?.ASSETS) {
			try {
				const response = await env.ASSETS.fetch(new Request(`https://example.com${filePath}`));
				if (response.ok) {
					content = await response.text();
				}
			} catch (e) {
				console.warn('ASSETS binding failed for locations:', e.message);
			}
		}

		// Fallback: GitHub raw
		if (!content) {
			try {
				const response = await fetch(`https://raw.githubusercontent.com/fourlanes/ug-district-gen-ai-api/main${filePath}`);
				if (response.ok) {
					content = await response.text();
				}
			} catch (e) {
				console.warn('GitHub fetch failed for locations:', e.message);
			}
		}

		if (!content) {
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
