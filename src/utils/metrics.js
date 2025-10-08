/**
 * Metrics calculation utilities for facility data analysis
 */

// WHO and national benchmarks
const BENCHMARKS = {
	education: {
		pupil_teacher_ratio_primary: 40,
		pupil_teacher_ratio_secondary: 30,
		pupil_classroom_ratio: 45,
		pupil_toilet_stance_ratio: 40,
		electricity_target: 100, // % of schools
		water_target: 100,
		ict_lab_target: 50
	},
	health: {
		population_per_hc2: 5000,
		population_per_hc3: 20000,
		population_per_hc4: 100000,
		population_per_hospital: 500000,
		electricity_target: 100,
		water_target: 100
	}
};

/**
 * Calculate aggregated metrics for facility data
 * @param {Array} facilities - Facility data
 * @param {Object} location - Location filter
 * @param {string} category - 'health' or 'education'
 * @returns {Object} Aggregated metrics
 */
export function calculateMetrics(facilities, location, category) {
	if (category === 'education') {
		return calculateEducationMetrics(facilities, location);
	} else if (category === 'health') {
		return calculateHealthMetrics(facilities, location);
	}
	return {};
}

/**
 * Calculate education facility metrics
 */
function calculateEducationMetrics(facilities, location) {
	const metrics = {
		totalFacilities: facilities.length,
		byLevel: {},
		byOwnership: {},
		infrastructure: {
			withElectricity: 0,
			withWater: 0,
			withICTLab: 0,
			withLibrary: 0
		},
		enrollment: {
			totalLearners: 0,
			totalTeachers: 0,
			totalClassrooms: 0
		},
		ratios: {},
		gaps: []
	};

	facilities.forEach(facility => {
		// Count by level
		const level = facility.level || facility.Level || 'Unknown';
		metrics.byLevel[level] = (metrics.byLevel[level] || 0) + 1;

		// Count by ownership
		const ownership = facility.ownership || facility.Ownership || 'Unknown';
		metrics.byOwnership[ownership] = (metrics.byOwnership[ownership] || 0) + 1;

		// Infrastructure
		if (isYes(facility.electricity_available || facility.Electricity)) {
			metrics.infrastructure.withElectricity++;
		}
		if (isYes(facility.water_available || facility.Water)) {
			metrics.infrastructure.withWater++;
		}
		if (isYes(facility.ict_lab || facility.ICT_Lab)) {
			metrics.infrastructure.withICTLab++;
		}
		if (isYes(facility.library || facility.Library)) {
			metrics.infrastructure.withLibrary++;
		}

		// Enrollment data
		const learners = parseNumber(facility.total_learners || facility.Total_Learners || facility.enrollment);
		const teachers = parseNumber(facility.total_teachers || facility.Total_Teachers || facility.teachers);
		const classrooms = parseNumber(facility.total_classrooms || facility.Total_Classrooms || facility.classrooms);

		if (learners > 0) metrics.enrollment.totalLearners += learners;
		if (teachers > 0) metrics.enrollment.totalTeachers += teachers;
		if (classrooms > 0) metrics.enrollment.totalClassrooms += classrooms;
	});

	// Calculate percentages
	if (metrics.totalFacilities > 0) {
		metrics.infrastructure.electricityPercentage = (metrics.infrastructure.withElectricity / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.waterPercentage = (metrics.infrastructure.withWater / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.ictLabPercentage = (metrics.infrastructure.withICTLab / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.libraryPercentage = (metrics.infrastructure.withLibrary / metrics.totalFacilities * 100).toFixed(1);
	}

	// Calculate ratios
	if (metrics.enrollment.totalTeachers > 0) {
		metrics.ratios.pupilTeacherRatio = (metrics.enrollment.totalLearners / metrics.enrollment.totalTeachers).toFixed(1);
	}
	if (metrics.enrollment.totalClassrooms > 0) {
		metrics.ratios.pupilClassroomRatio = (metrics.enrollment.totalLearners / metrics.enrollment.totalClassrooms).toFixed(1);
	}

	// Identify gaps
	if (metrics.infrastructure.electricityPercentage < BENCHMARKS.education.electricity_target) {
		metrics.gaps.push({
			type: 'electricity',
			current: metrics.infrastructure.electricityPercentage,
			target: BENCHMARKS.education.electricity_target,
			severity: getSeverity(metrics.infrastructure.electricityPercentage, BENCHMARKS.education.electricity_target)
		});
	}

	if (metrics.ratios.pupilTeacherRatio > BENCHMARKS.education.pupil_teacher_ratio_primary) {
		metrics.gaps.push({
			type: 'pupil_teacher_ratio',
			current: metrics.ratios.pupilTeacherRatio,
			benchmark: BENCHMARKS.education.pupil_teacher_ratio_primary,
			severity: getSeverity(BENCHMARKS.education.pupil_teacher_ratio_primary, metrics.ratios.pupilTeacherRatio)
		});
	}

	metrics.benchmarks = BENCHMARKS.education;

	return metrics;
}

/**
 * Calculate health facility metrics
 */
function calculateHealthMetrics(facilities, location) {
	const metrics = {
		totalFacilities: facilities.length,
		byLevel: {},
		byOwnership: {},
		infrastructure: {
			withElectricity: 0,
			withWater: 0,
			withAmbulance: 0,
			withMaternity: 0
		},
		services: {
			offeringHIV: 0,
			offeringMaternal: 0,
			offeringChildHealth: 0,
			offeringImmunization: 0
		},
		gaps: []
	};

	facilities.forEach(facility => {
		// Count by level
		const level = facility.level || facility.Level || facility.facility_level || 'Unknown';
		metrics.byLevel[level] = (metrics.byLevel[level] || 0) + 1;

		// Count by ownership
		const ownership = facility.ownership || facility.Ownership || 'Unknown';
		metrics.byOwnership[ownership] = (metrics.byOwnership[ownership] || 0) + 1;

		// Infrastructure
		if (isYes(facility.electricity || facility.Electricity)) {
			metrics.infrastructure.withElectricity++;
		}
		if (isYes(facility.water || facility.Water)) {
			metrics.infrastructure.withWater++;
		}
		if (isYes(facility.ambulance || facility.Ambulance)) {
			metrics.infrastructure.withAmbulance++;
		}
		if (isYes(facility.maternity_ward || facility.Maternity)) {
			metrics.infrastructure.withMaternity++;
		}

		// Services
		if (isYes(facility.hiv_services || facility.HIV || facility.has_hiv_tb_care || facility.hivaids_and_tb_care1)) {
			metrics.services.offeringHIV++;
		}
		if (isYes(facility.maternal_services || facility.Maternal || facility.has_maternal_health)) {
			metrics.services.offeringMaternal++;
		}
		if (isYes(facility.child_health || facility.Child_Health)) {
			metrics.services.offeringChildHealth++;
		}
		if (isYes(facility.immunization || facility.Immunization || facility.has_immunization || facility.immunization_services1)) {
			metrics.services.offeringImmunization++;
		}
	});

	// Calculate percentages
	if (metrics.totalFacilities > 0) {
		metrics.infrastructure.electricityPercentage = (metrics.infrastructure.withElectricity / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.waterPercentage = (metrics.infrastructure.withWater / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.ambulancePercentage = (metrics.infrastructure.withAmbulance / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.maternityPercentage = (metrics.infrastructure.withMaternity / metrics.totalFacilities * 100).toFixed(1);

		metrics.services.hivPercentage = (metrics.services.offeringHIV / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.maternalPercentage = (metrics.services.offeringMaternal / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.childHealthPercentage = (metrics.services.offeringChildHealth / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.immunizationPercentage = (metrics.services.offeringImmunization / metrics.totalFacilities * 100).toFixed(1);
	}

	// Identify gaps
	if (metrics.infrastructure.electricityPercentage < BENCHMARKS.health.electricity_target) {
		metrics.gaps.push({
			type: 'electricity',
			current: metrics.infrastructure.electricityPercentage,
			target: BENCHMARKS.health.electricity_target,
			severity: getSeverity(metrics.infrastructure.electricityPercentage, BENCHMARKS.health.electricity_target)
		});
	}

	metrics.benchmarks = BENCHMARKS.health;

	return metrics;
}

/**
 * Get subcounty-level breakdown
 */
export function getSubcountyBreakdown(facilities, metric) {
	const subcountyMap = new Map();

	facilities.forEach(facility => {
		const subcounty = facility.subcounty || facility.Subcounty || facility.sub_county || 'Unknown';

		if (!subcountyMap.has(subcounty)) {
			subcountyMap.set(subcounty, {
				name: subcounty,
				facilities: [],
				metrics: {}
			});
		}

		subcountyMap.get(subcounty).facilities.push(facility);
	});

	// Calculate metrics for each subcounty
	const breakdown = Array.from(subcountyMap.values()).map(sc => {
		const scMetrics = calculateMetrics(sc.facilities, {},
			sc.facilities[0]?.level?.toLowerCase().includes('health') ? 'health' : 'education');

		return {
			location: sc.name,
			facilityCount: sc.facilities.length,
			...scMetrics
		};
	});

	return breakdown.sort((a, b) => b.facilityCount - a.facilityCount);
}

/**
 * Helper: Check if value represents "yes"
 */
function isYes(value) {
	if (!value) return false;
	const str = String(value).toLowerCase().trim();
	return str === 'yes' || str === 'y' || str === 'true' || str === '1';
}

/**
 * Helper: Parse number from string
 */
function parseNumber(value) {
	if (typeof value === 'number') return value;
	if (!value) return 0;
	const num = parseFloat(String(value).replace(/,/g, ''));
	return isNaN(num) ? 0 : num;
}

/**
 * Helper: Get severity level based on comparison to benchmark
 */
function getSeverity(current, target) {
	const ratio = current / target;
	if (ratio < 0.5) return 'critical';
	if (ratio < 0.75) return 'high';
	if (ratio < 0.9) return 'medium';
	return 'low';
}
