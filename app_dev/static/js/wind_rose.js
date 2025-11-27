
let pctNodes;
let hist; 

$(function() {
  pctNodes = drawRoseBarGraphLegend(unit);
  loadWindRoseData();
});


function changeUnitsBarGraphLegend(unit) {
  pctNodes = drawRoseBarGraphLegend(unit); 
  drawLabelBarHeights(hist);
}

function showWindRoseDataLoading(isLoading) {
  console.log("Show loading:", isLoading);
  if(isLoading) {
    $('#wind-rose-loading').show();
  } else {
    $('#wind-rose-loading').hide();
  }
}

let all_wind_data;

function loadWindRoseData() {
  showWindRoseDataLoading(true);
  $.getJSON(`data/wind_all.json?duration=12`, function(data) {
      console.log('All wind data loaded:', data);
      all_wind_data = data;
      renderWindRose(data);
      showWindRoseDataLoading(false);
  });

}

function renderWindRose(data) {
  initRoseParams();

  result = combineAndInterpolate( data["dirs"], data["winds"]);
  console.log(result);
  console.log("Accessing samples");

  SAMPLES = result.map(({ timestamp: t, valueA: d, valueB: s }) => ({ t:t, dir: d, speed: s*0.33/3.6 }));
  render();

  const timeSlider = $("#time-slider");
  timeSlider.change(() => {
    const minutes = timeSlider.val();
    console.log("timeSlider: ", minutes)
    $("#time-value").html("min: " + minutes);
    
    const dur = 20 * 60 * 1000;     // duration of the interval size 
    const shift = minutes * 60 * 1000;
    const lastData = new Date(result[0].timestamp).getTime();
    const start = lastData - shift - dur;
    const end = lastData - shift;
    console.log(end, start);

    SAMPLES = result
    .filter(({ timestamp }) => {
      const ts = new Date(timestamp).getTime();
      return start <= ts && ts <= end;
    })
    .map(({ timestamp: t, valueA: d, valueB: s }) => ({
      t,
      dir: d,
      speed: s,
    }));

    console.log("New results length:", SAMPLES.length);
    render();
  })
}


function interpolate(x1, y1, x2, y2, x) {
  if (x2 === x1) return y1; // prevent division by zero
  return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
}

/**
 * Combines two datasets by aligning timestamps from the first dataset
 * and interpolating values from the second dataset.
 * @param {Array<{timestamp: string, value: number}>} dataA - base dataset (reference timestamps)
 * @param {Array<{timestamp: string, value: number}>} dataB - dataset to interpolate from
 * @returns {Array<{timestamp: string, valueA: number, valueB: number}>}
 */
function combineAndInterpolate(dataA, dataB) {
  // Convert timestamps to milliseconds and ensure sorted order
  const sortedB = dataB
    .map(d => ({ t: new Date(d.timestamp).getTime(), v: d.value }))
    .sort((a, b) => a.t - b.t);

  return dataA.map(a => {
    const tA = new Date(a.timestamp).getTime();

    // Find surrounding points in dataB
    let i = sortedB.findIndex(d => d.t > tA);
    if (i === -1) i = sortedB.length; // all earlier
    if (i === 0) return { timestamp: a.timestamp, valueA: a.value, valueB: sortedB[0].v };

    const prev = sortedB[i - 1];
    const next = sortedB[i] || prev;

    const vInterp = interpolate(prev.t, prev.v, next.t, next.v, tA);
    return { timestamp: a.timestamp, valueA: a.value, valueB: vInterp };
  });
}

console.log("Staring wind_rose.js");

console.log("Declared samples");



// ----------------- Konfiguracija -----------------
// Zgornje meje razredov hitrosti (m/s). Zadnji razred bo "> zadnja_meja".
const SPEED_BINS = [1, 2, 4, 6, 8, 10];
// Barve za vse razrede (bins.length + 1). 7 barv.
const COLORS = [
  'rgb(31, 105, 193)', 
  'rgb(55, 176, 123)',
  'rgb(83, 222, 71)', 
  'rgb(170, 255, 58)',  
  'rgb(255, 235, 58)', 
  'rgb(255, 176, 58)', 
  'rgb(249, 37, 37)'
];


// ----------------- Pomožne funkcije -----------------
function binIndexForSpeed(v){
  for(let i=0;i<SPEED_BINS.length;i++) if (v <= SPEED_BINS[i]) return i;
  return SPEED_BINS.length; // indeks za "> zadnja meja"
}


function buildHistogram(samples, sectorCount){
  const perSector = Array.from({length:sectorCount}, () => new Array(SPEED_BINS.length+1).fill(0));
  let calm = 0;
  for(const {dir, speed} of samples){
    if (speed <= 0) { calm++; continue; }
    const sIdx = binIndexForSpeed(speed);
    const sector = Math.floor(((dir%360)+360)%360 / (360/sectorCount));
    perSector[sector][sIdx]++;
  }
  const total = samples.length;
  const sectorTotals = perSector.map(a => a.reduce((x,y)=>x+y,0));
  const pct = perSector.map(a => a.map(v => v*100/total));
  const pctTotals = sectorTotals.map(v => v*100/total);
  const calmPct = calm*100/total;
  return { perSector, pct, pctTotals, calmPct, total };
}

// ----------------- Risanje na Canvas -----------------


function drawRings(cx, cy, r, steps){
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ring') || '#61687aff';
  ctx.lineWidth = 2;
  for(let i=1;i<=steps;i++){
    ctx.beginPath(); ctx.arc(cx, cy, r*i/steps, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

function polarToXY(cx, cy, radius, angleRad){
  return [cx + radius*Math.sin(angleRad), cy - radius*Math.cos(angleRad)];
}

function drawWithPadding(ctx, pad, draw) {
  const W = ctx.canvas.width, H = ctx.canvas.height;

  ctx.save();
  // Clip to the inner rect so nothing gets cut off at the edges
  ctx.beginPath();
  ctx.rect(pad, pad, W - 2*pad, H - 2*pad);
  //ctx.clip();

  // Map the original [0..W]x[0..H] into the inner rect
  ctx.setTransform(
    (W - 2*pad) / W, 0,
    0, (H - 2*pad) / H,
    pad, pad
  );

  draw();
  ctx.restore();
}

function drawRose(canvas, samples){
  const sectorCount = 24; // number of devisors 
  const calmInner = 6; // inner circles  
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const cx = W/2, cy = H/2, R = Math.min(W,H)*0.43;
  hist = buildHistogram(samples, sectorCount);

  const maxPct = Math.max(12, Math.ceil(Math.max(...hist.pctTotals)));
  drawRings(cx, cy, R, 6);

  // Kompas
  ctx.save();
  ctx.font = '700 28px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8990aaff'; // text color

  // helper to draw text with background
  function drawLabelWithBg(text, x, y) {
    const padding = 10; // px of space around text
    const metrics = ctx.measureText(text);
    const r = Math.max(metrics.width, 28) / 2 + padding;

    // background circle
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.arc(x, y-1, r, 0, Math.PI * 2);
    ctx.fill();

    // text on top
    ctx.fillStyle = '#8990aa';
    ctx.fillText(text, x, y);
  }

  // Draw 4 directions
  drawLabelWithBg('S', cx, cy - (R + 36));
  drawLabelWithBg('V', cx + (R + 36), cy);
  drawLabelWithBg('J', cx, cy + (R + 36));
  drawLabelWithBg('Z', cx - (R + 36), cy);

  // Mirno – notranji krog
  const rCalm = R * (calmInner/100);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rCalm, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgb(168, 168, 168)'; // border color
  ctx.lineWidth = 5;                  // thickness of ring
  ctx.stroke();
  ctx.restore();

  // Izriši sektorje
  const dTheta = (2*Math.PI)/sectorCount;
  const offset = (2*Math.PI)/(2*sectorCount);
  const scale = R / maxPct; // px na %

  const stacks = hist.pct.map(arr => {
    const out = []; let acc=0; 
    for(let i=0;i<arr.length;i++){ out.push([acc, acc+arr[i]]); acc+=arr[i]; }
    return out;
  });

  for(let s=0;s<sectorCount;s++){
    const a0 = ((s)*dTheta) - offset;
    const a1 = ((s+1)*dTheta)-offset;

    for(let b=0;b<=SPEED_BINS.length;b++){
      const [p0,p1] = stacks[s][b];
      if (p1<=p0) continue;
      const r0 = rCalm + p0*scale;
      const r1 = rCalm + p1*scale;
      ctx.beginPath();
      const [x0,y0] = polarToXY(cx, cy, r0, a0);
      const [x1,y1] = polarToXY(cx, cy, r0, a1);
      const [x2,y2] = polarToXY(cx, cy, r1, a1);
      const [x3,y3] = polarToXY(cx, cy, r1, a0);
      ctx.moveTo(x0,y0);
      ctx.lineTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.lineTo(x3,y3);
      ctx.closePath();
      ctx.fillStyle = COLORS[b % COLORS.length];
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // osne črte
  ctx.save();
  ctx.strokeStyle = 'rgba(180, 190, 216, 0.57)'; ctx.lineWidth=2;
  for(let s=0;s<sectorCount;s++){
    const a = (s+0.5)*dTheta;
    ctx.beginPath();
    const [x0,y0] = polarToXY(cx, cy, rCalm, a);
    const [x1,y1] = polarToXY(cx, cy, R, a);
    ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
  }
  ctx.restore();

  // napis mirno % v sredini
  /*
  ctx.save();
  ctx.fillStyle = '#dce5ff';
  ctx.font = '600 22px system-ui';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(hist.calmPct.toFixed(1)+'%', cx, cy);
  ctx.restore();
  */

  // Interaktivni tooltip
  /*
  canvas.onmousemove = (ev)=>{
    debugger;
    const rect = canvas.getBoundingClientRect();
    const mx = (ev.clientX-rect.left)* (canvas.width/rect.width);
    const my = (ev.clientY-rect.top) * (canvas.height/rect.height);
    const dx = mx-cx, dy = my-cy;
    const r = Math.hypot(dx,dy), ang = (Math.atan2(dx,-dy)+2*Math.PI)%(2*Math.PI);

    if (r < rCalm || r > R){ tooltip.style.opacity = 0; return; }
    const sector = Math.floor(ang/dTheta);
    const pctStack = stacks[sector];
    const p = (r - rCalm)/scale; // v %
    let bin = pctStack.findIndex(([p0,p1]) => p>=p0 && p<=p1);
    if (bin<0) { tooltip.style.opacity = 0; return; }

    const dirCenter = (sector)*(360/sectorCount);
    const pctVal = (pctStack[bin][1]-pctStack[bin][0]);
    const last = SPEED_BINS[SPEED_BINS.length-1];
    const speedLabel = bin===0 ? `≤ ${SPEED_BINS[0].toFixed(2)}`
      : (bin<=SPEED_BINS.length-1 ? `${SPEED_BINS[bin-1].toFixed(2)}–${SPEED_BINS[bin].toFixed(2)}`
                                  : `> ${last.toFixed(2)}`);

    tooltip.textContent = `Smer ${dirCenter.toFixed(0)}°, ${speedLabel} m/s → ${pctVal.toFixed(2)}%`;
    tooltip.style.left = ev.clientX-100 + 'px';
    tooltip.style.top  = ev.clientY-200 + 'px';
    tooltip.style.opacity = 1;
  };
  canvas.onmouseleave = ()=> tooltip.style.opacity = 0;
  */

  // Draw border lines (rectangle around the whole canvas)
  /*
  ctx.beginPath();
  ctx.moveTo(0, 0);  
  ctx.lineTo(canvas.width, 0);                    // top
  ctx.lineTo(canvas.width, canvas.height);  // right
  ctx.lineTo(0, canvas.height);                   // bottom
  ctx.closePath();                                      // left
  ctx.stroke();
  */

  // ------------ Legenda (POPOLNOMA skladna z bin-i) ------------
  drawLabelBarHeights(hist);
}

const zero_bar_height = 6; // 6 % height for the bars that have 0%

function drawLabelBarHeights(hist) {
  // Izračun celotnega % po binu (čez vse sektorje)
  const totalsPerBin = Array(SPEED_BINS.length+1).fill(0);
  for(const sector of hist.pct){ sector.forEach((v,i)=> totalsPerBin[i]+=v); }

  
  totalsPerBin.unshift(hist.calmPct); // add calm procentage to the totals values for the lables
  let maxLabelValue = Math.max(...totalsPerBin);
  if(!maxLabelValue) maxLabelValue = 100;
  totalsPerBin.forEach((v,i)=>{ 
    proc_value = pctNodes[i].find(".legend-value");
    chip = pctNodes[i].find(".chip");
    if (!v) v = 0;
    if (proc_value) proc_value.text(v.toFixed(0)+'%'); 
    if (chip) chip.css('height', Math.round(((v/maxLabelValue)*(100-zero_bar_height)+zero_bar_height)) +'%');
    //if (chip) chip.css('height', proc_to_height(v / maxLabelValue) +'px');
  });
}

function drawRoseBarGraphLegend(unit) {
  function getDisplaySpeedValue(value) {
    if(unit === "kmh") {
      return Math.round(value*3.6);
    } else {
      if(Math.floor(value * 10) % 10 == 0) return value.toFixed(0);
      else return value.toFixed(1);
    }

  }

  function buildLabels(bins){
    const labels = [];
    let prevLabel = "0";
    for (let i=0;i<bins.length;i++) {
      upperLabel = getDisplaySpeedValue(bins[i]);
      labels.push(`${prevLabel} – ${upperLabel}`);
      prevLabel = upperLabel;
    }
    labels.push(`${getDisplaySpeedValue(bins[bins.length-1])} +`);
    return labels;
  }

  const displayUnit = unit==="ms"? "m/s" : "km/h";
  const legend = document.getElementById('legend');
  legend.innerHTML = `
        <div class="legend-item">
            <span class="" style="font-size: 14px; padding-bottom:4px; color:#848484;padding-right: 5px;">%</span>
          <span class="" style="font-size: 12px; color:#848484;padding-right: 5px;">${displayUnit}</span>
        </div>
      `;

  const labels = buildLabels(SPEED_BINS); // dolžina = bins+1
  labels.unshift(getDisplaySpeedValue(0)); // add the 0 m/s for the first speed 
  let colors = ["black", ...COLORS]; // add the black color for the first speed 
  
  const pctNodes = $.map(labels, function(lab, i) {
    let item = $(`
        <div class="legend-item">
          <div class="chip-holder relative">
            <div class="chip " style="height:${zero_bar_height}%; background: ${colors[i % colors.length]};">
              <div class="legend-value">.</div>
            </div>
          </div>
          <div class="legend-label">${lab}</div>
        </div>

      `);

      $(legend).append(item);

      // return DOM node for the value so you can update it later
      return item;
  });

  return pctNodes;
}



let canvas, ctx, tooltip;
// ----------------- UI -----------------
function initRoseParams() {
  canvas = document.getElementById('wind-rose');
  ctx = canvas.getContext('2d');
  tooltip = document.getElementById('tooltip');
}

let result; // filtered data for the rose wind diagram

let delay = 0; // minutes, how much from the last value is the window showed 
let windowSize = 20; // minutes, how long of the duration is included in the rose data
$(function() {
  windowSize = $('#rose-duration-select').val();
  $('#rose-delay-value').text(delay); // display the default value 

  $('#rose-duration-select').on('change', function () {
    windowSize = parseInt($(this).val(), 10);
    render();
  });

  $('#rose-dec-delay').on('click', function () {
    delay = Math.max(0, delay - Math.floor(windowSize / 2));
    $('#rose-delay-value').text(delay); 
    render();
  });

  $('#rose-inc-delay').on('click', function () {
    const MAX_DELAY = 60*24; // 24 hours 
    delay = Math.min(MAX_DELAY, delay + Math.floor(windowSize / 2));
    $('#rose-delay-value').text(delay); 
    render();
  });
});

function ms_to_time(ms_time) {
  const date = new Date(ms_time);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function roundToWholeMinutes(timestamp, round=10 * 60 * 1000) {
  const lastData = new Date(timestamp).getTime();
  // Round *up* to the next round-minute multiple
  const rounded = Math.ceil(lastData / round) * round;

  return new Date(rounded).getTime();
}

function render() {
  console.log("Redrawing with window size:", windowSize, "and delay:", delay);

  const dur = windowSize * 60 * 1000;     // duration of the interval size 
  const shift = delay * 60 * 1000;
  const lastData = roundToWholeMinutes(result[0].timestamp);
  const start = lastData - shift - dur;
  const end = lastData - shift;
  console.log(end, start);

  $("#rose-data-start").text(ms_to_time(start));
  $("#rose-data-end").text(ms_to_time(end));

  SAMPLES = result
    .filter(({ timestamp }) => {
      const ts = new Date(timestamp).getTime();
      return start <= ts && ts <= end;
    })
    .map(({ timestamp: t, valueA: d, valueB: s }) => ({
      t,
      dir: d,
      speed: s,
    }));

  console.log("New results length:", SAMPLES.length);
  
  drawWithPadding(ctx, 20, ()=>{
    drawRose(canvas, SAMPLES); 
  })
}






