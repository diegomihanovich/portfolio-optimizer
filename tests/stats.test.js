import { calcStats } from "../js/stats.js";
import prices5y  from "./mocks/prices5y.json";
import prices10y from "./mocks/prices10y.json";

test("Risk/return differ between 5-y and 10-y windows", ()=>{
  const s5  = calcStats(prices5y);
  const s10 = calcStats(prices10y);

  expect(Math.abs(s5.mu  - s10.mu)).toBeGreaterThan(0.005);
  expect(Math.abs(s5.sigma- s10.sigma)).toBeGreaterThan(0.005);
});
