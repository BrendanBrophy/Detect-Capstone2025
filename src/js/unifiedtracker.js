// ========================================
// Global State & DOM References
// ========================================

let isTracking = false;
let trackingLog = [];
let pathCoordinates = [];

let map, liveMarker, pathLine, takeOffMarker, headingLine;

let currentHeading = "--";
let hasMarkedTakeOff = false;
let autoFollow = true;
let latestLat = 0;
let latestLng = 0;

let currentTransportMode = localStorage.getItem("transportMode") || "Walking";

const latEl    = document.getElementById("lat");
const lngEl    = document.getElementById("lng");
const headingEl = document.getElementById("heading");
const timeEl   = document.getElementById("timestamp");
const logBody  = document.getElementById("logBody");

let gpsBuffer = [];          // Last few GPS points for inferred transport
let usingDeviceGPS = false;
let geoWatchId = null;

let offlineAreaCircle = null;

// ========================================
// Idle Detection / Inferred Takeoff State
// ========================================

// For inferred takeoff & idle prompt based on movement
let lastMoveLat  = null;
let lastMoveLng  = null;
let lastMoveTime = null;

let inferredTakeoffLoggedForCurrentStop = false;
let idlePopupShownForCurrentStop        = false; // ensures popup is once per idle period

// Idle / movement thresholds
const STOP_DISTANCE_THRESHOLD_M      = 3;                 // ≤ 3 m → "no movement"
const INFERRED_TAKEOFF_IDLE_MS      = 5 * 60 * 1000;     // 5 minutes idle → inferred takeoff
const STOP_TRACKING_PROMPT_IDLE_MS  = 10 * 60 * 1000;    // 10 minutes idle → stop tracking prompt


// ========================================
// Map Setup
// ========================================

function initMap() {
  map = L.map("map").setView([0, 0], 15);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  // Zoom label
  const zoomLabel = document.getElementById("zoomLabel");
  if (zoomLabel) {
    zoomLabel.textContent = `Zoom: ${map.getZoom()}`;
  }

  map.on("zoomend", () => {
    const z = map.getZoom();
    const el = document.getElementById("zoomLabel");
    if (el) el.textContent = `Zoom: ${z}`;
  });

  // Live marker for current position
  liveMarker = L.marker([0, 0]).addTo(map);

  // Heading line (direction line from current position)
  headingLine = L.polyline([[0, 0], [0, 0]], {
    color: "#ff4d4d",
    weight: 3,
    opacity: 0.9,
    dashArray: "5, 5"
  }).addTo(map);

  // Path polyline
  pathLine = L.polyline([], {
    color: "#08a18b",
    weight: 4,
    opacity: 0.8
  }).addTo(map);
}

// Draw offline radius circle on map
function drawOfflineRadius(centerLatLng, radiusMeters) {
  if (!map) return;

  if (offlineAreaCircle) {
    map.removeLayer(offlineAreaCircle);
  }

  offlineAreaCircle = L.circle(centerLatLng, {
    radius: radiusMeters,
    color: "#08a18b",
    weight: 2,
    fillColor: "#08a18b",
    fillOpacity: 0.08
  }).addTo(map);

  map.fitBounds(offlineAreaCircle.getBounds(), { padding: [20, 20] });
}


// ========================================
// DOMContentLoaded: Wire up UI
// ========================================

window.addEventListener("DOMContentLoaded", () => {
  initMap();

  // ------------------------------
  // Pre-download popup wiring
  // ------------------------------
  const preBtn       = document.getElementById("preDownloadBtn");
  const preModal     = document.getElementById("preDownloadModal");
  const preCancelBtn = document.getElementById("preCancelBtn");
  const preStartBtn  = document.getElementById("preStartBtn");
  const preRadius    = document.getElementById("preRadius");
  const preZoomMin   = document.getElementById("preZoomMin");
  const preZoomMax   = document.getElementById("preZoomMax");

  if (preBtn && preModal && preStartBtn) {
    preBtn.addEventListener("click", () => {
      preModal.style.display = "flex";

      // Reset progress & estimate text
      updateProgress(0);
      const txt = document.getElementById("preProgressText");
      if (txt) txt.textContent = "Not started";
      const size = document.getElementById("preSizeText");
      if (size) size.textContent = "Estimated size: --";
    });

    preCancelBtn?.addEventListener("click", () => {
      preModal.style.display = "none";
    });

    preStartBtn.addEventListener("click", () => {
      const radiusKm = Number(preRadius.value)  || 2;
      const zMin     = Number(preZoomMin.value) || 13;
      const zMax     = Number(preZoomMax.value) || 17;

      const center = map.getCenter();

      // 1) Draw radius on map
      drawOfflineRadius([center.lat, center.lng], radiusKm * 1000);

      // 2) Prefetch tiles via normal fetch()
      preloadTilesAroundCenter(
        radiusKm,
        zMin,
        zMax,
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      );
    });
  }

  // ------------------------------
  // Transport Mode Dropdown
  // ------------------------------
  const transportModeEl = document.getElementById("transportMode");
  if (transportModeEl) {
    transportModeEl.value = currentTransportMode;
    transportModeEl.addEventListener("change", () => {
      currentTransportMode = transportModeEl.value;
      localStorage.setItem("transportMode", currentTransportMode);
    });
  }

  // ------------------------------
  // Start / Stop Tracking
  // ------------------------------
  const startBtn = document.getElementById("startTracking");
  const stopBtn  = document.getElementById("stopTracking");

  if (startBtn && stopBtn) {
    startBtn.addEventListener("click", () => {
      isTracking = true;
      stopBtn.disabled  = false;
      startBtn.disabled = true;
    });

    stopBtn.addEventListener("click", () => {
      isTracking = false;
      stopBtn.disabled  = true;
      startBtn.disabled = false;
    });
  }

  // ------------------------------
  // Mark Take-Off
  // ------------------------------
  const markTakeOffBtn = document.getElementById("markTakeOff");
  if (markTakeOffBtn) {
    markTakeOffBtn.addEventListener("click", () => {
      if (!isTracking || trackingLog.length === 0) return;
      const last = trackingLog[trackingLog.length - 1];

      takeOffMarker = L.marker([last.lat, last.lng], {
        title: "Take-Off Location",
        icon: L.icon({
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-red.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [0, -35]
        })
      })
        .addTo(map)
        .bindPopup("Take-Off Location")
        .openPopup();

      const lastRow = logBody.lastChild;
      if (lastRow && lastRow.children[5]) {
        lastRow.children[5].textContent = "\u2714"; // checkmark
      }

      last.takeOff = "\u2714";
      hasMarkedTakeOff = true;
    });
  }

  // ------------------------------
  // Drop Note
  // ------------------------------
  const dropNoteBtn = document.getElementById("dropNote");
  if (dropNoteBtn) {
    dropNoteBtn.addEventListener("click", () => {
      const noteInput = document.getElementById("noteInput");
      const noteText = noteInput.value.trim();

      if (!noteText || !isTracking || trackingLog.length === 0) return;

      const last = trackingLog[trackingLog.length - 1];
      last.note = noteText;

      L.marker([last.lat, last.lng])
        .addTo(map)
        .bindPopup("Note: " + noteText)
        .openPopup();

      const lastRow = logBody.lastChild;
      if (lastRow && lastRow.children[4]) {
        lastRow.children[4].textContent = noteText;
      }

      noteInput.value = "";
    });
  }

  // ------------------------------
  // Follow Map Toggle
  // ------------------------------
  const followCheckbox = document.getElementById("followMap");
  if (followCheckbox) {
    followCheckbox.addEventListener("change", (e) => {
      autoFollow = e.target.checked;
    });
  }

  // ------------------------------
  // Recenter Map Button
  // ------------------------------
  const recenterBtn = document.getElementById("recenterMap");
  if (recenterBtn) {
    recenterBtn.addEventListener("click", () => {
      if (latestLat !== 0 && latestLng !== 0) {
        map.setView([latestLat, latestLng]);
      } else {
        alert("No GPS fix yet.");
      }
    });
  }

  // ------------------------------
  // Reset App Button
  // ------------------------------
  const resetBtn = document.getElementById("resetApp");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Are you sure you want to reset the app? This will clear the map and all logs.")) return;

      // Reset UI labels
      if (latEl) latEl.textContent = "--";
      if (lngEl) lngEl.textContent = "--";
      if (headingEl) headingEl.textContent = "--";
      if (timeEl) timeEl.textContent = "--";

      // Clear paths / markers
      if (pathLine) pathLine.setLatLngs([]);
      if (headingLine) headingLine.setLatLngs([[0, 0], [0, 0]]);
      if (takeOffMarker) {
        map.removeLayer(takeOffMarker);
        takeOffMarker = null;
      }
      if (liveMarker) {
        liveMarker.setLatLng([0, 0]);
      }

      // Remove circle markers
      map.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) map.removeLayer(layer);
      });

      // Clear logs & arrays
      logBody.innerHTML = "";
      trackingLog = [];
      pathCoordinates = [];
      hasMarkedTakeOff = false;
      gpsBuffer = [];

      // Reset idle state
      lastMoveLat  = null;
      lastMoveLng  = null;
      lastMoveTime = null;
      inferredTakeoffLoggedForCurrentStop = false;
      idlePopupShownForCurrentStop = false;

      // Allow start tracking again
      const sBtn = document.getElementById("startTracking");
      const tBtn = document.getElementById("stopTracking");
      if (sBtn && tBtn) {
        sBtn.disabled = false;
        tBtn.disabled = true;
      }
    });
  }

  // ------------------------------
  // Device GPS Toggle Button
  // ------------------------------
  const gpsButton = document.getElementById("toggleDeviceGPS");
  if (gpsButton) {
    gpsButton.addEventListener("click", () => {
      if (!usingDeviceGPS) {
        // Turn on
        if ("geolocation" in navigator) {
          gpsButton.textContent = "Using Device GPS...";
          gpsButton.style.backgroundColor = "#4CAF50";
          usingDeviceGPS = true;

          geoWatchId = navigator.geolocation.watchPosition(
            (pos) => {
              latestLat = pos.coords.latitude;
              latestLng = pos.coords.longitude;
              currentHeading = pos.coords.heading ?? 0;

              if (headingEl) headingEl.textContent = currentHeading + "°";

              // Update marker + map even if not tracking
              if (liveMarker) liveMarker.setLatLng([latestLat, latestLng]);
              if (autoFollow && map) map.setView([latestLat, latestLng]);
            },
            (err) => alert("Error accessing device GPS: " + err.message),
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
          );
        } else {
          alert("Your browser does not support Geolocation.");
        }
      } else {
        // Turn off
        if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
        gpsButton.textContent = "Use Device GPS";
        gpsButton.style.backgroundColor = "#ffa500";
        usingDeviceGPS = false;
      }
    });
  }
});


// ========================================
// Heading Update (called from chip)
// ========================================

window.updateHeading = function (degrees) {
  currentHeading = degrees;

  if (headingEl) headingEl.textContent = degrees + "°";

  // Map compass overlay
  const compassLabel = document.getElementById("compassLabel");
  if (compassLabel) {
    compassLabel.textContent = getCompassDirection(degrees);
  }

  // Optional: Live data "Direction" text, if present
  const compassText = document.getElementById("compassText");
  if (compassText) {
    compassText.textContent = getCompassDirection(degrees);
  }

  // Rotate heading line
  if (latestLat && latestLng && headingLine) {
    const distance = 0.0003; // small offset for the line
    const headingRad = (degrees * Math.PI) / 180;
    const destLat = latestLat + distance * Math.cos(headingRad);
    const destLng = latestLng + distance * Math.sin(headingRad);
    headingLine.setLatLngs([[latestLat, latestLng], [destLat, destLng]]);
  }
};


// ========================================
// GPS Update & Logging (called from chip)
// ========================================

window.updateGPS = function (lat, lng, timestamp) {
  const timeStr = new Date(parseInt(timestamp, 10)).toLocaleTimeString();

  if (latEl) latEl.textContent = lat.toFixed(5);
  if (lngEl) lngEl.textContent = lng.toFixed(5);
  if (timeEl) timeEl.textContent = timeStr;

  if (!isTracking) return;

  // -----------------------------
  // GPS buffer for inferred transport
  // -----------------------------
  gpsBuffer.push({ lat, lng, time: timestamp / 1000 });
  if (gpsBuffer.length > 3) gpsBuffer.shift();

  let inferredTransport = "--";
  if (gpsBuffer.length >= 2) {
    let totalDistance = 0;
    let totalTime = 0;

    for (let i = 1; i < gpsBuffer.length; i++) {
      const prev = gpsBuffer[i - 1];
      const curr = gpsBuffer[i];
      const distance = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      const dt = curr.time - prev.time;

      totalDistance += distance;
      totalTime += dt;
    }

    if (totalTime > 0) {
      const avgSpeedKmh = (totalDistance / totalTime) * 3.6;
      inferredTransport = avgSpeedKmh < 6 ? "Walking" : "Driving";
    }
  }

  // -----------------------------
  // Add row to log table
  // -----------------------------
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${timeStr}</td>
    <td>${lat.toFixed(5)}</td>
    <td>${lng.toFixed(5)}</td>
    <td>${currentHeading}</td>
    <td>--</td>
    <td>--</td>
    <td>${currentTransportMode}</td>
    <td>${inferredTransport}</td>
  `;
  logBody.appendChild(row);

  // Save to tracking log array
  trackingLog.push({
    timestamp: timeStr,
    lat,
    lng,
    heading: currentHeading,
    note: "",
    takeOff: "",
    transport: currentTransportMode,
    inferredTransport
  });

  // -----------------------------
  // Movement tracking (idle → inferred takeoff / popup)
  // -----------------------------
  const nowMs = Date.now();

  // First GPS point for movement tracking
  if (lastMoveLat === null || lastMoveLng === null) {
    lastMoveLat  = lat;
    lastMoveLng  = lng;
    lastMoveTime = nowMs;
    inferredTakeoffLoggedForCurrentStop = false;
    idlePopupShownForCurrentStop        = false;
  } else {
    const dist = haversineDistance(lastMoveLat, lastMoveLng, lat, lng);

    if (dist > STOP_DISTANCE_THRESHOLD_M) {
      // We moved → reset idle timer / flags
      lastMoveLat  = lat;
      lastMoveLng  = lng;
      lastMoveTime = nowMs;
      inferredTakeoffLoggedForCurrentStop = false;
      idlePopupShownForCurrentStop        = false;
    } else {
      // Not moving
      const idleTime = nowMs - lastMoveTime;

      // 1) Inferred takeoff once after 5 minutes of idle
      if (
        !inferredTakeoffLoggedForCurrentStop &&
        idleTime >= INFERRED_TAKEOFF_IDLE_MS
      ) {
        const lastRow = logBody.lastElementChild;
        if (lastRow && lastRow.children && lastRow.children[4]) {
          lastRow.children[4].textContent = "Inferred takeoff (idle 5 min)";
        }

        if (trackingLog.length > 0) {
          const lastEntry = trackingLog[trackingLog.length - 1];
          lastEntry.note = "Inferred takeoff (idle 5 min)";
          lastEntry.isInferredTakeoff = true;
        }

        inferredTakeoffLoggedForCurrentStop = true;
      }

      // 2) Popup after 10 minutes of idle (once per idle period)
      if (
        !idlePopupShownForCurrentStop &&
        idleTime >= STOP_TRACKING_PROMPT_IDLE_MS &&
        isTracking
      ) {
        idlePopupShownForCurrentStop = true;

        const stopNow = window.confirm(
          "You've been stationary for 10 minutes. Do you want to stop tracking?"
        );

        if (stopNow) {
          isTracking = false;
          const sBtn = document.getElementById("startTracking");
          const tBtn = document.getElementById("stopTracking");
          if (sBtn && tBtn) {
            sBtn.disabled = false;
            tBtn.disabled = true;
          }
        }
      }
    }
  }

  // -----------------------------
  // Map update
  // -----------------------------
  liveMarker.setLatLng([lat, lng]);
  if (autoFollow) map.setView([lat, lng]);

  pathCoordinates.push([lat, lng]);
  pathLine.setLatLngs(pathCoordinates);

  L.circleMarker([lat, lng], {
    radius: 2,
    color: "#007aff",
    fillColor: "#007aff",
    fillOpacity: 0.9,
    weight: 2
  }).addTo(map);
};


// ========================================
// Periodic Logging (every 5 seconds)
// ========================================

setInterval(() => {
  if (isTracking && latestLat && latestLng) {
    window.updateGPS(latestLat, latestLng, Date.now());
  }
}, 5000);


// ========================================
// Distance & Direction Helpers
// ========================================

// Haversine distance (meters)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;

  lat1 = parseFloat(lat1.toFixed(5));
  lon1 = parseFloat(lon1.toFixed(5));
  lat2 = parseFloat(lat2.toFixed(5));
  lon2 = parseFloat(lon2.toFixed(5));

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCompassDirection(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}


// ========================================
// Voice-to-Text (Mic + Language Selector)
// ========================================

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const micBtn    = document.getElementById("micBtn");
const noteInput = document.getElementById("noteInput");
const noteLang  = document.getElementById("noteLang");

let recognition = null;
let listening   = false;
let finalBuffer = "";

// Helper: show warning when offline / network error
function speechNeedsInternet() {
  alert(
    "Speech-to-text needs an internet connection in this browser. You can still type notes manually."
  );
}

if (SpeechRecognition && micBtn && noteInput) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = (noteLang && noteLang.value) || "en-CA";

  // Language dropdown changes recognition language
  noteLang?.addEventListener("change", () => {
    recognition.lang = noteLang.value;
    if (listening) {
      listening = false;
      micBtn.classList.remove("recording");
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    }
  });

  // Mic button toggles STT
  micBtn.addEventListener("click", () => {
    if (!navigator.onLine) {
      speechNeedsInternet();
      return;
    }

    if (!listening) {
      finalBuffer = "";
      try {
        recognition.start();
        micBtn.classList.add("recording");
        listening = true;
      } catch (e) {
        listening = false;
        micBtn.classList.remove("recording");
        speechNeedsInternet();
      }
    } else {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      micBtn.classList.remove("recording");
      listening = false;
    }
  });

  // Recognition results → append to noteInput
  recognition.addEventListener("result", (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalBuffer += (r[0].transcript || "") + " ";
      else interim += r[0].transcript || "";
    }
    noteInput.value = (finalBuffer + interim).trim();
  });

  // Handle network errors cleanly
  recognition.addEventListener("error", (e) => {
    if (e.error === "network") {
      listening = false;
      micBtn.classList.remove("recording");
      speechNeedsInternet();
    }
  });

  // Engine stopped unexpectedly
  recognition.addEventListener("end", () => {
    if (listening && !navigator.onLine) {
      listening = false;
      micBtn.classList.remove("recording");
      speechNeedsInternet();
    }
  });
} else if (micBtn) {
  // No STT support at all
  micBtn.addEventListener("click", () => {
    alert(
      "Speech-to-text is not supported in this browser. You can still type notes manually."
    );
  });
}


// ========================================
// Offline Map Pre-Download Helpers
// ========================================

const TILE_SIZE = 256;

// lon/lat → XYZ tile index (Web Mercator)
function lonLatToTileXY(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n
  );
  return { x, y };
}

// Radius in meters → approx deg lat/lng at given latitude
function metersToLngLatDelta(radius_m, lat) {
  const dLat = radius_m / 111320; // meters per degree latitude
  const dLng = radius_m / (111320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng };
}

// Haversine in meters (separate from main haversineDistance)
function offlineHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// All tiles whose centers fall inside a circle
function tilesInCircle(center, radius_m, z) {
  const { lng, lat } = center;
  const { dLat, dLng } = metersToLngLatDelta(radius_m, lat);
  const min = { lng: lng - dLng, lat: lat - dLat };
  const max = { lng: lng + dLng, lat: lat + dLat };

  const tMin = lonLatToTileXY(min.lng, max.lat, z);
  const tMax = lonLatToTileXY(max.lng, min.lat, z);

  const tiles = [];
  for (let x = tMin.x; x <= tMax.x; x++) {
    for (let y = tMin.y; y <= tMax.y; y++) {
      const n = 2 ** z;
      const lonT = (x / n) * 360 - 180 + 180 / n;
      const latRad = Math.atan(
        Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))
      );
      const latT = (latRad * 180) / Math.PI;
      const d = offlineHaversine(lat, lng, latT, lonT);
      if (d <= radius_m) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

const AVG_TILE_BYTES_DEFAULT = 120_000; // rough estimate

// Build list of tile URLs to prefetch
async function buildTileList(center, radius_m, zMin, zMax, urlTemplate) {
  const urls = [];
  for (let z = zMin; z <= zMax; z++) {
    for (const { x, y } of tilesInCircle(center, radius_m, z)) {
      const url = urlTemplate
        .replace("{z}", z)
        .replace("{x}", x)
        .replace("{y}", y);
      urls.push(url);
    }
  }
  return urls;
}

function estimateBytes(tileCount, avg = AVG_TILE_BYTES_DEFAULT) {
  return tileCount * avg;
}

// Prefetch tiles around center (normal fetch → HTTP cache)
async function preloadTilesAroundCenter(radiusKm, zMin, zMax, urlTemplate) {
  if (!map) return;

  const center = map.getCenter();
  const radius_m = radiusKm * 1000;

  const urls = await buildTileList(
    { lat: center.lat, lng: center.lng },
    radius_m,
    zMin,
    zMax,
    urlTemplate
  );

  const estBytes = estimateBytes(urls.length);
  updateEstimate(estBytes);

  let done = 0;
  showProgress(0);

  for (const url of urls) {
    try {
      await fetch(url, { mode: "cors" });
      // Browser keeps them in normal HTTP cache
    } catch {
      // ignore individual failures
    }
    done++;
    const pct = (done / urls.length) * 100;
    updateProgress(pct);
  }

  markAreaReady();
}

// Progress UI helpers
function showProgress(pct) {
  updateProgress(pct);
}

function updateProgress(pct) {
  const fill = document.getElementById("preProgressFill");
  const txt  = document.getElementById("preProgressText");
  if (fill) fill.style.width = `${pct.toFixed(0)}%`;
  if (txt)  txt.textContent  = `Downloaded ${pct.toFixed(0)}%`;
}

function updateEstimate(bytes) {
  const el = document.getElementById("preSizeText");
  if (!el) return;
  const mb = bytes / 1_000_000;
  el.textContent = `Estimated size: ${mb.toFixed(1)} MB`;
}

function markAreaReady() {
  const txt = document.getElementById("preProgressText");
  if (txt) txt.textContent = "Download complete (browser cache).";
}
