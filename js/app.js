/* ===== 1. Config & helpers ======================================== */
const MAX_ASSETS   = 20;
const listUl       = document.getElementById('assetList');
const counterP     = document.getElementById('assetCounter');
const addBtn       = document.getElementById('addAssetBtn');
const inp          = document.getElementById('asset-search');
const optimizeBtn  = document.getElementById('optimizeBtn');
const amountInput  = document.getElementById('investment-amount');
const riskRange    = document.getElementById('risk-tolerance');
let   assets       = [];                 // tickers en mayúsculas

function refreshUI () {
  listUl.innerHTML = '';
  assets.forEach(t => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${t}</span><button data-tkr="${t}">✕</button>`;
    listUl.appendChild(li);
  });
  counterP.textContent = `${assets.length} / ${MAX_ASSETS} activos`;
  addBtn.disabled      = assets.length >= MAX_ASSETS;
  optimizeBtn.disabled = assets.length < 2;
}
function addAsset () {
  const t = inp.value.trim().toUpperCase();
  inp.value = '';
  if (!t || assets.includes(t) || assets.length >= MAX_ASSETS) return;
  assets.push(t);
  refreshUI();
}
listUl.addEventListener('click', e => {
  if (e.target.dataset.tkr) {
    assets = assets.filter(x => x !== e.target.dataset.tkr);
    refreshUI();
  }
});
addBtn.addEventListener('click', addAsset);
inp.addEventListener('keydown', e => { if (e.key === 'Enter') addAsset(); });
refreshUI();

/* ===== 2. Fetch histórico Stooq + filtrado por fecha ============== */
async function fetchHistory(tkr, from, to) {
  const freq = document.getElementById('freq-select').value; // d / w / m
  const url  = 'https://corsproxy.io/?' +
               encodeURIComponent(`https://stooq.com/q/d/l/?s=${tkr}.US&i=${freq}`);

  const csv  = await fetch(url).then(r => r.text());
  const { data } = Papa.parse(csv, { header:true, dynamicTyping:true });

  return data.filter(r => {
    if (!r.Date || !r.Close) return false;
    return (!from || r.Date >= from) && (!to || r.Date <= to);
  });
}

function toReturns (rows) {
  const r = [];
  for (let i = 1; i < rows.length; i++) {
    const p0 = rows[i-1].Close, p1 = rows[i].Close;
    if (p0 && p1) r.push(Math.log(p1/p0));
  }
  return r;
}
/* helpers estadísticos */
const mean = a => a.reduce((s,v) => s+v,0) / a.length;
const cov  = (x,y,mx,my) => x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/(x.length-1);
const randW= n => { const w = Array.from({length:n},Math.random);
                    const s = w.reduce((a,b)=>a+b,0); return w.map(v=>v/s); };
const pMean= (w,mu)=>w.reduce((s,wi,i)=>s+wi*mu[i],0);
const pVar = (w,S)=>w.reduce((s,wi,i)=>s+wi*
                   w.reduce((ss,wj,j)=>ss+wj*S[i][j],0),0);

/* ===== 3. Botón Optimizar ========================================= */
optimizeBtn.addEventListener('click', async () => {
  optimizeBtn.disabled = true;
  try {
    /* 3.1 descarga paralela */
    const sets = await Promise.all(assets.map(t => fetchHistory(t)));

    /* 3.2 alineación */
    const rets  = sets.map(toReturns);
    const minL  = Math.min(...rets.map(r => r.length));
    const aligned = rets.map(r => r.slice(-minL));

    /* 3.3 µ y Σ (anualizados según frecuencia) */
    const freq  = document.getElementById('freq-select').value;
    const ann   = { d:252, w:52, m:12 }[freq] || 252;

    const mu = aligned.map(mean).map(m => m * ann);
    const Σ  = aligned.map((r,i)=>aligned.map((c,j)=>
                 cov(r,c, mu[i]/ann, mu[j]/ann) * ann));

    /* 3.4 simulación Monte-Carlo */
    const rf = parseFloat(document.getElementById('rf-input').value)/100;
    const sims = [];
    for (let k = 0; k < 5000; k++) {
      const w  = randW(mu.length);
      const r  = pMean(w, mu);
      const sd = Math.sqrt(pVar(w, Σ));
      sims.push({ w, r, sd, sh: (r - rf) / sd });
    }
    const minV   = sims.reduce((a,b)=>a.sd < b.sd ? a : b);
    const maxS   = sims.reduce((a,b)=>a.sh > b.sh ? a : b);
    const alpha  = riskRange.value / 100;
    const wStar  = minV.w.map((w,i)=>w*(1-alpha)+maxS.w[i]*alpha);
    const rStar  = pMean(wStar, mu);
    const sdStar = Math.sqrt(pVar(wStar, Σ));

    /* 3.5 gráfico */
    document.getElementById('efficient-frontier-chart').innerHTML = '';
    Plotly.newPlot('efficient-frontier-chart', [
      { x:sims.map(p=>p.sd*100), y:sims.map(p=>p.r*100),
        mode:'markers', marker:{size:4,opacity:.4}, name:'Portafolios' },
      { x:[minV.sd*100], y:[minV.r*100], mode:'markers+text',
        text:['Min Var'], marker:{color:'green',size:10} },
      { x:[maxS.sd*100], y:[maxS.r*100], mode:'markers+text',
        text:['Máx Sharpe'], marker:{color:'red',size:10} },
      { x:[sdStar*100], y:[rStar*100], mode:'markers+text',
        text:['Tu elección'], marker:{color:'gold',size:12,symbol:'star'} }
    ], {
      title:'Frontera eficiente (anualizada)',
      xaxis:{ title:'Riesgo σ (%)' },
      yaxis:{ title:'Retorno μ (%)' }
    });

    /* 3.6 métricas */
    document.getElementById('portfolio-return').textContent =
        (rStar*100).toFixed(2)+' %';
    document.getElementById('portfolio-risk').textContent  =
        (sdStar*100).toFixed(2)+' %';

    /* 3.7 lista de pesos */
    const total = parseFloat(amountInput.value) || 0;
    document.getElementById('total-investment-display').textContent =
      `Distribución óptima de activos (${total.toLocaleString('en-US',
        {style:'currency',currency:'USD',minimumFractionDigits:0})} invertidos):`;

    const ul = document.getElementById('portfolio-weights');
    ul.innerHTML = '';
    wStar.forEach((w,i) => {
      const usd = w * total;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="asset-name">${assets[i]}</span><span></span>
        <span class="asset-weight">${(w*100).toFixed(2)} %</span>
        <span class="asset-amount">${usd.toLocaleString('en-US',
          {style:'currency',currency:'USD',minimumFractionDigits:0})}</span>`;
      ul.appendChild(li);
    });

    console.log('µ:',mu,'Σ:',Σ,'Tu portfolio:',wStar);
  } catch (err) {
    alert(err.message);
    console.error(err);
  } finally {
    optimizeBtn.disabled = false;
  }
});

// --- refs rápidas a la UI ---
const ui = {
  btn5      : document.getElementById('btn-5y'),
  btn10     : document.getElementById('btn-10y'),
  btnCustom : document.getElementById('btn-custom'),
  box       : document.getElementById('custom-date-box'),
  start     : document.getElementById('startDate'),
  end       : document.getElementById('endDate'),
  apply     : document.getElementById('applyDates'),
  label     : document.getElementById('rangeLabel')
};

// --- estado global mínimo ---
const state = { years:null, custom:null };

// --- helpers ---
function clearActive() {
  [ui.btn5, ui.btn10, ui.btnCustom].forEach(b=>b.classList.remove('active'));
  ui.box.style.display = 'none';
}

function refreshRange() {
  const today = new Date();
  let start, end = today.toISOString().slice(0,10);   // "YYYY-MM-DD"

  if (state.custom) {
    start = state.custom.start;
    end   = state.custom.end;
    ui.label.textContent = `De ${start} a ${end}`;
  } else {
    start = new Date(today.setFullYear(today.getFullYear() - state.years))
              .toISOString().slice(0,10);
    ui.label.textContent = `Últimos ${state.years} años`;
  }

  // 🔁 tu función original para traer datos y repintar el gráfico
  fetchAndPlot(start, end);
}

// --- listeners ---
ui.btn5.addEventListener('click', ()=>{
  clearActive(); ui.btn5.classList.add('active');
  state.years = 5;  state.custom = null;
  refreshRange();
});

ui.btn10.addEventListener('click', ()=>{
  clearActive(); ui.btn10.classList.add('active');
  state.years = 10; state.custom = null;
  refreshRange();
});

ui.btnCustom.addEventListener('click', ()=>{
  clearActive(); ui.btnCustom.classList.add('active');
  ui.box.style.display = 'block';
});

ui.apply.addEventListener('click', ()=>{
  state.custom = { start: ui.start.value, end: ui.end.value };
  refreshRange();
});
