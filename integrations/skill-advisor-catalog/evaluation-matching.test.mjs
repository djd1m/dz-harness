import test from 'node:test';import assert from 'node:assert/strict';
import{matchesSelection}from'./evaluation-matching.mjs';
const row={acceptableDecisions:['clarify','recommend'],acceptablePackageSets:[[],['discovery']],acceptableDecisionPackageSets:{clarify:[[],['discovery']],recommend:[['discovery']]}};
const labels={scoringContract:{frozenBeforeFifthTrial:true}};
test('decision-specific labels prevent empty recommend and unsupported decision cross products',()=>{
 assert(!matchesSelection(labels,row,'recommend',[]));assert(matchesSelection(labels,row,'recommend',['discovery']));assert(matchesSelection(labels,row,'clarify',[]));assert(!matchesSelection(labels,row,'no-match',[]));
});
test('empty no-match targets never accept unrelated recommendations under complementary policy',()=>{
 assert(!matchesSelection(labels,{acceptableDecisions:['no-match'],acceptablePackageSets:[[]]},'no-match',['unrelated']));
});
test('prospective complete target accepts complements while historical exact sets remain unchanged',()=>{
 assert(matchesSelection(labels,row,'recommend',['discovery','required-engine']));assert(!matchesSelection({},row,'recommend',['discovery','required-engine']));assert(!matchesSelection(labels,row,'recommend',['required-engine']));
});
