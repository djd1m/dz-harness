'use strict';
// ha-ca1 ACL — ClinicalTrials.gov API v2 study record. Reads protocolSection.{statusModule,
// designModule,outcomesModule,identificationModule} + hasResults. DROPS (I-11, load-bearing):
// sponsorCollaboratorsModule.responsibleParty.investigatorFullName, contactsLocationsModule.*,
// overallOfficials — no person-name field survives this boundary.

function dateStructOf(struct) {
  if (!struct || typeof struct !== 'object') return null;
  return {
    date: typeof struct.date === 'string' ? struct.date : null,
    type: typeof struct.type === 'string' ? struct.type : null,
  };
}

/** translateCtgovStudy(payload) -> normalised registry record (no person names). */
function translateCtgovStudy(payload) {
  const ps = (payload && payload.protocolSection && typeof payload.protocolSection === 'object')
    ? payload.protocolSection : {};
  const status = ps.statusModule || {};
  const design = ps.designModule || {};
  const outcomes = ps.outcomesModule || {};
  const ident = ps.identificationModule || {};
  return {
    source: 'ctgov-v2',
    nctId: typeof ident.nctId === 'string' ? ident.nctId.toUpperCase() : null,
    overallStatus: typeof status.overallStatus === 'string' ? status.overallStatus : null,
    startDateStruct: dateStructOf(status.startDateStruct),
    primaryCompletionDateStruct: dateStructOf(status.primaryCompletionDateStruct),
    studyFirstSubmitDate: typeof status.studyFirstSubmitDate === 'string' ? status.studyFirstSubmitDate : null,
    resultsFirstSubmitDate: typeof status.resultsFirstSubmitDate === 'string' ? status.resultsFirstSubmitDate : null,
    enrollmentInfo: (design.enrollmentInfo && typeof design.enrollmentInfo === 'object')
      ? {
        count: typeof design.enrollmentInfo.count === 'number' ? design.enrollmentInfo.count : null,
        type: typeof design.enrollmentInfo.type === 'string' ? design.enrollmentInfo.type : null,
      }
      : null,
    primaryOutcomes: Array.isArray(outcomes.primaryOutcomes)
      ? outcomes.primaryOutcomes.map((o) => ({
        measure: typeof o.measure === 'string' ? o.measure : null,
        timeFrame: typeof o.timeFrame === 'string' ? o.timeFrame : null,
      }))
      : [],
    hasResults: payload && typeof payload.hasResults === 'boolean' ? payload.hasResults : null,
    // I-11: sponsorCollaboratorsModule.responsibleParty.investigatorFullName,
    // contactsLocationsModule.*, overallOfficials — DROPPED here, never carried forward.
  };
}

module.exports = { translateCtgovStudy };
