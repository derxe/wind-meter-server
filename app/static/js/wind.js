console.log("wind.js v2 loaded");

let unit="ms"
let displayDuration;
let avgPoints;
$(function() {
    displayDuration = $('#select-display-duration').val();
    console.log("Display duration:", displayDuration);
    $('#select-display-duration').on('change', function () {
      displayDuration = parseInt($(this).val(), 10);
      console.log("Display duration:", displayDuration);
      loadWindData();
    });
    getWindData();

    onToggleButtons("toggle-buttons-speed", (selectedValue) => {
      unit = selectedValue;
      console.log("Selected a new speed unit:", unit);
    
      changeUnitsBarGraphLegend(unit);
      updateGraphUnit();
      updateMaxAvgUnit();
    })

    $("#double-click-show-detailed").on("dblclick", function () {
      toggleDetailedDisplay();

      $(this).css("color", detailedShown? "green" : "");
    });
});


let detailedShown = false;
function toggleDetailedDisplay() {
  console.log("Wind speed title dbl clicked: detailedShown:", detailedShown, "all_wind_data len:", all_wind_data.winds.length);
  if(!all_wind_data) return; // all_wind_data hasnt be loaded yet
  if(!detailedShown) {
    if(!windChart.data.datasets[2]) {
      // only add NEW dataset if avgPOints are not set yet 
      avgPoints = all_wind_data.winds.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.value}));
      const newDataset = {
          label: "all",
          data: avgPoints,
          borderWidth: 0,
          avgGrid: 0,
          tension: 0,
          pointRadius: 3,
          borderColor: "#36a2ebFF",
          backgroundColor: "#94cffa"
      };
      windChart.data.datasets[2] = newDataset;
    } else {
      windChart.data.datasets[2].hidden = false;
    }

    if(!dirChart.data.datasets[1]) { 
      // only add NEW dataset if avgPOints are not set yet 
      dirPoints = all_wind_data.dirs.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.value/360 * 8 }));
      const newDataset = {
          label: "smer2",
          type: "scatter",
          data: dirPoints,
          borderWidth: 1,
          pointRadius: 3,
          borderColor: "#4cc0c0", 
          backgroundColor: "#a5dfdf",
          order: 1,
          hidden: false,
      };
      dirChart.data.datasets[1] = newDataset;
    } else {
      dirChart.data.datasets[1].hidden = false;
    }

  } else {
    if(windChart.data.datasets[2]) {
      windChart.data.datasets[2].hidden = true;
    }

    if(dirChart.data.datasets[1]) {
      dirChart.data.datasets[1].hidden = true;
    }
  }

  windChart.update();
  dirChart.update();
  detailedShown = !detailedShown;
}


function onToggleButtons(id, listener) {
  const $buttons = $(`#${id} button`);
  let selectedValue = "ms"; // default

  $buttons.on("click", function() {
    const prevSelectedValue = selectedValue;
    selectedValue = $(this).val();

    $buttons
      .removeClass("bg-slate-900 text-white")
      .addClass("bg-white text-slate-600 hover:bg-slate-100");

    $(this)
      .removeClass("bg-white text-slate-600 hover:bg-slate-100")
      .addClass("bg-slate-900 text-white");

    if(prevSelectedValue != selectedValue)
      listener(selectedValue);
  });
}

function showLoading(isLoading) {
  if(isLoading) {
    $('#loading-msg').show();
    $('#wind-chart').hide();
    $('#dir-chart').hide();
    $('.data-loading').removeClass('hidden').attr('aria-busy', 'true');
  } else {
    $('#loading-msg').hide();
    $('#wind-chart').show();
    $('#dir-chart').show();
    $('.data-loading').addClass('hidden').attr('aria-busy', 'false');
  }
}

function loadWindData() {
    showLoading(true);
    const base = window.location.pathname;
    $.getJSON(`${base}/data/wind.json?duration=${displayDuration}`, function(data) {
        showLoading(false);

        console.log('Wind data loaded:', data);
        updateWindGraph(data);
        updateDirectionGraph(data);
    });
}

function getWindData() {
  if(preloadedWindData) {
    showLoading(false);
    data = preloadedWindData;
    updateWindGraph(data);
    updateDirectionGraph(data);

  } else {
    loadWindData();
  }


}

function updateMaxAvgUnit() {
  if (unit === "kmh") {
    $("#avg-value").text((lastAvgValue * 3.6).toFixed(0));
    $("#max-value").text((lastMaxValue * 3.6).toFixed(0));
    $("#avg-unit").text("km/h");
    $("#max-unit").text("km/h");
  } else {
    $("#avg-value").text(lastAvgValue.toFixed(1));
    $("#max-value").text(lastMaxValue.toFixed(1));
    $("#avg-unit").text("m/s");
    $("#max-unit").text("m/s");
  }
}



let msStepSize = 0; // m/s step size so that we can restore it when toggling back to m/s
let def_yScaleTicksCallback;
function updateGraphUnit() {
  const yScale = windChart.options.scales.y;
  const tooltip = windChart.options.plugins.tooltip.callbacks;
  if(!def_yScaleTicksCallback) def_yScaleTicksCallback = yScale.ticks.callback;

  if (unit === "kmh") {
    yScale.ticks.callback = (v) => (v * 3.6).toFixed(0) + "";
    tooltip.label = (ctx) => (ctx.parsed.y * 3.6).toFixed(0) + " km/h";

    const step = 5;
    msStepSize = yScale.ticks.stepSize;
    yScale.ticks.stepSize = step / 3.6;
  } else {
    if(def_yScaleTicksCallback) yScale.ticks.callback = def_yScaleTicksCallback;
    else yScale.ticks.callback = (v) => v.toFixed(0) + "";

    tooltip.label = (ctx) => ctx.parsed.y.toFixed(1) + " m/s";

    yScale.ticks.stepSize = msStepSize;
  }

  currentUnit = unit;
  windChart.update();
}



let windChart;
let lastAvgValue;
let lastMaxValue;
function updateWindGraph(data) {
  if(data.length == 0) return;

  data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const avgGrid = data.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.avg}));
  const maxGrid = data.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.max}));

  const ctx = document.getElementById('wind-chart').getContext('2d');
  
  const desiredMax = 8; // m/s
  const dataMax = Math.ceil(Math.max(...maxGrid.map(p => p.y)));
  const yAxisMax = Math.max(desiredMax, dataMax);

  lastAvgValue = avgGrid[avgGrid.length-1].y;
  lastMaxValue = maxGrid[maxGrid.length-1].y;
  updateMaxAvgUnit();

  function getDurationHours(dataGrid) {
    if (!dataGrid || dataGrid.length < 2) return 0;

    const startX = dataGrid[0].x;
    const endX   = dataGrid[dataGrid.length - 1].x;

    return (endX - startX) / 3600000;   // ms → hours
  }



  const dataDuration = getDurationHours(avgGrid);
  
  console.log("avgGrid", avgGrid)

  if (!windChart) {
    windChart = new Chart(ctx, {
        type: 'line',
        data: {
        // no labels; each dataset has x/y
        datasets: [
            {
                label: "povprečna",
                data: avgGrid,
                borderWidth: 2,
                avgGrid: 0,
                tension: 0.4,
                pointRadius: 2,
                borderColor: "#36a2eb", 
                backgroundColor: "#9ad0f5",
                spanGaps: 1*60*60*1000, // dont draw the line if the data is more then 1 hour appart
            },
            {
                label: "sunki",
                data: maxGrid,
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 2,
                borderColor: "#ff6384", 
                backgroundColor: "#ffb1c1",
                spanGaps: 1*60*60*1000,  // dont draw the line if the data is more then 1 hour appart
            },
            /*{
                label: "all",
                data: avgPoints,
                borderWidth: 0,
                avgGrid: 0,
                tension: 0,
                pointRadius: 3,
                hidden: true,
                borderColor: "#36a2ebFF", 
                backgroundColor: "#94cffa",
            }*/
        ]
        },
        options: {
          animation: {
              duration: 0
          },
          plugins: {
            legend: {
              display: false,
              position: 'bottom',
              labels: { usePointStyle: true, padding: 12 }
            }
          },
          responsive: true,
          maintainAspectRatio: false,
          parsing: false,           // we already provide {x,y}
          normalized: true,         // better perf for time scale
          scales: {
              x: {
                type: 'time',
                time: { 
                  displayFormats: { minute: 'HH:mm' },
                },
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

  windChart.data.datasets[0].data = avgGrid;
  windChart.data.datasets[1].data = maxGrid;

  // dont show line if there is too much data
  let showLine = dataDuration < 5*(24) 
  windChart.data.datasets[0].showLine = showLine;  
  windChart.data.datasets[1].showLine = showLine; 

  windChart.options.scales.y.max = yAxisMax;

  windChart.update();   
}

let dirChart;
function updateDirectionGraph(data) {
    if(data.length == 0) return;
    // const dirPointsRaw = dir.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.value/360 * 8 }));

    const dirGrid = data.map(d => ({ x: new Date(d.timestamp).getTime(), y: d.dir }));
    const ctx = document.getElementById('dir-chart').getContext('2d');
    
    //const directions = ["↑", "↖", "←", "↙", "↓", "↘", "→", "↗"];
    const directions = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ", "S"];
    const dirFullNames = ["Sever", "SeveroVzhod", "Vzhod", "JugoVzhod", "Jug", "JugoZahod", "Zahod", "SeveroZahod", " "];
    
    const barWidthMs = 15 * 60 * 1000; // for x-minute spacing

    const lastDirValue = dirGrid[dirGrid.length-1].y;
    $("#wind-dir-value").text(dirFullNames[lastDirValue]);

    if(!dirChart) {
      dirChart = new Chart(ctx, {
          type: 'bar',
          data: {
          datasets: [
            {
                label: "smer",
                data: dirGrid,
                borderWidth: 2,
                borderColor: "#4cc0c0", 
                backgroundColor: "#a5dfdf",
                order: 2,
            },
            /*{
                label: "smer2",
                type: "scatter",
                data: dirPointsRaw,
                borderWidth: 1,
                pointRadius: 3,
                borderColor: "#4cc0c0", 
                backgroundColor: "#a5dfdf",
                hidden: true,
            },*/
          ]
          },
          options: {
            animation: {
              duration: 0
            },
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
                    if (context.datasetIndex != 0) return ""; // dont display the label for scatter plot points
                    return directions[value.y]
                  }
                },
                legend: {
                  display: false
                }
            },
            responsive: true,
            maintainAspectRatio: false,
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
                      // only show labels every full hour
                      if (d.getMinutes() % 60 !== 0) return null;
                      return d.toLocaleTimeString([], { hour: '2-digit',minute: '2-digit',hour12: false });
                    }
                  },
                  min: Math.min(...dirGrid.map(p => p.x)) - barWidthMs / 2,
                  max: Math.max(...dirGrid.map(p => p.x)) + barWidthMs / 2,
                },
                y: {
                    beginAtZero: true,
                    position: 'left',
                    max: 8,
                    ticks: {
                      stepSize: 1,
                      callback: (value) => {
                        return directions[value] || value
                      }
                    },
                },
            }
          },
          plugins: [ChartDataLabels]
      });
  }

  dirChart.data.datasets[0].data = dirGrid;
  dirChart.options.scales.x.min = Math.min(...dirGrid.map(p => p.x)) - barWidthMs / 2;
  dirChart.options.scales.x.max = Math.max(...dirGrid.map(p => p.x)) + barWidthMs / 2;

  //dirChart.data.datasets[1].data = dirPointsRaw;
  dirChart.update();
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
