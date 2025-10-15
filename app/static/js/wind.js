console.log("wind.js loaded");

$(function() {
    getWindData();
});

function getWindData() {
    $.getJSON("data/wind.json", function(data) {
        $('#loading-msg').hide();

        console.log('Wind data loaded:', data);
        updateWindGraph(data);
        updateDirectionGraph(data);
        updateDirectionGraph2(data);
    });
}

function subtractHours(ms, hours) {
  return ms - hours * 60 * 60 * 1000;
}

function updateWindGraph(data) {

    let avgs = data?.avgs ?? [];
    let maxs = data?.maxs ?? [];
    // let dirs = {{ data["dirs"] | tojson }}; // ignored for now

    // Convert to Chart.js point format {x: Date, y: Number}
    const avgPoints = avgs.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.value * 0.33/3.6 }));
    const maxPoints = maxs.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.value * 0.33/3.6 }));

    // { method: 'ema', halfLifeMinutes: 8 }
    //const avgSmooth = smoothPoints(avgPoints, { method: 'gaussian', bandwidthMinutes: 4 });
    //const maxSmooth = smoothPoints(maxPoints, { method: 'gaussian', bandwidthMinutes: 4 });

    const avgGrid = bucketAggregate(avgPoints, { minutes: 15, mode: 'mean' });
    const maxGrid = bucketAggregate(maxPoints, { minutes: 15, mode: 'max' });

    //const avgSmooth = smoothPoints(avgPoints, { method: 'moving', windowMinutes: 1 });
    //const maxSmooth = smoothPoints(maxPoints, { method: 'moving', windowMinutes: 1 });

    const ctx = document.getElementById('wind-chart').getContext('2d');

    // Vertical lines at local midnights across the visible x-range
    const midnightLinesPlugin = {
        id: 'midnightLines',
        afterDraw: (chart) => {
        const { ctx, scales: { x }, chartArea } = chart;
        if (!x || x.min == null || x.max == null) return;

        // Start from first midnight >= x.min
        const first = new Date(x.min);
        first.setHours(0,0,0,0);
        if (first.getTime() < x.min) first.setDate(first.getDate() + 1);

        for (let t = new Date(first); t.getTime() <= x.max; t.setDate(t.getDate() + 1)) {
            const xPos = x.getPixelForValue(t);
            if (xPos >= chartArea.left && xPos <= chartArea.right) {
            ctx.save();
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(xPos, chartArea.top);
            ctx.lineTo(xPos, chartArea.bottom);
            ctx.stroke();
            ctx.restore();
            }
        }
        }
    };
    
    const now = Date.now();
    const yMax = Math.max(...maxPoints.map(p => p.y));

    const verticalLine = [
      { x: now, y: 0 },
      { x: now, y: yMax } // adjust to your y-axis max range
    ];


    console.log("avgGrid", avgGrid)

    //minX = avgPoints[avgPoints.length-1].x
    //let maxX = avgPoints[0].x
    //let minX = subtractHours(maxX, 3);
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
        // no labels; each dataset has x/y
        datasets: [
            {
              label: 'Now',
              data: verticalLine,
              borderColor: 'red',
              borderWidth: 2,
              pointRadius: 0,
              borderDash: [5, 5], // dashed line (optional)
              fill: false
            },
            {
                label: "povprečna",
                data: avgGrid,
                borderWidth: 2,
                avgGrid: 0,
                tension: 0.3,
                pointRadius: 2,
                borderColor: "#36a2eb", 
                backgroundColor: "#9ad0f5"
            },
            {
                label: "maksimalna",
                data: maxGrid,
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 2,
                borderColor: "#ff6384", 
                backgroundColor: "#ffb1c1"
            },
            {
                label: "all",
                data: avgPoints,
                borderWidth: 2,
                avgGrid: 0,
                tension: 0,
                pointRadius: 0,
                hidden: true,
                borderColor: "#36a2eb30", 
                backgroundColor: "#9ad0f530"
            },
                        {
                label: "all max",
                data: maxPoints,
                borderWidth: 2,
                avgGrid: 0,
                tension: 0,
                pointRadius: 0,
                hidden: true,
                borderColor: "#ff638430", 
                backgroundColor: "#ffb1c130"
            },
        ]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom',      
                    align: 'center',
                    labels: { usePointStyle: true, padding: 12 }
                }
            },
            responsive: true,
            parsing: false,           // we already provide {x,y}
            normalized: true,         // better perf for time scale
            scales: {
                x: {
                  type: 'time',
                  time: { displayFormats: { minute: 'HH:mm' } },
                  ticks: {
                    callback: (val) => {
                      const d = new Date(val);
                      if(d.getMinutes() % 60 != 0) return null; // display only timestamps each 30 minutes 
                      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    },
                  },
                },
                y: {
                    beginAtZero: true,
                    position: 'left',
                },
            }
        },
        //plugins: [midnightLinesPlugin]
    });
}


function updateDirectionGraph(data) {

    let dir = data?.dirs ?? [];

    const dirPoints = dir.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.angle }));
    //const dirPoints2 = dir.map(d => ({ x: new Date(d.timestamp).getTime(), y: Math.round(d.value/360*8) }));

    const dirGrid = bucketAggregate(dirPoints, { minutes: 15, mode: 'mode' });
    //const dirGrid2 = bucketAggregate(dirPoints, { minutes: 1, mode: 'last' });

    
    //const dirGrid2 = dirGrid.map(d => ({ x: d.x, y: d.y + 1 }));

    const ctx = document.getElementById('dir-chart').getContext('2d');
    //const directions = ["↑", "↖", "←", "↙", "↓", "↘", "→", "↗"];
    const directions = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ", " "];
    //const directions = ["S", "SZ", "Z", "JZ", "J", "JV", "V", "SV", " "];
    //minX = avgPoints[avgPoints.length-1].x
    //let maxX = avgPoints[0].x
    //let minX = subtractHours(maxX, 3);
    const barWidthMs = 15 * 60 * 1000; // for x-minute spacing
    const now = Date.now();
    const yMin = 0.01;
    const yMax = 8; // same as your y-axis max

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
        // no labels; each dataset has x/y
        datasets: [
         /* {
              label: "smer",
              data: dirGrid,
              borderWidth: 2,
          },*/
          {
              label: "smer",
              data: dirGrid,
              borderWidth: 2,
              borderColor: "#4cc0c0", 
              backgroundColor: "#a5dfdf"
          },
          {
            label: 'Now',
            type: 'line',
            data: [
              { x: now, y: yMin },
              { x: now, y: yMax }
            ],
            borderColor: 'red',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
        },
        options: {
          plugins: {
              legend: {
                  position: 'bottom',        
                  align: 'center',
                  labels: { usePointStyle: true, padding: 12 }
              },
              datalabels: {
                anchor: 'end',        // position at end (top)
                align: 'top',         // align label above bar
                color: '#333',
                font: {
                  weight: 'bold',
                  size: 10
                },
                formatter: function(value, context) {
                  console.log(value.y, value.y == 0.1)
                  return value.y == 0.01? "" : directions[value.y]
                }
              },
              legend: {
                display: false
              }
          },
          responsive: true,
          parsing: false,           // we already provide {x,y}
          normalized: true,         // better perf for time scale
          scales: {
              x: {
                type: 'time',
                offset: false,
                time: { displayFormats: { minute: 'HH:mm' } },
                grid: { offset: false },
ticks: {
  callback: (val) => {
    const d = new Date(val);
    const now = Date.now();
    const diff = Math.abs(val - now);

    // if the tick is within ±5 minutes of "now"
    if (diff < 0.5 * 60 * 1000) return "Now";

    // only show labels every full hour
    if (d.getMinutes() % 60 !== 0) return null;

    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
},
                min: Math.min(...dirGrid.map(p => p.x)) - barWidthMs / 2,
                max: Math.max(now) + barWidthMs / 2,
              },
              y: {
                  beginAtZero: true,
                  position: 'left',
                  max: 8,
                  ticks: {
                    stepSize: 1,
                    callback: (value) => directions[value] || value
                  },
              },
          }
        },
        plugins: [ChartDataLabels]
    });
}

function updateDirectionGraph2(data) {

    let dir = data?.dirs ?? [];

    const dirPoints = dir.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.value/360 * 8 }));

    const ctx = document.getElementById('dir-chart2').getContext('2d');

    //minX = avgPoints[avgPoints.length-1].x
    //let maxX = avgPoints[0].x
    //let minX = subtractHours(maxX, 3);
    const chart = new Chart(ctx, {
        type: 'scatter',
        data: {
        // no labels; each dataset has x/y
        datasets: [
         /* {
              label: "smer",
              data: dirGrid,
              borderWidth: 2,
          },*/
          {
              label: "smer",
              data: dirPoints,
              borderWidth: 2,
          },

        ]
        },
        options: {
          plugins: {
              legend: {
                  position: 'bottom',        
                  align: 'center',
                  labels: { usePointStyle: true, padding: 12 }
              },
              datalabels: {
                anchor: 'end',        // position at end (top)
                align: 'top',         // align label above bar
                color: '#333',
                font: {
                  weight: 'bold'
                },
                formatter: function(value, context) {
                  return value.y
                }
              },
              legend: {
                display: false
              }
          },
          responsive: true,
          parsing: false,           // we already provide {x,y}
          normalized: true,         // better perf for time scale
          scales: {
              x: {
                  //min: minX,
                  //max: maxX,
                  type: 'timeseries',
                  time: {
                      unit: 'minute',
                      displayFormats: {
                      minute: 'HH:mm'   
                      },
                      tooltipFormat: 'HH:mm:ss' 
                  },
                  ticks: {
                      autoSkip: true,
                      maxTicksLimit: 24
                  }
              },
              y: {
                  beginAtZero: true,
                  position: 'left',
                  max: 8,
              },
          }
        },
        //plugins: [ChartDataLabels]
    });
}



function refreshGraph() {
    const field1 = document.getElementById("field-select").value;
    const field2 = document.getElementById("field-select2").value;

    chart.data.datasets = [
    {
        label: field1,
        data: data.map(d => d[field1]),
        yAxisID: 'y',
        borderColor: 'blue',
        backgroundColor: 'blue',
        borderWidth: 2
    }
    ];

    if (field2 && field2 !== "") {
    chart.data.datasets.push({
        label: field2,
        data: data.map(d => d[field2]),
        yAxisID: 'y2',
        borderColor: 'red',
        backgroundColor: 'red',
        borderWidth: 2
    });
    }

    chart.update();
}


// --- 1) Time-aware Exponential Moving Average (zero-lag via forward+back) ---
function smoothEMA(points, { halfLifeMinutes = 5 } = {}) {
  if (!points || points.length === 0) return [];
  const th = halfLifeMinutes * 60 * 1000;      // half-life in ms
  const LN2 = Math.log(2);

  // forward pass
  const f = new Array(points.length);
  f[0] = { x: points[0].x, y: points[0].y };
  for (let i = 1; i < points.length; i++) {
    const dt = Math.max(0, points[i].x - points[i - 1].x);
    const alpha = 1 - Math.exp(-LN2 * dt / th);
    const y = f[i - 1].y + alpha * (points[i].y - f[i - 1].y);
    f[i] = { x: points[i].x, y };
  }

  // backward pass (to reduce phase lag)
  const b = new Array(points.length);
  const n = points.length;
  b[n - 1] = { x: points[n - 1].x, y: points[n - 1].y };
  for (let i = n - 2; i >= 0; i--) {
    const dt = Math.max(0, points[i + 1].x - points[i].x);
    const alpha = 1 - Math.exp(-LN2 * dt / th);
    const y = b[i + 1].y + alpha * (points[i].y - b[i + 1].y);
    b[i] = { x: points[i].x, y };
  }

  // average forward/backward for zero-ish lag
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    out[i] = { x: points[i].x, y: (f[i].y + b[i].y) / 2 };
  }
  return out;
}

// --- 2) Time-window Moving Average (minutes) ---
function smoothMovingAvg(points, { windowMinutes = 10 } = {}) {
  if (!points || points.length === 0) return [];
  const W = windowMinutes * 60 * 1000;
  const out = new Array(points.length);
  let sum = 0, left = 0;

  for (let i = 0; i < points.length; i++) {
    const xi = points[i].x;
    sum += points[i].y;
    while (xi - points[left].x > W) {
      sum -= points[left].y;
      left++;
    }
    const count = i - left + 1;
    out[i] = { x: xi, y: sum / count };
  }
  return out;
}

function resampleLinear(points, { minutes = 5 } = {}) {
  if (!points || points.length === 0) return [];
  const W = minutes * 60 * 1000;

  // grid bounds
  const x0 = Math.floor(points[0].x / W) * W;
  const x1 = Math.ceil(points[points.length - 1].x / W) * W;

  const out = [];
  let i = 0;
  for (let x = x0; x <= x1; x += W) {
    // advance i so that points[i].x <= x <= points[i+1].x
    while (i + 1 < points.length && points[i + 1].x < x) i++;

    if (i + 1 >= points.length) {
      out.push({ x, y: points[points.length - 1].y });
    } else {
      const p0 = points[i];
      const p1 = points[i + 1];
      const t = (x - p0.x) / (p1.x - p0.x);
      const y = p0.y + t * (p1.y - p0.y);
      out.push({ x, y });
    }
  }
  return out;
}

function bucketAggregate(points, { minutes = 5, mode = 'last' } = {}) {
  if (!points || points.length === 0) return [];
  const W = minutes * 60 * 1000;

  const startOfDay = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime() + minutes/2*60*1000; // shift on the middle of the bucket 
  };

  const day0 = startOfDay(points[0].x);
  const buckets = new Map();

  for (const p of points) {
    const k = day0 + Math.floor((p.x - day0) / W) * W + W / 2;
    let b = buckets.get(k);
    if (!b) {
      b = { ys: [], first: p, last: p, min: p, max: p };
      buckets.set(k, b);
    }
    b.ys.push(p.y);
    if (p.x < b.first.x) b.first = p;
    if (p.x > b.last.x) b.last  = p;
    if (p.y < b.min.y)   b.min   = p;
    if (p.y > b.max.y)   b.max   = p;
  }

  const median = (arr) => {
    const n = arr.length;
    if (n === 0) return NaN;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(n / 2);
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const modeValue = (arr) => {
    if (arr.length === 0) return NaN;
    const counts = new Map();
    for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
    let maxCount = 0, mostCommon = arr[0];
    for (const [v, c] of counts.entries()) {
      if (c > maxCount) {
        maxCount = c;
        mostCommon = v;
      }
    }
    return mostCommon;
  };

  const out = [];
  for (const [k, b] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    let y;
    switch (mode) {
      case 'first':  y = b.first.y; break;
      case 'last':   y = b.last.y;  break;
      case 'min':    y = b.min.y;   break;
      case 'max':    y = b.max.y;   break;
      case 'median': y = median(b.ys); break;
      case 'mode':   y = modeValue(b.ys); break;
      case 'mean':
      default:
        y = b.ys.reduce((s, v) => s + v, 0) / b.ys.length;
        break;
    }
    out.push({ x: Number(k), y });
  }
  return out;
}


// --- 3) Gaussian kernel smoother with time bandwidth (minutes) ---
function smoothGaussian(points, { bandwidthMinutes = 5 } = {}) {
  if (!points || points.length === 0) return [];
  const sigma = bandwidthMinutes * 60 * 1000;
  if (sigma <= 0) return points.slice();

  const out = new Array(points.length);
  let L = 0, R = 0; // sliding window bounds

  for (let i = 0; i < points.length; i++) {
    const xi = points[i].x;
    // keep a ~6σ span (±3σ)
    const leftBound = xi - 3 * sigma;
    const rightBound = xi + 3 * sigma;

    while (L < points.length && points[L].x < leftBound) L++;
    if (R < L) R = L;
    while (R < points.length && points[R].x <= rightBound) R++;

    let wsum = 0, ysum = 0;
    for (let j = L; j < R; j++) {
      const dt = points[j].x - xi;
      const w = Math.exp(-0.5 * (dt * dt) / (sigma * sigma));
      wsum += w;
      ysum += w * points[j].y;
    }
    out[i] = { x: xi, y: wsum > 0 ? ysum / wsum : points[i].y };
  }
  return out;
}

// --- Convenience wrapper ---
function smoothPoints(points, opts = { method: 'ema', halfLifeMinutes: 8 }) {
  const method = (opts.method || 'ema').toLowerCase();
  if (method === 'gaussian') return smoothGaussian(points, opts);
  if (method === 'moving' || method === 'ma') return smoothMovingAvg(points, opts);
  return smoothEMA(points, opts); // default
}
