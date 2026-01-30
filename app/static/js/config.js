
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

  //showPreferences();
  loadPreferencesHistory();

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

function loadPreferencesHistory() {
  $.get(`https://to-ni.dev/veter/log/prefs_${stationData.imsi}.txt`, function (text) {
    displayPreferencesHistory(text);
  });
}

function displayPreferencesHistory(text) {
  console.log("prefs history: ", text);

  const root = document.getElementById("prefHistory");
  if (!root) return;

  root.innerHTML = "";

  const entries = parsePrefsHistory(text);
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


function parsePrefsHistory(text) {
  // Split into non-empty lines
  const lines = String(text)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const out = [];

  for (const line of lines) {
    // Expected: "1 2026-...+01:00- pref_version=7;...;as5600_read_interval=30;"
    const m = line.match(/^(\d+)\s+([0-9T:.\-+]+)\-\s*(.*)$/);
    if (!m) continue;

    const idx = Number(m[1]);
    const ts = m[2];            // keep as string (ISO-ish)
    const kvBlob = m[3] || "";

    const prefs = parseKvBlob(kvBlob);

    out.push({ idx, ts, prefs, raw: line });
  }

  return out;
}

function parseKvBlob(blob) {
  // blob is like: "pref_version=7;pref_set_date=...;...;"
  const obj = {};
  const parts = String(blob).split(";");

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;

    const eq = p.indexOf("=");
    if (eq === -1) continue;

    const k = p.slice(0, eq).trim();
    const vRaw = p.slice(eq + 1).trim();

    obj[k] = coerceValue(k, vRaw);
  }

  return obj;
}

function coerceValue(key, vRaw) {
  // Use schema when available
  const s = (typeof PREFS_SCHEMA === "object" && PREFS_SCHEMA) ? PREFS_SCHEMA[key] : null;

  if (s?.type === "bool") return (Number(vRaw) === 1) ? 1 : 0;
  if (s?.type === "number") {
    const n = Number(vRaw);
    return Number.isFinite(n) ? n : vRaw;
  }
  if (s?.type === "string") return vRaw;

  // Fallback heuristics
  if (/^-?\d+$/.test(vRaw)) return Number(vRaw);
  return vRaw;
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

  // Stable order: schema order first, then others
  const schemaKeys = (typeof PREFS_SCHEMA === "object" && PREFS_SCHEMA) ? Object.keys(PREFS_SCHEMA) : [];
  changes.sort((x, y) => {
    const ix = schemaKeys.indexOf(x.key);
    const iy = schemaKeys.indexOf(y.key);
    if (ix !== -1 || iy !== -1) return (ix === -1 ? 9999 : ix) - (iy === -1 ? 9999 : iy);
    return x.key.localeCompare(y.key);
  });

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
  title.textContent = `#${entry.idx} — ${formattedDate(entry.ts)}`;


  const subtitle = document.createElement("span");
  subtitle.className = "text-xs text-slate-600 ml-2";
  const pv = entry.prefs.pref_version ?? "(?)";
  subtitle.textContent = `   ${changes.length} change(s)`;
  title.appendChild(subtitle);

  left.appendChild(title);

  const right = document.createElement("div");
  right.className = "flex items-center gap-2";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "border rounded px-2 py-1 text-xs";
  toggleBtn.textContent = "Details";

  right.appendChild(toggleBtn);

  header.appendChild(left);
  header.appendChild(right);

  // Changes preview (compact)
  const changesBox = document.createElement("div");
  changesBox.className = "mt-2 text-sm";

  if (prevEntry) {
    if (changes.length === 0) {
      changesBox.textContent = "(no differences vs previous)";
    } else {
      const maxShow = 8;
      const shown = changes.slice(0, maxShow);

      for (const c of shown) {
        const line = document.createElement("div");
        line.className = "font-mono text-xs whitespace-pre overflow-auto";
        line.textContent = `${c.key}: ${formatVal(c.from)} → ${formatVal(c.to)}`;
        changesBox.appendChild(line);
      }

      if (changes.length > maxShow) {
        const more = document.createElement("div");
        more.className = "text-xs text-slate-600 mt-1";
        more.textContent = `… +${changes.length - maxShow} more`;
        changesBox.appendChild(more);
      }
    }
  } else {
    const first = document.createElement("div");
    first.className = "text-xs text-slate-600";
    first.textContent = "(first entry in list)";
    changesBox.appendChild(first);
  }

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
  card.appendChild(details);

  return card;
}

function prefsToLines(prefsObj) {
  const keys = [
    ...(typeof PREFS_SCHEMA === "object" && PREFS_SCHEMA ? Object.keys(PREFS_SCHEMA) : []),
    ...Object.keys(prefsObj).filter(k => !(PREFS_SCHEMA && k in PREFS_SCHEMA))
  ];

  // unique + keep order
  const seen = new Set();
  const ordered = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    if (!(k in prefsObj)) continue;
    seen.add(k);
    ordered.push(k);
  }

  return ordered.map(k => `${k}=${String(prefsObj[k])}`);
}

function formatVal(v) {
  if (v === undefined) return "(none)";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}




// Example: current values coming from device/backend (fill with real data)
const appPrefs = {
  pref_version: 1,
  pref_set_date: 0,
  version: "1.0.0",
  url_data: "https://example.com/data",
  url_prefs: "https://example.com/prefs",
  url_errors: "https://example.com/errors",

  light_sleep_enabled: 1,
  sleep_enabled: 0,
  sleep_hour_start: 23,
  sleep_hour_end: 6,

  store_wind_data_interval: 10,
  send_data_interval: 5,
  n_send_retries: 3,

  at_timeout_s: 20,
  sim_timeout_s: 60,
  csq_timeout_s: 20,
  creg_timeout_s: 60,
  cgreg_timeout_s: 60,

  error_led_on_time: 50,
  dir_led_on_time: 20,
  spin_led_on_time: 20,
  blink_led_on_time: 10,
  blink_led_interval: 10,

  as5600_pwr_on_time: 10,
  as5600_read_interval: 10,

  no_reset: 0,
  no_send_prefs: 0,
  set_phone_num: "",
  send_error_names: 0,
};

// Schema: type + min/max based on C types + domain meaning in your comments
// (Description is included but not displayed as requested)
const PREFS_SCHEMA = {
  no_reset:      { type: "bool" },
  no_send_prefs: { type: "bool" },
  set_phone_num: { type: "string", maxLength: 10, step: 1, description: "prefs version" },
  send_error_names: { type: "bool"},

  // uint16_t
  pref_version: { type: "number", min: 0, max: 65535, step: 1, description: "prefs version" },

  // uint32_t (epoch/seconds etc.)
  pref_set_date: { type: "number", min: 0, max: 4294967295, step: 1, description: "set date" },

  // char arrays (reserve 1 for null terminator)
  version:    { type: "string", maxLength: 7,  description: "program/sw version" },
  url_data:   { type: "string", maxLength: 127, description: "data URL" },
  url_prefs:  { type: "string", maxLength: 127, description: "prefs URL" },
  url_errors: { type: "string", maxLength: 127, description: "errors URL" },

  // uint8_t bool flags
  light_sleep_enabled: { type: "bool", description: "0/1" },
  sleep_enabled:       { type: "bool", description: "0/1" },

  // int8_t hours (domain-limited)
  sleep_hour_start: { type: "number", min: 0, max: 23, step: 1, description: "0-23" },
  sleep_hour_end:   { type: "number", min: 0, max: 23, step: 1, description: "0-23" },

  // uint8_t intervals
  store_wind_data_interval: { type: "number", min: 0, max: 255, step: 1, description: "interval" },
  send_data_interval:       { type: "number", min: 0, max: 255, step: 1, description: "minutes" },

  // retries (domain-limited; still within uint8_t)
  n_send_retries: { type: "number", min: 0, max: 20, step: 1, description: "retries" },

  // timeouts in seconds (uint8_t; domain-limited but safe)
  at_timeout_s:    { type: "number", min: 1, max: 255, step: 1, description: "seconds" },
  sim_timeout_s:   { type: "number", min: 1, max: 255, step: 1, description: "seconds" },
  csq_timeout_s:   { type: "number", min: 1, max: 255, step: 1, description: "seconds" },
  creg_timeout_s:  { type: "number", min: 1, max: 255, step: 1, description: "seconds" },
  cgreg_timeout_s: { type: "number", min: 1, max: 255, step: 1, description: "seconds" },

  // LED on-times in ms (your comment implies 0 disables; uint8_t => 0..255)
  error_led_on_time:  { type: "number", min: 0, max: 255, step: 1, description: "ms (0 disables)" },
  dir_led_on_time:    { type: "number", min: 0, max: 255, step: 1, description: "ms (0 disables)" },
  spin_led_on_time:   { type: "number", min: 0, max: 255, step: 1, description: "ms (0 disables)" },
  blink_led_on_time:  { type: "number", min: 0, max: 255, step: 1, description: "ms (0 disables)" },

  // deca-seconds (10 => 1 second)
  blink_led_interval: { type: "number", min: 0, max: 255, step: 1, description: "deca-seconds" },

  // AS5600 timings
  as5600_pwr_on_time:   { type: "number", min: 0, max: 255, step: 1, description: "ms" },
  as5600_read_interval: { type: "number", min: 0, max: 255, step: 1, description: "deca-seconds" },
};

function prettifyName(prefName) {
  return prefName.replaceAll("_", " ");
}

function showPreferences() {
  const root = document.getElementById("prefs");
  root.innerHTML = "";

  for (const [prefName, prefSetting] of Object.entries(PREFS_SCHEMA)) {
    // If a field is missing in appPrefs, still render it (empty/default)
    const currentValue = (prefName in appPrefs) ? appPrefs[prefName] : "";
    addPreference(prefName, { ...prefSetting, value: currentValue }, prefSetting.description);
  }
}

// Track which prefs are selected for editing
const selectedPrefs = new Set();

function isSelected(prefName) {
  return selectedPrefs.has(prefName);
}

function setSelected(prefName, on) {
  if (on) selectedPrefs.add(prefName);
  else selectedPrefs.delete(prefName);
}


// prefSetting is composed of: type: "string" | "number" | "bool", min, max (if applicable), plus value/maxLength/step
function addPreference(prefName, prefSetting, description) {
  const root = document.getElementById("prefs");

  const row = document.createElement("div");
  row.className = "flex items-center gap-3 w-full px-2 py-1 rounded cursor-pointer select-none";

  // selection checkbox (left)
  const sel = document.createElement("input");
  sel.type = "checkbox";
  sel.className = "h-4 w-4 shrink-0";
  sel.checked = isSelected(prefName);

  const label = document.createElement("div");
  label.className = "text-sm font-medium whitespace-nowrap min-w-40";
  label.textContent = `${prettifyName(prefName)} :`;

  const controlWrap = document.createElement("div");
  controlWrap.className = "flex items-center gap-2 w-full";

  let input;

  if (prefSetting.type === "bool") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.className = "h-4 w-4";
    input.checked = Number(prefSetting.value) === 1;

    input.addEventListener("change", () => {
      appPrefs[prefName] = input.checked ? 1 : 0;
    });

  } else if (prefSetting.type === "number") {
    input = document.createElement("input");
    input.type = "number";
    input.className = "border rounded px-2 py-1 w-40 text-right";
    input.value = (prefSetting.value ?? "").toString();

    if (prefSetting.min !== undefined) input.min = String(prefSetting.min);
    if (prefSetting.max !== undefined) input.max = String(prefSetting.max);
    input.step = String(prefSetting.step ?? 1);

    input.addEventListener("input", () => {
      if (input.value === "") return;

      let v = Number(input.value);
      if (!Number.isFinite(v)) return;

      if (prefSetting.min !== undefined) v = Math.max(prefSetting.min, v);
      if (prefSetting.max !== undefined) v = Math.min(prefSetting.max, v);

      appPrefs[prefName] = (v | 0);
    });

  } else if (prefSetting.type === "string") {
    input = document.createElement("input");
    input.type = "text";
    input.className = "border rounded px-2 py-1 w-[28rem] max-w-full";
    input.value = (prefSetting.value ?? "").toString();

    if (prefSetting.maxLength !== undefined) input.maxLength = prefSetting.maxLength;

    input.addEventListener("input", () => {
      appPrefs[prefName] = input.value;
    });

  } else {
    input = document.createElement("span");
    input.className = "text-sm";
    input.textContent = String(prefSetting.value ?? "");
  }

  // Enable/disable input based on selection
  function applySelectionUI() {
    const on = sel.checked;

    // disable editing unless selected
    input.disabled = !on;

    // Visual hint: dim when not selected
    row.classList.toggle("opacity-60", !on);
    row.classList.toggle("bg-slate-50", on);

    // Make disabled inputs still look okay
    if (input.tagName === "INPUT" && input.type !== "checkbox") {
      input.classList.toggle("bg-gray-100", !on);
    }
  }

  // Toggle selection when clicking row (but not when interacting with the input itself)
  row.addEventListener("click", (e) => {
    if (e.target === input) return;               // don't toggle when typing
    if (e.target === sel) return;                 // checkbox handles itself
    sel.checked = !sel.checked;
    setSelected(prefName, sel.checked);
    applySelectionUI();
  });

  sel.addEventListener("change", () => {
    setSelected(prefName, sel.checked);
    applySelectionUI();
  });

  // Start state
  applySelectionUI();

  // Build row
  row.appendChild(sel);
  row.appendChild(label);
  controlWrap.appendChild(input);
  row.appendChild(controlWrap);
  root.appendChild(row);
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
  displayStatusInfo("errors", "Errors:", formatErrors(data["errors"]));


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
_
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
