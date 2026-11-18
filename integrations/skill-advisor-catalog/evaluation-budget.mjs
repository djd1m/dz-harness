/** Unknown provider spend keeps its pre-call reservation; it is never treated as a free failed call. */
export function evaluationAttemptCost(usage,reservation){
 if(!Number.isFinite(reservation)||reservation<0)throw Error('Invalid cost reservation');
 const cost=usage?.cost;
 return Number.isFinite(cost)&&cost>=0?{observed:cost,reserved:0}:{observed:0,reserved:reservation};
}

/** Admit an embedding batch before spend and durably retain unknown provider charges. */
export async function embedEvaluationBatch({client,texts,pricing,report,priorCost,budgetLimit,persist}){
 const rates=[pricing,...(pricing.overrides??[])];
 const prompt=Math.max(...rates.map(rate=>Number(rate.prompt))),request=Math.max(...rates.map(rate=>Number(rate.request??0)));
 if(!Number.isFinite(prompt)||prompt<=0||!Number.isFinite(request)||request<0)throw Error('Invalid embedding pricing');
 const reservation=((texts.reduce((sum,text)=>sum+Buffer.byteLength(text),0)+2048)*prompt+request)*1.1+.001;
 if(priorCost+report.cost+report.unknownCostReserve+reservation>budgetLimit)throw Error('Embedding budget admission refused');
 report.unknownCostReserve+=reservation;persist();
 let response;
 try {response=await client.embed(texts);} catch(error){
  const cost=evaluationAttemptCost(error.usage,reservation);
  report.cost+=cost.observed;report.unknownCostReserve+=cost.reserved-reservation;persist();throw error;
 }
 const cost=evaluationAttemptCost(response.usage,reservation);
 report.cost+=cost.observed;report.unknownCostReserve+=cost.reserved-reservation;persist();
 if(cost.reserved>0)throw Error('Unknown embedding spend; no further paid work');
 if(priorCost+report.cost+report.unknownCostReserve>budgetLimit)throw Error('Evaluation cost bound');
 return response;
}
