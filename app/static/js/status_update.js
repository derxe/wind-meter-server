console.log("status_update.js loaded");



$(function() {
  let prefs = {};
  if ("prefs" in preloadedPrefs) {
    prefs = preloadedPrefs["prefs"]; // we only care about the prefs object, not the whole document
    prefs["station_name"] = preloadedPrefs["station_name"]; // maybe the station_name might come useful 
  } 

  displayStatusData(preloadedStatusData, prefs);

  $(document).on('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      console.log("visibility visible: calculating new refresh time!");
    } else {
      console.log('Tab hidden');
    }
  });
});

let cachedStatusData;
const pageLoadTime = Date.now();

function siteLoadedLongerThanXMin(mins) {
  return (Date.now() - pageLoadTime) > mins * 60 * 1000;
}


let statusDataRefreshTimeout;
function displayStatusData(data, prefs) {
  $('#loading-status-msg').hide();

  console.log('Got new status data:', data, prefs);
  
  updateStatusPannel(data, prefs);
  setStatuionParametersPannel(data, prefs);

  if(statusDataRefreshTimeout) clearTimeout(statusDataRefreshTimeout);

  statusDataRefreshTimeout = setInterval(()=> {
      updateStatusPannel(data, prefs);
      setStatuionParametersPannel(data, prefs);
  }, 10*1000); // update every 10 seconds 
}

function toggleOverlay(type, show) {
  const $targets = $(`[data-overlay="${type}"]`);
  if (show) {
    $targets.removeClass("hidden").addClass("flex");
  } else {
    $targets.addClass("hidden").removeClass("flex");
  }
}

function displayStatusInfo(name, value) {
  var content = `
    <div class="flex items-center justify-between">
      <span class="text-sm text-slate-500">${name}</span>
      <span class="text-base text-right font-semibold text-slate-800">${value ?? "--"}</span>
    </div>
  `;

  // Append the new content to the #status-graphical-info div
  $('#status-info').append(content);
}

function formattedTime(isoString) {
  if (!isoString) return "--";

  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${hh}:${min}`;
}

const sleepStart = 18;
const sleepEnd = 8; 

function isDeviceInPowerSavingMode(prefs) {
  if(!prefs)  return false;

  if(prefs.sleep_enabled !== "2") return false; // make sure the device is in sleep mode 2

  if (!("sleep_hour_start" in prefs && "sleep_hour_end" in prefs)) return false;

  const sleepStart = parseInt(prefs["sleep_hour_start"], 10);
  const sleepEnd = parseInt(prefs["sleep_hour_end"], 10);

  const now = new Date();
  const hour = now.getHours();
  return (hour >= sleepStart || hour < sleepEnd);
}

function isDeviceSleeping(prefs) {
  if(!prefs)  return false;

  if(prefs.sleep_enabled !== "1") return false; // make sure the device has sleep mode enabled

  if (!("sleep_hour_start" in prefs && "sleep_hour_end" in prefs)) return false;

  const sleepStart = parseInt(prefs["sleep_hour_start"], 10);
  const sleepEnd = parseInt(prefs["sleep_hour_end"], 10);

  const now = new Date();
  const hour = now.getHours();
  return (hour >= sleepStart || hour < sleepEnd);
}

function getSendInterval(prefs) {
  if(isDeviceInPowerSavingMode(prefs)) {
    const DEF_SLEEP_SEND_INTERVAL_MIN = 60; // default sleep send interval
    return "sleep_dur_min" in prefs? parseInt(prefs["sleep_dur_min"], 10) : DEF_SLEEP_SEND_INTERVAL_MIN; // if the device is in sleep mode, use the sleep send interval
  }
  else return parseInt(prefs["send_data_interval_min"], 10);
}

function getStatusInfo(data, prefs, station) {
  const safePrefs = prefs || {};
  const stationInfo = station || {};
  const timestamp = data?.timestamp;
  const timeSinceLastSendMin = timestamp ? timeSinceMinutes(timestamp) : Number.POSITIVE_INFINITY;
  const sendInterval = getSendInterval(safePrefs);
  const sendIntervalOk = Math.min(sendInterval * 2.5, 40);
  const sendIntervalError = 60 * 24 * 2;

  let label = "--";
  let statusClass = "status-offline";

  if (timeSinceLastSendMin < sendIntervalOk) {
    label = "Deluje";
    statusClass = "status-ok";
  } else if (timeSinceLastSendMin >= sendIntervalError) {
    label = "Napaka";
    statusClass = "status-error";
  } else if (timeSinceLastSendMin >= sendIntervalOk) {
    label = "Ni odziva";
    statusClass = "status-non-responsive";
  }

  if (isDeviceInPowerSavingMode(safePrefs)) {
    label = "Varčni način";
    statusClass = "status-sleeping";
  }

  if (isDeviceSleeping(safePrefs)) {
    label = "Naprava počiva";
    statusClass = "status-sleeping";
  }

  if (stationInfo.status === "offline") {
    label = "Začasno Onemogočena";
    statusClass = "status-offline";
  }

  return {
    label,
    statusClass,
    timeSinceLastSendMin,
    sendInterval,
  };
}

function updateStatusPannel(data, prefs) {
  const statusInfo = getStatusInfo(data, prefs, stationData);
  let timeSinceLastSendMin = statusInfo.timeSinceLastSendMin;
  const timeSinceStr = formatTimeSince(data["timestamp"]);
  const time = formattedTime(data["timestamp"]);

  let bubleText = statusInfo.label;
  let detailsText = "";
  let statusClass = statusInfo.statusClass;
  const send_interval = statusInfo.sendInterval;

  if(isDeviceInPowerSavingMode(prefs)) {
    if(prefs && prefs.sleep_enabled === "2") { 
      detailsText =  `Naprava varčuje z baterijo zato med <b>${prefs["sleep_hour_start"]}.</b> in <b>${prefs["sleep_hour_end"]}. uro</b> `;
      detailsText += `pošilja podatke samo vsakih ${send_interval} min<br>`;
    }
  }

  if(isDeviceSleeping(prefs)) {
    if(prefs && prefs.sleep_enabled === "2") { 
      detailsText = `Naprava med <b>${prefs["sleep_hour_start"]} uro</b> in <b>${prefs["sleep_hour_end"]} uro</b> pošilja podatke samo vsakih ${send_interval} min<br>`;
    } else {
      detailsText = `Naprava je nastavljena, da ne pošilja podatkov med <b>${sleepStart} uro</b> in <b>${sleepEnd} uro</b>.<br>`;
    }
  }

  //toggleOverlay("sleeping", isDeviceSleeping());

  const nextExpectedSendMin = send_interval? send_interval - timeSinceLastSendMin : null;
  detailsText += `Podatki poslani ob: <b>${time}</b>`
  detailsText += `, pred <b>${timeSinceStr}</b>` 

  detailsText += `<i class="ml-1 text-slate-400">`;

  if(nextExpectedSendMin < 0) {
    nextExpectedSendMin 
    detailsText += `(kasni za ${formatElapsedMinutes(Math.abs(nextExpectedSendMin))})`;
  } else if (nextExpectedSendMin === 0) {
    detailsText += `(naslj. čez <1 min)`;
  } else {
    detailsText += `(naslj. čez ${formatElapsedMinutes(nextExpectedSendMin)})`;
  }
  detailsText += `</i>`;

  $("#header")
    .removeClass("status-ok status-offline status-sleeping status-error status-non-responsive")
    .addClass(statusClass);

  $("#status-bubble-text").text(bubleText);
  $("#status-detailed-text").html(detailsText);
  
  console.log("should refresh", timeSinceLastSendMin > send_interval, "in:", send_interval - timeSinceLastSendMin, "min");
  if(timeSinceLastSendMin > send_interval && siteLoadedLongerThanXMin(2)) { // TODO make it so that we recieve the message from the server when we have to reaload on data change 
    location.reload();
  }
}


function setStatuionParametersPannel(data, prefs) {
  $('#status-info').html("");
  $('#status-graphical-info').html("");

  const signal = csqToSignalAuto(data["signal"])
  const signalQualityStr = `${signal.quality}, ${signal.dbm} dB`;

  displayStatusInfo("Čas meritve:", `${formattedDate(data["timestamp"])}`);
  displayStatusInfo("Zadnjič:", `pred ${formatTimeSince(data["timestamp"])}`);
  displayStatusInfo("Interval pošiljanja:", `${prefs["send_data_interval_min"] ?? "--"} min`);
  displayStatusInfo("Baterija:", (data["vbatIde"]??"--") + " V");
  displayStatusInfo("Solar:", (data["vsol"]??"--") + " V");
  displayStatusInfo("Signal:", signalQualityStr);
  displayStatusInfo("Trajanje pošiljanja:", (data["dur"]??"--") + "s");
  displayStatusInfo("FW version:", data["ver"]);
  displayStatusInfo("Imsi:", data["imsi"] ?? prefs["imsi"] ?? "--");
  displayStatusInfo("Telefonska:", data["phoneNum"] ?? prefs["phoneNum"] ?? "--");

  const battProc = batteryVoltageToProcentage(data["vbatIde"]);
  const battBarColor = batteryColorHex(battProc);
  displayStatusBar("Baterija", `${battProc}%`, battProc, battBarColor)

  const vSolar = (data["vsol"]*1.0).toFixed(1);
  const vSolarProc = vSolar / 8 * 100;
  const solarBarColor = signalColorHex(vSolarProc)
  displayStatusBar("Napetost solarne", `${vSolar} V`, vSolarProc, solarBarColor)
  //displayStatusBar("Temepratura", `12 ˚C`, "40", "#38bdf8")

  const signalBarColor = signalColorHex(signal.percent);
  displayStatusBar("Signal", signalQualityStr, signal.percent, signalBarColor)

  if("vbat_rate" in data) {
    // only show if the parameter is set
    const vbatRate = data["vbat_rate"];
    const vbatRateLabel = vbatRate > 0? "Hitrost polnenja" : "Hitrost praznenja";
    const vbatRateProc = vbatRate / 100 * 100;
    const vbatRateColor = batteryRateColorHex(vbatRateProc)
    displayStatusBar(vbatRateLabel, `${vbatRate} mV/h`, vbatRateProc, vbatRateColor)
  }
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

function formatTimeSince(isoString) {
  diffMin = timeSinceMinutes(isoString);
  return formatElapsedMinutes(diffMin);
}

function formatElapsedMinutes(elapsed) {
  if (elapsed < 1) return "ravnokar";
  else if (elapsed < 60) return `${Math.floor(elapsed)} min`;
  else if (elapsed < 1440) return `${Math.floor(elapsed / 60)} ur`;
  else return `${Math.floor(elapsed / 1440)} dni`;
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
