/** Unknown provider spend keeps its pre-call reservation; it is never treated as a free failed call. */
export function evaluationAttemptCost(usage,reservation){
 if(!Number.isFinite(reservation)||reservation<0)throw Error('Invalid cost reservation');
 const cost=usage?.cost;
 return Number.isFinite(cost)&&cost>=0?{observed:cost,reserved:0}:{observed:0,reserved:reservation};
}
