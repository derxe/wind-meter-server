function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function displayValue(value) {
    return value === null || value === undefined || value === "" ? "--" : value;
}

function getLastTimestamp(entry) {
    return entry?.statusData?.timestamp || null;
}

function renderStatusBadge(statusInfo) {
    const badgeStyles = {
        "status-ok": {
            badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
            dot: "bg-emerald-500",
        },
        "status-offline": {
            badge: "border-slate-200 bg-slate-50 text-slate-600",
            dot: "bg-slate-400",
        },
        "status-sleeping": {
            badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
            dot: "bg-cyan-400",
        },
        "status-error": {
            badge: "border-rose-200 bg-rose-50 text-rose-700",
            dot: "bg-rose-500",
        },
        "status-non-responsive": {
            badge: "border-amber-200 bg-amber-50 text-amber-800",
            dot: "bg-amber-400",
        },
    };

    const style = badgeStyles[statusInfo?.statusClass] || badgeStyles["status-offline"];
    const label = escapeHtml(statusInfo?.label || "--");

    return `
        <div class="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${style.badge}">
            <span class="h-2 w-2 rounded-full ${style.dot}"></span>
            ${label}
        </div>
    `;
}

function renderDirectionIndicator(directionIndex) {
    const isValidDirection = Number.isInteger(directionIndex) && directionIndex >= 0 && directionIndex < 8;
    const directions = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ", "S"];

    const rotation = (directionIndex * 45 + 180) % 360;

    const directionArrow = !isValidDirection? "--" : `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            viewBox="0 0 24 24"
            fill="currentColor"
            style="transform: rotate(${rotation}deg);"
            aria-label="Smer vetra"
        >
            <path d="M12 4.5c.3 0 .6.1.8.4l4.7 5.2c.5.5.1 1.4-.7 1.4H14v7.8c0 .7-.5 1.2-1.2 1.2h-1.6c-.7 0-1.2-.5-1.2-1.2v-7.8H7.2c-.8 0-1.2-.9-.7-1.4l4.7-5.2c.2-.3.5-.4.8-.4z"/>
        </svg>`;

    return `
        <div class="flex justify-self-start mb-1 ">
            <div class="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-sky-600 shadow-sm">
                ${directionArrow}
            </div>
            <span class="ms-2 text-2xl font-bold text-slate-500 font-mono place-self-end">${displayValue(directions[directionIndex])}</span>
        </div>
    `;
}

let showAllStations = false;

function updateStationVisibilityToggle() {
    const toggle = document.getElementById("station-visibility-toggle");
    if (!toggle) return;

    toggle.textContent = showAllStations
        ? "Paragliding Wind Stations · All"
        : "Paragliding Wind Stations";
}

function isDataRecentEnough(timestamp) {
    if(!timestamp) return false;
    return timeSinceMinutes(timestamp) < 60; // data younget then 60 mins ago is considered fresh 
}

function renderStationCard(entry) {
    const station = entry?.station;
    if (!showAllStations && !station?.active) return "";

    const windData = entry.windData || {};
    const prefs = entry?.prefsData?.prefs || {};
    const lastTimestamp = getLastTimestamp(entry);
    const lastSeen = lastTimestamp ? formatElapsedMinutes(timeSinceMinutes(lastTimestamp)) : "--";
    const statusInfo = getStatusInfo(entry?.statusData, prefs, station);
    const statusBadge = renderStatusBadge(statusInfo);


    const directionIndicator = renderDirectionIndicator(isDataRecentEnough(windData.timestamp)? windData.dir : undefined);
    const windSpeedAvg = isDataRecentEnough(windData.timestamp)? windData.avg?.toFixed(1) : undefined;
    const windSpeedMax = isDataRecentEnough(windData.timestamp)? windData.max?.toFixed(1) : undefined;

    const stationMessage = !station.message? "" : `
    <div class="relative mt-3 mb-2 rounded-2xl border border-yellow-300 bg-yellow-50 shadow-sm p-2">
        <!-- Header -->
        <div class="flex items-center gap-3">
            <!-- Warning icon -->
            <div class="flex h-8 w-8 items-center justify-center
                rounded-full bg-yellow-100 text-yellow-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </div>
            <div id="station-msg" class="text-xs text-yellow-900 leading-relaxed">${station.message}</div>
        </div>
    </div>
    `

    return `
        <a
            href="${pathPrefix}/${encodeURIComponent(station.name || "")}"
            class="h-[fit-content] group relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg"
        >
            <div class="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-sky-300/25 via-cyan-200/15 to-transparent"></div>
            <div class="relative flex h-full flex-col">
                <div class="flex items-start justify-between gap-4 mb-2">
                    <div>
                        <h2 class="text-xl font-semibold tracking-tight text-slate-900">
                            ${escapeHtml(station.full_name || station.name)}
                        </h2>
                        <p class="mt-1 text-sm text-slate-400">
                            Zadnjič osveženo pred <b>${lastSeen}</b>
                        </p>
                    </div>
                    ${statusBadge}

                </div>
                
                ${stationMessage}

                <div class="mt-2 grid grid-cols-3 gap-3 text-sm text-slate-600">
                    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 grid content-between">
                        <div class="flex items-baseline justify-start gap-2 mb-1 ">
                            <span class="text-2xl font-semibold text-sky-500/80">${escapeHtml(displayValue(windSpeedAvg))}</span>
                            <span class="text-sm text-slate-400">m/s</span>
                        </div>
                        <div class="text-xs uppercase tracking-[0.16em] text-slate-400">povprečna</div>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 grid content-between">
                        <div class="flex items-baseline justify-start gap-2  ">
                            <span class="text-2xl font-semibold text-rose-500/60">${escapeHtml(displayValue(windSpeedMax))}</span>
                            <span class="text-sm text-slate-400">m/s</span>
                        </div>
                        <div class="text-xs uppercase tracking-[0.16em] text-slate-400">sunki</div>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 grid content-between">
                        ${directionIndicator}
                        <div class="text-xs justify-start uppercase tracking-[0.16em] text-slate-400">smer</div>
                    </div>
                </div>
            </div>
        </a>
    `;
}

function renderStations() {
    const stationList = document.getElementById("station-list");
    if (!stationList) return;

    updateStationVisibilityToggle();
    stationList.innerHTML = data.map(renderStationCard).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("station-visibility-toggle");
    if (toggle) {
        toggle.addEventListener("click", () => {
            showAllStations = !showAllStations;
            renderStations();
        });
    }

    renderStations();
});
