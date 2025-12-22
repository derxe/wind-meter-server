
const basePath = window.location.pathname
  .split('/')
  .filter(Boolean)
  .slice(0, 2)
  .join('/');

function showLoading(isLoading) {
  if(isLoading) {
    $('#status-chart').hide();
    $('.data-loading').removeClass('hidden').attr('aria-busy', 'true');
  } else {
    $('#status-chart').show();
    $('.data-loading').addClass('hidden').attr('aria-busy', 'false');
  }
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



let displayDuration;
let currentGraph;
let currentGraphY2;
let statusShift = 0;
let displayLogs = "all";
$(function() {
  showLoading(false);
  $('#chart-holder').hide();
  loadStatus();

  displayDuration = $('#select-display-duration').val();
  console.log("Display duration:", displayDuration);
  $('#select-display-duration').on('change', function () {
    displayDuration = parseInt($(this).val(), 10);
    console.log("Display duration:", displayDuration);
    showGraph("y1");
    showGraph("y2");
  });

  $('#select-graph-1').on('change', function () {
    const dataKey = $(this).val();                              
    const dataText = $(this).find('option:selected').text();   
    
    showNewGraph(dataKey, dataText);
  });

  $('#select-graph-2').on('change', function () {
    const dataKey = $(this).val();                              
    const dataText = $(this).find('option:selected').text();   

    showNewGraphY2(dataKey, dataText);
  });


  $('#status-shift-value').on('click', function () {
    statusShift = 0;
    $('#status-shift-value').text(statusShift); 
    loadStatus();
  });

  $('#status-shift-dec').on('click', function () {
    statusShift = Math.max(0, statusShift - 1);
    $('#status-shift-value').text(statusShift); 
    loadStatus();
  });

  $('#status-shift-inc').on('click', function () {
    statusShift = statusShift + 1;
    $('#status-shift-value').text(statusShift); 
    loadStatus();
  });

  onToggleButtons('toggle-show-log-errors', (selectedValue) => {
      displayLogs = selectedValue;
      loadRawLogs();
  });

  loadRawLogs();

});



function loadRawLogs() {
  if(displayLogs === "all") {
    $.get(`https://to-ni.dev/veter/log/${stationData.imsi}.txt`, function (text) {
      displayRawLogs(text);
    });
  } else {

    $.getJSON(`/${basePath}/data/errors.json`, function(data) {
      displayErrors(data);
    });
  }
}

function displayErrors(data) {
  $("#logs-value").empty().hide();
  const container = $("#errors-value");
  container.empty().show();

  console.log("Showing data", data);

  data.forEach(entry => {
    const time = new Date(entry.timestamp).toLocaleString();
    const durationMinutes = typeof entry.dur_minutes === "number" ? entry.dur_minutes.toFixed(1) : "--";
    const LONG_DURATION_CUTOF = 11; // 11 minutes cutoff for 
    const isLongDuration = typeof entry.dur_minutes === "number" && entry.dur_minutes > 11;

    const errorItems = entry.parsed_errors
      .map(err => `
        <span class="inline-block mr-3 px-2 py-0.5 rounded bg-slate-200 text-xs">
          <b>${err.name}</b> × ${err.count}
        </span>
      `)
      .join("");

    const html = `
      <div class="mb-2 px-3 py-2 rounded text-sm ${isLongDuration ? "bg-red-100 border border-red-300 text-red-900" : "bg-slate-100/70"}">
        <div class="text-xs mb-1 flex items-center justify-between ${isLongDuration ? "text-red-700" : "text-slate-500"}">
          <span>${time}</span>
          <span class="font-semibold">${durationMinutes} min</span>
        </div>
        <div class="flex flex-wrap gap-2">${errorItems}</div>
      </div>
    `;

    container.prepend(html);
  });
}


function rawLogClicked(i) {
  statusShift = i;
  $('#status-shift-value').text(statusShift); 
  loadStatus();
}

function displayRawLogs(rawLogsText) {
  $("#errors-value").empty().hide();
  const container = $("#logs-value");
  container.empty().show(); // clear previous content

  // Split by newline into individual lines
  const lines = rawLogsText.split("\n").filter(line => line.trim().length > 0); 

  // Append each line inside its own <div>
  lines.forEach((line, i) => {
    // create on click that calls rawLogClicked(${i} )
    htmlLine = `<div class="mb-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-200/60" onclick="rawLogClicked(${i})">${line}</div>`;
    container.append(htmlLine);
  });
}

function loadStatus() {
  $('#loading-status-msg').show();

  n = 1;
  $.getJSON(`/${basePath}/data/status.json?shift=${statusShift};n=${n}`, function(data) {
    console.log(data)
    displayStatusData(data);
  });
}

function displayStatusData(data) {
  $('#loading-status-msg').hide();
  $('#status-graphical-info').html("");
  $('#status-info').html("");

  console.log('Got new status:', data);
  setStatuionParametersPannel(data);
}

function toggleOverlay(type, show) {
  const $targets = $(`[data-overlay="${type}"]`);
  if (show) {
    $targets.removeClass("hidden").addClass("flex");
  } else {
    $targets.addClass("hidden").removeClass("flex");
  }
}

let displayedKeys = [];
function displayStatusInfo(dataKey, name, value) {
  displayedKeys.push(dataKey);
  const content = `
    <div class="flex items-center justify-between">
      <span class="text-sm text-slate-500">${name}</span>

      <span class="text-base text-right font-semibold text-slate-800">
        ${value ?? "--"}
      </span>
    </div>
  `;

  // Append the new content to the #status-graphical-info div
  $('#status-info').append(content);
}


function showGraph(axis) {
  const currGraph = axis === "y1"? currentGraph : currentGraphY2;
  if (currGraph === undefined || !("dataKey" in currGraph)) {
    drawGraph(undefined, undefined, axis);
    return;
  }

  let { dataKey, dataName } = currGraph;
  $('#chart-holder').show();
  showLoading(true);
  $.ajax({
    url: `data/status/${dataKey}.json`,
    data: { duration: displayDuration },
    dataType: 'json',
    success: function (data) {
      showLoading(false);
      drawGraph(data, dataName, axis);
    },
    error: function () {
      showLoading(false);
      drawGraph(undefined, undefined, axis);
    }
  });
}

function getGraphData(dataKey, dataName) {
  graphData = {}
  graphData.dataKey = dataKey;
  graphData.dataName = dataName;

  if(dataKey == "vsol") {
    graphData.min = 0;
    graphData.max = 8;
  } else if(dataKey == "vbatIde" || dataKey == "vbatGprs") {
    graphData.min = 3.4;
    graphData.max = 4.2;
  } else {
    graphData.min = null;
    graphData.max = null;
  }

  return graphData;
}

function showNewGraph(dataKey, dataName) {
  currentGraph = dataKey !== ""? getGraphData(dataKey, dataName) : undefined;
  showGraph("y1");
}

function showNewGraphY2(dataKey, dataName) {
  currentGraphY2 = dataKey !== ""? getGraphData(dataKey, dataName) : undefined;
  showGraph("y2");
}


let chart;
function drawGraph(data, dataName, axis) {
  if (!chart) {
    const ctx = document.getElementById('status-chart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
        // no labels; each dataset has x/y
        datasets: [
            {
                label: dataName,
                data: [],
                yAxisID: 'y', 
                borderWidth: 2,
                avgGrid: 0,
                tension: 0,
                showLine: false,
                pointRadius: 2,
                borderColor: "#36a2eb", 
                backgroundColor: "#9ad0f5",
                spanGaps: 1*60*60*1000, // dont draw the line if the data is more then 1 hour appart
                hidden: axis != "y1",
            },
            {
                label: "data2",
                data: [],
                yAxisID: 'y2', 
                borderWidth: 2,
                avgGrid: 0,
                tension: 0,
                showLine: false,
                pointRadius: 2,
                borderColor: "red", 
                backgroundColor: "red",
                spanGaps: 1*60*60*1000, // dont draw the line if the data is more then 1 hour appart
                hidden: axis != "y2",
            },
        ]
        },
        options: {
          animation: {
              duration: 0
          },
          plugins: {
              legend: {
                  display: true,
                  position: 'bottom',      
                  align: 'center',
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
                position: 'left',
              },
              y2: {
                position: 'right',
              }
          }
        }
    });
  }

  if(data) {
    data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const dataValues = data.map(d => ({ x: new Date(d.timestamp).getTime(), y: parseFloat(d.value)}));
    
    // show the data in defined axis
    if(axis == "y1") {
      if(currentGraph.min != null && currentGraph.max != null) {
        chart.options.scales.y.min = currentGraph.min;
        chart.options.scales.y.max = currentGraph.max;
      } else {
        chart.options.scales.y.min = undefined;
        chart.options.scales.y.max = undefined;
      }
      chart.data.datasets[0].data = dataValues;
      chart.data.datasets[0].label = dataName;
      chart.data.datasets[0].hidden = false;
    } else if(axis == "y2") {
      if(currentGraphY2.min != null && currentGraphY2.max != null) {
        chart.options.scales.y2.min = currentGraphY2.min;
        chart.options.scales.y2.max = currentGraphY2.max;
      } else {
        chart.options.scales.y2.min = undefined;
        chart.options.scales.y2.max = undefined;
      }
      chart.data.datasets[1].data = dataValues;
      chart.data.datasets[1].label = dataName;
      chart.data.datasets[1].hidden = false;
    }

  } else {
    // no data to draw 
    if(axis == "y1") {
      chart.data.datasets[0].hidden = true;
      chart.data.datasets[0].data = [];
    } else if(axis == "y2") {
      chart.data.datasets[1].data = [];
      chart.data.datasets[1].hidden = true;
    }
  }

  chart.update();  
}

const ErrorCodeStrings = [
  // 0–
  { code: 0,  code_name: "ERR_NONE",               desc: "No error" },

  // 1–8 (send-related)
  { code: 1,  code_name: "ERR_SEND_AT_FAIL",       desc: "AT command failure" },
  { code: 2,  code_name: "ERR_SEND_NO_SIM",        desc: "No SIM card detected" },
  { code: 3,  code_name: "ERR_SEND_CSQ_FAIL",      desc: "Signal quality (CSQ) check failed" },
  { code: 4,  code_name: "ERR_SEND_REG_FAIL",      desc: "Network registration failed" },
  { code: 5,  code_name: "ERR_SEND_CIMI_FAIL",     desc: "IMSI (CIMI) retrieval failed" },
  { code: 6,  code_name: "ERR_SEND_GPRS_FAIL",     desc: "GPRS/Data connection failed" },
  { code: 7,  code_name: "ERR_SEND_HTTP_FAIL",     desc: "HTTP communication failed" },
  { code: 8,  code_name: "ERR_SEND_REPEAT",        desc: "Send had to be repeated" },

  // 9–14 (wind + buffer + dir)
  { code: 9,  code_name: "ERR_DIR_READ",           desc: "Direction read" },
  { code: 10, code_name: "ERR_DIR_READ_ONCE",      desc: "Read dir error had to be repeated." },
  { code: 11, code_name: "ERR_WIND_BUF_OVERWRITE", desc: "Wind buffer overwrite" },
  { code: 12, code_name: "ERR_WIND_SHORT_BUF_FULL",desc: "Wind (short) buffer full" },
  { code: 13, code_name: "ERR_SPEED_SHORT_BUF_FULL",desc: "Speed (short) buffer full" },
  { code: 14, code_name: "ERR_DIR_SHORT_BUF_FULL", desc: "Direction (short) buffer full" },

  // 15–20+ (all reset-related)
  { code: 15, code_name: "ERR_POWERON_RESET",      desc: "Power-on reset (info)" },
  { code: 16, code_name: "ERR_BROWNOUT_RESET",     desc: "Brown-out/low-voltage reset" },
  { code: 17, code_name: "ERR_PANIC_RESET",        desc: "Software panic/abort reset" },
  { code: 18, code_name: "ERR_WDT_RESET",          desc: "Watchdog Timer reset" },
  { code: 19, code_name: "ERR_SDIO_RESET",         desc: "SDIO-triggered reset" },
  { code: 20, code_name: "ERR_USB_RESET",          desc: "USB-triggered reset" },
  { code: 21, code_name: "ERR_JTAG_RESET",         desc: "JTAG-triggered reset" },
  { code: 22, code_name: "ERR_EFUSE_RESET",        desc: "EFUSE error reset" },
  { code: 23, code_name: "ERR_PWR_GLITCH_RESET",   desc: "Power glitch reset" },
  { code: 24, code_name: "ERR_CPU_LOCKUP_RESET",   desc: "CPU lockup/double exception reset" },
  { code: 25, code_name: "ERR_UNEXPECTED_RESET",   desc: "Unexpected/unclassified reset" },
];



function errorNumToStr(errorNum) {
  const item = ErrorCodeStrings[errorNum];
  return item ? `${item.code_name} (${errorNum})` : "Unknown ErrorCode";
}

function formatErrors(errors) {
  let errorsList = "";
  for(error of errors.split(",")) {
     const [errNum, errLen] = error.split(":");
     if(!errLen) return "/";
     errorsList += `${errorNumToStr(parseInt(errNum))} : ${errLen}<br>`
  }
  return errorsList;
}

function addToDropdown(dataKey, dataName) {
  $('#select-graph-1').append($('<option>', {
    value: dataKey,
    text: dataName
  }));
  $('#select-graph-2').append($('<option>', {
    value: dataKey,
    text: dataName
  }));
}

function setStatuionParametersPannel(data) {
  const signal = csqToSignalAuto(data["signal"])
  const signalQualityStr = `${signal.quality}, ${signal.dbm} dB`;

  displayedKeys = [];
  displayStatusInfo("timestamp", "Čas meritve", `${formattedDate(data["timestamp"])}<br>(pred ${timeSince(data["timestamp"])})`);
  displayStatusInfo("phoneNum", "Telefonska", data["phoneNum"] ?? "--");
  displayStatusInfo("vbatIde", "Baterija", (data["vbatIde"] ?? "--") + " V");
  displayStatusInfo("vbat_rate1", "Charging rate", (data["vbat_rate1"] ?? "--") + " V");
  displayStatusInfo("vbatGprs", "Baterija med GPRS", (data["vbatGprs"] ?? "--") + " V");
  displayStatusInfo("vsol", "Solar:", (data["vsol"] ?? "--") + " V");
  displayStatusInfo("signal", "Signal:", signalQualityStr);
  displayStatusInfo("regDur", "Trajanje registracije", (data["regDur"] ?? "--") + " s");
  displayStatusInfo("gprsRegDur", "Trajanje GPRS registracije", (data["gprsRegDur"] ?? "--") + " s");
  displayStatusInfo("dur", "Trajanje skupaj", (data["dur"] ?? "--") + " s");
  displayStatusInfo("ver", "FW version", data["ver"]);
  displayStatusInfo("errors", "Errors:", formatErrors(data["errors"]));

  addToDropdown("vbatIde", "baterija");
  addToDropdown("vbat_rate", "Charging rate");
  addToDropdown("vbatGprs", "baterija med GPRS");
  addToDropdown("vsol", "V solarna");
  addToDropdown("signal", "signal");
  addToDropdown("regDur", "trajanje registracije");
  addToDropdown("gprsRegDur", "trajanje GPRS");
  addToDropdown("dur", "trajanje skupaj");
  addToDropdown("hum", "vlažnost");
  addToDropdown("temp", "temperatura");
  

  for (const [key, value] of Object.entries(data)) {
    if (displayedKeys.includes(key)) continue;
    displayStatusInfo("", key, value ?? "--");
  }

  // simply display all the keys that werent already displayed 


  const battProc = batteryVoltageToProcentage(data["vbatIde"]);
  const battBarColor = batteryColorHex(battProc);
  displayStatusBar("Baterija", `${data["vbatIde"]} V`, battProc, battBarColor)

  const vSolar = data["vsol"];
  const vSolarProc = vSolar / 8 * 100;
  const solarBarColor = signalColorHex(vSolarProc)
  displayStatusBar("Napetost solarne", `${vSolar} V`, vSolarProc, solarBarColor)
  //displayStatusBar("Temepratura", `12 ˚C`, "40", "#38bdf8")

  
  const vbatRate = data["vbat_rate"];
  const vbatRateLabel = vbatRate > 0? "Hitrost polnenja" : "Hitrost praznenja";
  const vbatRateProc = vbatRate / 100 * 100;
  const vbatRateColor = batteryRateColorHex(vbatRateProc)
  displayStatusBar(vbatRateLabel, `${vbatRate} mV/h`, vbatRateProc, vbatRateColor)


  const signalBarColor = signalColorHex(signal.percent);
  displayStatusBar("Signal", signalQualityStr, signal.percent, signalBarColor)

}

function batteryRateColorHex(percent) {
  if (percent === 0) return "#94a3b8"; // slate-400 (neutral)

  // ------ DISCHARGING (negative) ------
  if (percent < 0) {
    const p = Math.abs(percent);

    if (p <= 20) return "#fdba74";  // orange-300 (slow discharge)
    if (p <= 50) return "#f97316";  // orange-500
    if (p <= 80) return "#ef4444";  // red-500
    return "#b91c1c";               // red-700 (fast discharge)
  }

  // ------ CHARGING (positive) ------
  if (percent <= 20) return "#bbf7d0";  // green-200 (slow charge)
  if (percent <= 50) return "#4ade80";  // green-400
  if (percent <= 80) return "#22c55e";  // green-500
  return "#84cc16";                     // lime-500 (fast charge)
}

function signalColorHex(percent) {
  if (percent <= 20) return "#ef4444";  // red-500
  if (percent <= 50) return "#f59e0b";  // amber-500
  if (percent <= 80) return "#84cc16";  // lime-500
  return "#10b981";                     // emerald-500
}

function batteryColorHex(percent) {
  if (percent <= 20) return "#ef4444";  // red-500
  if (percent <= 50) return "#f59e0b";  // amber-500
  if (percent <= 80) return "#84cc16";  // lime-500
  return "#10b981";                     // emerald-500
}

function displayStatusBar(name, value, precantage, color) {
    var content = `
    <div class="col-span-1 p-3 rounded-xl bg-slate-50 border border-slate-200">
      <div class="text-xs text-slate-500">${name}</div>
      <div class="font-semibold">${value}</div>
      <div class="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
        <div class="h-full w-4/5 bg-amber-500" style="background-color:${color}; width: ${Math.abs(precantage)}%"></div>
      </div>
    </div>`;

  // Append the new content to the #status-graphical-info div
  $('#status-graphical-info').append(content);
}

function batteryVoltageToProcentage(voltageStr) {
  const minVoltage = 3.5;
  const maxVoltage = 4.2;
  const voltage = parseFloat(voltageStr);
  if (isNaN(voltage)) return 0;

  // Normalize to 0–1 range
  let percent = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;

  // Clamp to 0–100 range
  percent = Math.min(Math.max(percent, 0), 100);

  return Math.round(percent);
}

function formattedDate(isoString) {
  if (!isoString) return "--";

  const d = new Date(isoString);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${hh}:${min} ${dd}.${mm}.${yy}`;
}

function timeSinceMinutes(isoString) {
  const date = new Date(isoString);
  const now = new Date();

  const diffMs = now - date; // milliseconds difference
  const diffMin = diffMs / 60000; // convert to minutes

  return Math.floor(diffMin);
}

function timeSince(isoString) {
  const date = new Date(isoString);
  const now = new Date();

  const diffMs = now - date; // milliseconds difference
  const diffMin = diffMs / 60000; // convert to minutes

  let elapsed;
  if (diffMin < 1) elapsed = "ravnokar";
  else if (diffMin < 60) elapsed = `${Math.floor(diffMin)} min`;
  else if (diffMin < 1440) elapsed = `${Math.floor(diffMin / 60)} ur`;
  else elapsed = `${Math.floor(diffMin / 1440)} dni`;

  return elapsed;
}

function csqToSignalAuto(csq) {
  if (!csq) return { dbm:"--", quality:"--", percent:"--" };
  if (csq <= 1) return { dbm: null, quality: "No signal", percent: 0 };
  if (csq > 31) return { dbm: null, quality: "Invalid or unknown", percent: 0 };

  const dbm = -113 + 2 * csq; // standard 3GPP formula

  let quality;
  if (dbm <= -97) quality = "Slab";
  else if (dbm <= -85) quality = "OK";
  else if (dbm <= -75) quality = "Dober";
  else quality = "Odličen";

  // Normalize percentage (2–30 → 0–100)
  const percent = Math.round(((csq - 2) / (31 - 2)) * 100);

  return { dbm, quality, percent };
}
