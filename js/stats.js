export function calcStats(priceArr, annFactor = 252) {
  const rets = priceArr.slice(1).map((p,i)=>Math.log(p/priceArr[i]));
  const mu   = rets.reduce((s,v)=>s+v,0)/rets.length * annFactor;

  const mean = rets.reduce((s,v)=>s+v,0)/rets.length;
  const sigma = Math.sqrt(
     rets.reduce((s,v)=>s + Math.pow(v-mean,2),0) / (rets.length-1)
  ) * Math.sqrt(annFactor);

  return { mu, sigma };
}
