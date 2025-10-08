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
			withHandwashing: 0,
			withDisabilityAccessibleToilets: 0,
			withSeparateGenderToilets: 0
		},
		enrollment: {
			totalLearners: 0,
			totalBoys: 0,
			totalGirls: 0,
			totalTeachers: 0,
			totalMaleTeachers: 0,
			totalFemaleTeachers: 0,
			totalClassrooms: 0,
			totalDisabledLearners: 0,
			permanentClassrooms: 0,
			semiPermanentClassrooms: 0,
			temporaryClassrooms: 0
		},
		teacherQualifications: {
			diplomaTeachers: 0,
			degreeTeachers: 0,
			certificateTeachers: 0,
			govtPayrollTeachers: 0
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
		if (isYes(facility.ict_lab_available || facility.ict_lab || facility.ICT_Lab)) {
			metrics.infrastructure.withICTLab++;
		}
		if (isYes(facility.handwashing_available)) {
			metrics.infrastructure.withHandwashing++;
		}
		if (isYes(facility.disability_accessible_toilets)) {
			metrics.infrastructure.withDisabilityAccessibleToilets++;
		}
		if (isYes(facility.separate_gender_toilets)) {
			metrics.infrastructure.withSeparateGenderToilets++;
		}

		// Enrollment data
		const learners = parseNumber(facility.total_learners || facility.Total_Learners || facility.enrollment);
		const boys = parseNumber(facility.boys_count);
		const girls = parseNumber(facility.girls_count);
		const teachers = parseNumber(facility.total_teachers || facility.Total_Teachers || facility.teachers);
		const maleTeachers = parseNumber(facility.male_teachers);
		const femaleTeachers = parseNumber(facility.female_teachers);
		const classrooms = parseNumber(facility.total_classrooms || facility.Total_Classrooms || facility.classrooms);
		const disabledLearners = parseNumber(facility.disabled_learners);
		const permanentClassrooms = parseNumber(facility.permanent_classrooms);
		const semiPermanentClassrooms = parseNumber(facility.semi_permanent_classrooms);
		const temporaryClassrooms = parseNumber(facility.temporary_classrooms);

		if (learners > 0) metrics.enrollment.totalLearners += learners;
		if (boys > 0) metrics.enrollment.totalBoys += boys;
		if (girls > 0) metrics.enrollment.totalGirls += girls;
		if (teachers > 0) metrics.enrollment.totalTeachers += teachers;
		if (maleTeachers > 0) metrics.enrollment.totalMaleTeachers += maleTeachers;
		if (femaleTeachers > 0) metrics.enrollment.totalFemaleTeachers += femaleTeachers;
		if (classrooms > 0) metrics.enrollment.totalClassrooms += classrooms;
		if (disabledLearners > 0) metrics.enrollment.totalDisabledLearners += disabledLearners;
		if (permanentClassrooms > 0) metrics.enrollment.permanentClassrooms += permanentClassrooms;
		if (semiPermanentClassrooms > 0) metrics.enrollment.semiPermanentClassrooms += semiPermanentClassrooms;
		if (temporaryClassrooms > 0) metrics.enrollment.temporaryClassrooms += temporaryClassrooms;

		// Teacher qualifications
		const diplomaTeachers = parseNumber(facility.diploma_teachers);
		const degreeTeachers = parseNumber(facility.degree_teachers);
		const certificateTeachers = parseNumber(facility.certificate_teachers);
		const govtPayrollTeachers = parseNumber(facility.govt_payroll_teachers);

		if (diplomaTeachers > 0) metrics.teacherQualifications.diplomaTeachers += diplomaTeachers;
		if (degreeTeachers > 0) metrics.teacherQualifications.degreeTeachers += degreeTeachers;
		if (certificateTeachers > 0) metrics.teacherQualifications.certificateTeachers += certificateTeachers;
		if (govtPayrollTeachers > 0) metrics.teacherQualifications.govtPayrollTeachers += govtPayrollTeachers;
	});

	// Calculate percentages
	if (metrics.totalFacilities > 0) {
		metrics.infrastructure.electricityPercentage = (metrics.infrastructure.withElectricity / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.waterPercentage = (metrics.infrastructure.withWater / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.ictLabPercentage = (metrics.infrastructure.withICTLab / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.handwashingPercentage = (metrics.infrastructure.withHandwashing / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.disabilityAccessibleToiletsPercentage = (metrics.infrastructure.withDisabilityAccessibleToilets / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.separateGenderToiletsPercentage = (metrics.infrastructure.withSeparateGenderToilets / metrics.totalFacilities * 100).toFixed(1);
	}

	// Calculate gender percentages
	if (metrics.enrollment.totalLearners > 0) {
		metrics.enrollment.boysPercentage = (metrics.enrollment.totalBoys / metrics.enrollment.totalLearners * 100).toFixed(1);
		metrics.enrollment.girlsPercentage = (metrics.enrollment.totalGirls / metrics.enrollment.totalLearners * 100).toFixed(1);
		metrics.enrollment.disabledLearnersPercentage = (metrics.enrollment.totalDisabledLearners / metrics.enrollment.totalLearners * 100).toFixed(1);
	}

	if (metrics.enrollment.totalTeachers > 0) {
		metrics.enrollment.maleTeachersPercentage = (metrics.enrollment.totalMaleTeachers / metrics.enrollment.totalTeachers * 100).toFixed(1);
		metrics.enrollment.femaleTeachersPercentage = (metrics.enrollment.totalFemaleTeachers / metrics.enrollment.totalTeachers * 100).toFixed(1);

		// Teacher qualification percentages
		metrics.teacherQualifications.diplomaPercentage = (metrics.teacherQualifications.diplomaTeachers / metrics.enrollment.totalTeachers * 100).toFixed(1);
		metrics.teacherQualifications.degreePercentage = (metrics.teacherQualifications.degreeTeachers / metrics.enrollment.totalTeachers * 100).toFixed(1);
		metrics.teacherQualifications.certificatePercentage = (metrics.teacherQualifications.certificateTeachers / metrics.enrollment.totalTeachers * 100).toFixed(1);
		metrics.teacherQualifications.govtPayrollPercentage = (metrics.teacherQualifications.govtPayrollTeachers / metrics.enrollment.totalTeachers * 100).toFixed(1);
	}

	if (metrics.enrollment.totalClassrooms > 0) {
		metrics.enrollment.permanentClassroomsPercentage = (metrics.enrollment.permanentClassrooms / metrics.enrollment.totalClassrooms * 100).toFixed(1);
		metrics.enrollment.semiPermanentClassroomsPercentage = (metrics.enrollment.semiPermanentClassrooms / metrics.enrollment.totalClassrooms * 100).toFixed(1);
		metrics.enrollment.temporaryClassroomsPercentage = (metrics.enrollment.temporaryClassrooms / metrics.enrollment.totalClassrooms * 100).toFixed(1);
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
			withBackupPower: 0,
			withWater: 0,
			withAmbulance: 0,
			withMaternity: 0,
			withLaboratory: 0,
			withDeliveryRoom: 0,
			withInpatientWard: 0
		},
		services: {
			offeringHIV: 0,
			offeringMaternal: 0,
			offeringChildHealth: 0,
			offeringImmunization: 0,
			offeringDiagnostics: 0,
			offeringFamilyPlanning: 0,
			offeringSurgery: 0
		},
		supplies: {
			withICCMSupplies: 0,
			withORSSachets: 0,
			withZincTablets: 0,
			withRDTKits: 0,
			withACTTablets: 0,
			withAmoxicillin: 0
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
		if (isYes(facility.power_sources) || isYes(facility.electricity || facility.Electricity)) {
			metrics.infrastructure.withElectricity++;
		}
		if (isYes(facility.has_backup_power)) {
			metrics.infrastructure.withBackupPower++;
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
		if (isYes(facility.has_laboratory)) {
			metrics.infrastructure.withLaboratory++;
		}
		if (isYes(facility.has_delivery_room)) {
			metrics.infrastructure.withDeliveryRoom++;
		}
		if (isYes(facility.has_inpatient_ward)) {
			metrics.infrastructure.withInpatientWard++;
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
		if (isYes(facility.has_diagnostics)) {
			metrics.services.offeringDiagnostics++;
		}
		if (isYes(facility.has_family_planning)) {
			metrics.services.offeringFamilyPlanning++;
		}
		if (isYes(facility.has_surgery)) {
			metrics.services.offeringSurgery++;
		}

		// Supplies
		if (isYes(facility.has_iccm_supplies)) {
			metrics.supplies.withICCMSupplies++;
		}
		if (isYes(facility.has_ors_sachets)) {
			metrics.supplies.withORSSachets++;
		}
		if (isYes(facility.has_zinc_tablets)) {
			metrics.supplies.withZincTablets++;
		}
		if (isYes(facility.has_rdt_kits)) {
			metrics.supplies.withRDTKits++;
		}
		if (isYes(facility.has_act_tablets)) {
			metrics.supplies.withACTTablets++;
		}
		if (isYes(facility.has_amoxicillin)) {
			metrics.supplies.withAmoxicillin++;
		}
	});

	// Calculate percentages
	if (metrics.totalFacilities > 0) {
		metrics.infrastructure.electricityPercentage = (metrics.infrastructure.withElectricity / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.backupPowerPercentage = (metrics.infrastructure.withBackupPower / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.waterPercentage = (metrics.infrastructure.withWater / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.ambulancePercentage = (metrics.infrastructure.withAmbulance / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.maternityPercentage = (metrics.infrastructure.withMaternity / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.laboratoryPercentage = (metrics.infrastructure.withLaboratory / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.deliveryRoomPercentage = (metrics.infrastructure.withDeliveryRoom / metrics.totalFacilities * 100).toFixed(1);
		metrics.infrastructure.inpatientWardPercentage = (metrics.infrastructure.withInpatientWard / metrics.totalFacilities * 100).toFixed(1);

		metrics.services.hivPercentage = (metrics.services.offeringHIV / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.maternalPercentage = (metrics.services.offeringMaternal / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.childHealthPercentage = (metrics.services.offeringChildHealth / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.immunizationPercentage = (metrics.services.offeringImmunization / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.diagnosticsPercentage = (metrics.services.offeringDiagnostics / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.familyPlanningPercentage = (metrics.services.offeringFamilyPlanning / metrics.totalFacilities * 100).toFixed(1);
		metrics.services.surgeryPercentage = (metrics.services.offeringSurgery / metrics.totalFacilities * 100).toFixed(1);

		metrics.supplies.iccmSuppliesPercentage = (metrics.supplies.withICCMSupplies / metrics.totalFacilities * 100).toFixed(1);
		metrics.supplies.orsSachetsPercentage = (metrics.supplies.withORSSachets / metrics.totalFacilities * 100).toFixed(1);
		metrics.supplies.zincTabletsPercentage = (metrics.supplies.withZincTablets / metrics.totalFacilities * 100).toFixed(1);
		metrics.supplies.rdtKitsPercentage = (metrics.supplies.withRDTKits / metrics.totalFacilities * 100).toFixed(1);
		metrics.supplies.actTabletsPercentage = (metrics.supplies.withACTTablets / metrics.totalFacilities * 100).toFixed(1);
		metrics.supplies.amoxicillinPercentage = (metrics.supplies.withAmoxicillin / metrics.totalFacilities * 100).toFixed(1);
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
