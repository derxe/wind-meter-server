console.log("status_update.js loaded");


$(function() {
    getStatus();
});

function getStatus() {
  if (preloadedStatusData) {
    // if preloadedStatusData exist load that data instead of getting query for it 
    displayStatusData(preloadedStatusData);
  } else {
    $.getJSON("data/status.json", function(data) {
      console.log(data)
      displayStatusData(data);
    });
  }
}

function displayStatusData(data) {
  $('#loading-status-msg').hide();

  console.log('Got new status:', data);
  setStatuionParametersPannel(data);
  updateStatusPannel(data);
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

function isDeviceSleeping() {
  const now = new Date();
  const hour = now.getHours();
  // Sleeping between 20:00 and 06:00 
  return (hour >= 19 || hour < 6);
}

function updateStatusPannel(data) {
  let timeSinceLastSend = timeSinceMinutes(data["timestamp"]);
  timeSinceLastSend = 1;
  const timeSinceStr = timeSince(data["timestamp"]);
  const time = formattedTime(data["timestamp"]);

  let bubleText = "--";
  let titleText = "--";
  let detailsText = "";
  let statusClass = "status-offline"
  if(timeSinceLastSend < 22) {
    bubleText = "vse ok"
    titleText = "Deluje"
    statusClass = "status-ok"
  } else if(timeSinceLastSend >= 200) {
    bubleText = "neodzivna!"
    titleText = "Napaka"
    statusClass = "status-error"
  } else if(timeSinceLastSend >= 22) {
    bubleText = "zastareli podatki"
    titleText = "Ni odziva 🤔"
    statusClass = "status-non-responsive"
  }

  if(isDeviceSleeping()) {
    bubleText = "Zzzz Zzzzz..."
    titleText = "Naprava počiva 😴"
    detailsText = `Naprava ne pošilja podatkov med <b>8 uro</b> zvečer in <b>6 uro</b> zutraj.<br>`;
    statusClass = "status-sleeping"
  }

  toggleOverlay("sleeping", isDeviceSleeping());

  detailsText += `Postaja zadnjič poslala podatke: <b>${time}</b>, pred <b>${timeSinceStr}</b>`;

  $("#header")
    .removeClass("status-ok status-offline status-sleeping status-error status-non-responsive")
    .addClass(statusClass);

  $("#status-bubble-text").text(bubleText);
  $("#status-title-text").text(titleText);
  $("#status-detailed-text").html(detailsText);
}

function setStatuionParametersPannel(data) {
  const signal = csqToSignalAuto(data["signal"])
  const signalQualityStr = `${signal.quality}, ${signal.dbm} dB`;

  displayStatusInfo("Čas meritve:", `${formattedDate(data["timestamp"])}<br>(pred ${timeSince(data["timestamp"])})`);
  displayStatusInfo("Telefonska:", data["phoneNum"]??"--");
  displayStatusInfo("Baterija:", (data["vbatIde"]??"--") + " V");
  displayStatusInfo("Baterija med GPRS:", (data["vbatIde"]??"--") + " V");
  displayStatusInfo("Solar:", (data["vsol"]??"--") + " V");
  displayStatusInfo("Signal:", signalQualityStr);
  displayStatusInfo("Trajanje registracije:", (data["regDur"]??"--") + "s");
  displayStatusInfo("Trajanje GPRS registracije:", (data["gprsRegDur"]??"--") + "s");
  displayStatusInfo("Trajanje skupaj:", (data["dur"]??"--") + "s");
  displayStatusInfo("FW version:", data["ver"]);

  const battProc = batteryVoltageToProcentage(data["vbatIde"]);
  const battBarColor = batteryColorHex(battProc);
  displayStatusBar("Baterija", `${battProc}%`, battProc, battBarColor)

  const vSolar = data["vsol"];
  const vSolarProc = vSolar / 8 * 100;
  const solarBarColor = signalColorHex(vSolarProc)
  displayStatusBar("Napetost solarne", `${vSolar} V`, vSolarProc, solarBarColor)
  //displayStatusBar("Temepratura", `12 ˚C`, "40", "#38bdf8")

  const signalBarColor = signalColorHex(signal.percent);
  displayStatusBar("Signal", signalQualityStr, signal.percent, signalBarColor)

  const vbatRate = data["vbat_rate1"];
  const vbatRateLabel = vbatRate > 0? "Hitrost polnenja" : "Hitrost praznenja";
  const vbatRateProc = vbatRate / 100 * 100;
  const vbatRateColor = batteryRateColorHex(vbatRateProc)
  displayStatusBar(vbatRateLabel, `${vbatRate} mV/h`, vbatRateProc, vbatRateColor)
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
