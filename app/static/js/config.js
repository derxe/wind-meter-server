
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

function getAvailablePrefs() {
  const availablePrefs = [
    "no_reset",
    "no_send_prefs",
    "set_phone_num",
    "send_error_names",
    "send_stream_for_s",
    ""
  ];

  if(loadedPrefsHistory && Array.isArray(loadedPrefsHistory) && loadedPrefsHistory.length > 0) {
    Object.entries(loadedPrefsHistory[0].prefs).forEach(([prefName, prefValue]) => {
      availablePrefs.push(prefName);
    });
  }

  // return the list sperated by <br>
  return availablePrefs.join('<br>');
}


$(function() {
  showLoading(false);
  $('#chart-holder').hide();
  loadStatus();

  $('#back-btn').on('click', function () {
    if (window.location.pathname.endsWith('/config')) {
      const newPath = window.location.pathname.replace(/\/config$/, '');
      window.location.replace(newPath + window.location.search + window.location.hash);
    }
  });

  loadRawLogs();

  loadPreferencesHistory();

  $('#btnShowAvailablePrefs').on('click', function () {
    const btn = $(this);
    const root = $("#availablePrefs");
    root.html(getAvailablePrefs());

    if (root.is(":visible")) {
      root.hide();
      btn.text("Show");
    } else {
      root.show();
      btn.text("Hide");
    }
  });

  $('#btnShowAutoRefresh').on('click', function () {
    const btn = $(this);
    const root = $("#autoRefresh");
    if (root.is(":visible")) {
      root.hide();
      btn.text("Start auto refresh");
      autoRefreshStreamData(0);
    } else {
      root.show();
      btn.text("Stop");
      autoRefreshStreamData(500);
    }

  }); 

  loadAvailablePreferences();

  $('#btnSendPrefs').on('click', function () { uploadPreferences(); });


  console.log("prefsData:", prefsData);

  if(prefsData) {
    $("#confirmSendPrefs").prop("checked", !!prefsData.confirmSendPrefs);
    $("#prefsPreview").val(prefsData.prefs);
    $("#prefPickedUpDate").html(prefsData.date_sent? formattedDate(prefsData.date_sent) : "Waiting to be send ...");
  } else {
    $("#prefsPreview").val("");
    $("#confirmSendPrefs").prop("checked", false);
    $("#prefPickedUpDate").html("No preferences yet configured");
  }
});


function autoRefreshStreamData(interval = 1000) {
  if (autoRefreshStreamData._timerId) {
    clearInterval(autoRefreshStreamData._timerId);
    autoRefreshStreamData._timerId = null;
  }

  if (interval === 0) return () => {};

  const imsi = stationData && stationData.imsi ? String(stationData.imsi) : "";
  if (!imsi) return () => {};
  
  const stationName = stationData && stationData.name ? String(stationData.name) : "";
  if (!stationName) return () => {};

  const root = document.getElementById("autoRefresh") || document.getElementById("logs-value");
  if (!root) return () => {};

  if (!root.querySelector("[data-stream-summary]")) {
    root.innerHTML = `
      <div data-stream-summary class="mb-2 grid grid-cols-3 gap-2">
        <div class="rounded bg-slate-100 px-2 py-1"><span class="text-xs text-slate-500">Speed</span><div data-stream-spd class="font-mono text-sm">--</div><div data-stream-spd-ms class="font-mono text-sm">--</div></div>
        <div class="rounded bg-slate-100 px-2 py-1"><span class="text-xs text-slate-500">Direction</span><div data-stream-dir class="font-mono text-sm">--</div></div>
        <div class="rounded bg-slate-100 px-2 py-1"><span class="text-xs text-slate-500">Battery</span><div data-stream-bat class="font-mono text-sm">--</div></div>
      </div>
      <div data-stream-log class="max-h-[18rem] overflow-y-auto rounded bg-slate-50 p-2 text-xs font-mono whitespace-pre"></div>
    `;
  }

  const spdEl = root.querySelector("[data-stream-spd]");
  const spdMsEl = root.querySelector("[data-stream-spd-ms]");
  const dirEl = root.querySelector("[data-stream-dir]");
  const batEl = root.querySelector("[data-stream-bat]");
  const logEl = root.querySelector("[data-stream-log]");

  const url = `https://to-ni.dev/veter/log/stream_${stationName}_${imsi}.txt?lines=30`;
  let lastText = "";
  let inFlight = false;

  function parseLine(line) {
    const m = line.match(/^\s*(\d+)\s+([^\s]+)-\s*(.*)\s*$/);
    if (!m) return null;

    const q = new URLSearchParams(m[3]);
    return {
      raw: line,
      idx: Number(m[1]),
      timestamp: m[2],
      spd: q.get("spd"),
      dir: q.get("dir"),
      bat: q.get("bat"),
    };
  }

  async function tick() {
    if (inFlight) return;
    inFlight = true;

    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) return;

      const text = await resp.text();
      if (text === lastText) return;
      lastText = text;

      const rows = text
        .split(/\r?\n/)
        .map(parseLine)
        .filter(Boolean)
        .slice(0, 30);

      if (!rows.length) return;

      const latest = rows[0];
      spdEl.textContent = latest.spd ?? "--";
      spdMsEl.textContent = latest.spd ? `${(Number(latest.spd) * 0.091667).toFixed(2)} m/s` : "--";
      dirEl.textContent = latest.dir ?? "--";
      batEl.textContent = latest.bat ?? "--";
      logEl.textContent = rows.map(r => r.raw).join("\n");
      logEl.scrollTop = 0;
    } catch (err) {
      console.debug("stream refresh failed", err);
    } finally {
      inFlight = false;
    }
  }

  tick();
  const timerId = setInterval(tick, Math.max(1000, interval));
  autoRefreshStreamData._timerId = timerId;
  return () => clearInterval(timerId);
}

function loadAvailablePreferences() {
  const root = document.getElementById("availablePrefs");

  

}

function uploadPreferences() {
  const confirmed = $("#confirmSendPrefs").is(":checked");
  const rawText = $("#prefsPreview").val(); // textarea value as-is

  $.ajax({
    url: `https://to-ni.dev/veter/${stationData.name}/config/set_prefs.json`,
    method: "POST",
    contentType: "application/json; charset=utf-8",
    dataType: "text", // server may return plain text
    data: JSON.stringify({
      confirmSendPrefs: confirmed, // boolean
      prefs: rawText,              // raw textarea content
      date_sent: null,
    }),
    success: function (resp) {
      alert("Settings set: " + resp)
    },
    error: function (xhr) {
      alert("Error setting settings:" + xhr)
    }
  });
}

let loadedPrefsHistory = null;
function loadPreferencesHistory() {
  $.getJSON(`https://to-ni.dev/veter/${stationData.name}/data/prefs.json`, function (data) {
    loadedPrefsHistory = data;
    displayPreferencesHistory(data);
  });
}

function displayPreferencesHistory(data) {
  console.log("prefs history: ", data);

  const root = document.getElementById("prefHistory");
  if (!root) return;

  root.innerHTML = "";

  const entries = normalizePrefsHistoryEntries(data);
  if (entries.length === 0) {
    root.textContent = "(no history)";
    return;
  }

  entries.reverse();

  // Build UI
  const container = document.createElement("div");
  container.className = "flex flex-col gap-2 w-full";

  let prev = null;

  for (const e of entries) {
    const changes = diffPrefs(prev?.prefs, e.prefs);
    const card = renderHistoryCard(e, changes, prev);
    container.prepend(card);
    prev = e;
  }

  root.appendChild(container);
}


function normalizePrefsHistoryEntries(data) {
  if (!Array.isArray(data)) return [];

  return data.map((entry, index) => {
    const hasPrefsObject = entry && typeof entry === "object" && entry.prefs && typeof entry.prefs === "object";
    const prefs = hasPrefsObject
      ? entry.prefs
      : Object.fromEntries(
          Object.entries(entry || {}).filter(([key]) => key !== "timestamp" && key !== "ts" && key !== "station_name")
        );

    return {
      idx: data.length - index,
      ts: entry?.timestamp || entry?.ts || "",
      prefs,
    };
  }).filter(entry => entry.prefs && Object.keys(entry.prefs).length > 0);
}

/* ---------- diffing ---------- */

function diffPrefs(prevObj, curObj) {
  const changes = [];

  const prev = prevObj || {};
  const cur = curObj || {};

  const keys = new Set([...Object.keys(prev), ...Object.keys(cur)]);

  for (const k of keys) {
    const a = prev[k];
    const b = cur[k];
    if (a === undefined && b !== undefined) {
      changes.push({ key: k, from: undefined, to: b, kind: "added" });
    } else if (a !== undefined && b === undefined) {
      changes.push({ key: k, from: a, to: undefined, kind: "removed" });
    } else if (!isSameValue(a, b)) {
      changes.push({ key: k, from: a, to: b, kind: "changed" });
    }
  }

  changes.sort((x, y) => x.key.localeCompare(y.key));

  return changes;
}

function isSameValue(a, b) {
  // treat 1 and "1" as different; history already coerces, so strict is ok
  return a === b;
}

function renderHistoryCard(entry, changes, prevEntry) {
  const card = document.createElement("div");
  card.className = "border rounded p-2";

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-2";

  const left = document.createElement("div");
  left.className = "flex flex-col";

  const title = document.createElement("div");
  title.className = "text-sm font-semibold";
  title.textContent = entry.ts ? `#${entry.idx} — ${formattedDate(entry.ts)}` : `#${entry.idx}`;


  const subtitle = document.createElement("span");
  subtitle.className = "text-xs text-slate-600 ml-2";
  subtitle.textContent = `   ${changes.length} change(s)`;
  title.appendChild(subtitle);

  left.appendChild(title);

  const right = document.createElement("div");
  right.className = "flex items-center gap-2";

  header.appendChild(left);
  header.appendChild(right);

  // Changes preview (compact)
  const changesBox = document.createElement("div");
  changesBox.className = "mt-2 text-sm";

  if (prevEntry) {
    if (changes.length === 0) {
      changesBox.textContent = "(no differences vs previous)";
    } else {
      for (const c of changes) {
        const line = document.createElement("div");
        line.className = "font-mono text-xs whitespace-pre overflow-auto";
        line.textContent = `${c.key}: ${formatVal(c.from)} → ${formatVal(c.to)}`;
        changesBox.appendChild(line);
      }
    }
  } else {
    const first = document.createElement("div");
    first.className = "text-xs text-slate-600";
    first.textContent = "(first entry in list)";
    changesBox.appendChild(first);
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "border rounded mt-2 px-2 py-1 text-xs cursor-pointer";
  toggleBtn.textContent = "Details";

  // Details (collapsed)
  const details = document.createElement("pre");
  details.className = "mt-2 border rounded p-2 text-xs font-mono whitespace-pre overflow-auto bg-slate-50 hidden max-h-[20rem]";
  details.textContent = prefsToLines(entry.prefs).join("\n");

  toggleBtn.addEventListener("click", () => {
    const isHidden = details.classList.contains("hidden");
    if (isHidden) {
      details.classList.remove("hidden");
      toggleBtn.textContent = "Hide";
    } else {
      details.classList.add("hidden");
      toggleBtn.textContent = "Details";
    }
  });

  card.appendChild(header);
  card.appendChild(changesBox);
  card.appendChild(toggleBtn);
  card.appendChild(details);

  return card;
}

function prefsToLines(prefsObj) {
  return Object.keys(prefsObj)
    .sort((a, b) => a.localeCompare(b))
    .map(k => `${k}: ${String(prefsObj[k])}`);
}

function formatVal(v) {
  if (v === undefined) return "(none)";

  if (typeof v === "string") {
    if (/^-?\d+$/.test(v)) {
      // Keep identifiers like "0123", "001122", phone numbers, IMSI, etc. as strings
      if (/^0\d+/.test(v) || /^-0\d+/.test(v) || v.length > 7) {
        return `"${v}"`;
      }

      return String(parseInt(v, 10));
    }

    return `"${v}"`;
  }

  return String(v);
}

function loadRawLogs() {
  $.get(`https://to-ni.dev/veter/log/${stationData.imsi}.txt`, function (text) {
    displayRawLogs(text);
  });
}

function displayStatuses(data) {
  $("#logs-value").empty().hide();
  const container = $("#errors-value");
  container.empty().show();
  
  // gather all the values in the list
  const fieldSet = new Set();
  data.forEach(entry => { Object.keys(entry).forEach(key => { fieldSet.add(key); }); });

  const columns = [
    "timestamp",
    "dur_minutes",
    ...[...fieldSet].filter(k => k !== "timestamp")
  ];

  // compute the duration between each status
  data.forEach((entry, i) => {
    if (i < data.length - 1) {
      const t0 = new Date(entry.timestamp);
      const t1 = new Date(data[i + 1].timestamp);
      entry.dur_minutes = (t0 - t1) / 60000;
    } else {
      entry.dur_minutes = null;
    }
  });

  let tableHtml = `
  <table class="w-full text-sm border-collapse">
    <thead class="bg-slate-100 text-slate-600">
      <tr>
        ${columns.map(c => `
          <th class="px-2 py-1 border-b border-slate-200 text-left font-medium">
            ${c.replace(/_/g, " ")}
          </th>
        `).join("")}
      </tr>
    </thead>
    <tbody>
  `;

  data.forEach(entry => {
    const isLong =
      typeof entry.dur_minutes === "number" &&
      entry.dur_minutes > 11;

    tableHtml += `
      <tr class="${isLong ? "bg-red-100 text-red-900" : "hover:bg-slate-50"}">
        ${columns.map(col => {
          let val = entry[col];

          if (col === "timestamp") {
            val = new Date(val).toLocaleString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  });
          } else if (col === "dur_minutes") {
            val = typeof val === "number" ? val.toFixed(1) : "--";
          } else if (Array.isArray(val)) {
            val = val.length ? JSON.stringify(val) : "[]";
          } else if (val && typeof val === "object") {
            val = JSON.stringify(val);
          } else {
            val = val ?? "--";
          }

          return `
            <td class="px-2 py-1 border-b border-slate-100 align-top whitespace-nowrap">
              ${val}
            </td>
          `;
        }).join("")}
      </tr>
    `;
  });

  tableHtml += `
    </tbody>
  </table>
  `;

  container.html(tableHtml);
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
    htmlLine = `<div class="mb-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-200/60">${line}</div>`;
    container.append(htmlLine);
  });
}

function loadStatus() {
  $('#loading-status-msg').show();

  $.getJSON(`/${basePath}/data/status.json?shift=0`, function(data) {
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
  //displayStatusInfo("errors", "Errors:", formatErrors(data["errors"]));


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
  const maxVoltage = 4.1;
  const voltage = parseFloat(voltageStr);
  if (isNaN(voltage)) return 0;

  const ACCURACY_CHANGE = 15; // procents increase for some percentage in order to be more "accurate" im too lazy to impment accurate function for the discharging curve 

  // Normalize to 0–1 range
  let percent = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100 + ACCURACY_CHANGE; 

  // Clamp to 0–100 range
  percent = Math.min(Math.max(percent, 0), 100);

  return Math.round(percent);
}

function formattedDate(isoString) {
  if (!isoString) return "--";

  const d = new Date(isoString);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${yy}.${mm}.${dd} ${hh}:${min}`;
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
