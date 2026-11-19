/** Frozen label contracts, not answer-dependent relabeling. Semantic relevance is independently audited. */
export const coversPackages=(packages,sets,exact=false)=>sets.some(set=>set.every(p=>packages.includes(p))&&(!exact||set.length===packages.length));
export function matchesSelection(labels,row,decision,packages){
 if(!row.acceptableDecisions.includes(decision))return false;
 const sets=row.acceptableDecisionPackageSets?.[decision]??row.acceptablePackageSets;
 if(row.acceptableDecisionPackageSets&&!Object.hasOwn(row.acceptableDecisionPackageSets,decision))return false;
 // v2 prospectively allows source-backed complementary packages; an empty target never accepts nonempty output.
 const complementary=labels.scoringContract?.frozenBeforeFifthTrial===true;
 return sets.some(set=>coversPackages(packages,[set],!complementary||set.length===0));
}
