let isTracking = false;
let trackingLog = [];
let pathCoordinates = [];
let map, liveMarker, pathLine, takeOffMarker, headingLine;
let currentHeading = "--";
let hasMarkedTakeOff = false;
let autoFollow = true;
let latestLat = 0;
let latestLng = 0;

let currentTransportMode = localStorage.getItem('transportMode') || 'Walking';

const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const headingEl = document.getElementById("heading");
const timeEl = document.getElementById("timestamp");
const logBody = document.getElementById("logBody");

let gpsBuffer = []; // Keep last 3 GPS points for speed calculation
let usingDeviceGPS = false;
let geoWatchId = null;

let offlineAreaCircle = null;

// For inferred takeoff detection (idle for 5 minutes)
let lastMoveLat = null;
let lastMoveLng = null;
let lastMoveTime = null;
let inferredTakeoffLoggedForCurrentStop = false;

const STOP_DISTANCE_THRESHOLD_M = 3;              // meters - "not moving"
const STOP_TIME_THRESHOLD_MS = 5 * 60 * 1000;     // 5 minutes

function initMap() {
  map = L.map('map').setView([0, 0], 15);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // init zoom label once map exists
  const zl = document.getElementById("zoomLabel");
  if (zl) zl.textContent = `Zoom: ${map.getZoom()}`;

  // update on zoom changes
  map.on("zoomend", () => {
    const z = map.getZoom();
    const el = document.getElementById("zoomLabel");
    if (el) el.textContent = `Zoom: ${z}`;
  });

  liveMarker = L.marker([0, 0]).addTo(map);

  headingLine = L.polyline([[0, 0], [0, 0]], {
    color: "#ff4d4d",
    weight: 3,
    opacity: 0.9,
    dashArray: "5, 5"
  }).addTo(map);

  pathLine = L.polyline([], {
    color: "#08a18b",
    weight: 4,
    opacity: 0.8
  }).addTo(map);
}

// Function to draw a circle radius
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

  // Optional: zoom map so the whole circle is visible
  map.fitBounds(offlineAreaCircle.getBounds(), { padding: [20, 20] });
}

window.addEventListener("DOMContentLoaded", () => {
  initMap();
  
    // --- Pre-download popup wiring (no service worker) ---
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

      // reset progress & estimate text
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

      // 1) draw radius on map
      drawOfflineRadius([center.lat, center.lng], radiusKm * 1000);

      // 2) prefetch tiles with normal fetch()
      preloadTilesAroundCenter(
        radiusKm,
        zMin,
        zMax,
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      );
    });
  }


  // Transport Mode
  const transportModeEl = document.getElementById('transportMode');
  if (transportModeEl) {
    transportModeEl.value = currentTransportMode;
    transportModeEl.addEventListener('change', () => {
      currentTransportMode = transportModeEl.value;
      localStorage.setItem('transportMode', currentTransportMode);
    });
  }

  // Start/Stop tracking
  document.getElementById("startTracking").addEventListener("click", () => {
    isTracking = true;
    document.getElementById("stopTracking").disabled = false;
    document.getElementById("startTracking").disabled = true;
  });

  document.getElementById("stopTracking").addEventListener("click", () => {
    isTracking = false;
    document.getElementById("stopTracking").disabled = true;
    document.getElementById("startTracking").disabled = false;
  });

  // Mark Take-Off
  document.getElementById("markTakeOff").addEventListener("click", () => {
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
    }).addTo(map).bindPopup("Take-Off Location").openPopup();

    const lastRow = logBody.lastChild;
    if (lastRow) lastRow.children[5].textContent = "\u2714"; // checkmark

    last.takeOff = "\u2714"; 
  });

  // Drop Note
  document.getElementById("dropNote").addEventListener("click", () => {
    const noteInput = document.getElementById("noteInput");
    const noteText = noteInput.value.trim();
    if (!noteText || !isTracking || trackingLog.length === 0) return;
    const last = trackingLog[trackingLog.length - 1];
    last.note = noteText;
    L.marker([last.lat, last.lng]).addTo(map).bindPopup("Note: " + noteText).openPopup();

    const lastRow = logBody.lastChild;
    if (lastRow) lastRow.children[4].textContent = noteText;
    noteInput.value = "";
  });

  // Follow toggle
  document.getElementById("followMap").addEventListener("change", e => {
    autoFollow = e.target.checked;
  });

  // Recenter Map
  document.getElementById("recenterMap").addEventListener("click", () => {
    if (latestLat !== 0 && latestLng !== 0) {
      map.setView([latestLat, latestLng]);
    } else {
      alert("No GPS fix yet.");
    }
  });

  // Reset App
  document.getElementById("resetApp").addEventListener("click", () => {
    if (!confirm("Are you sure you want to reset the app? This will clear the map and all logs.")) return;

    document.getElementById("lat").textContent = "--";
    document.getElementById("lng").textContent = "--";
    document.getElementById("heading").textContent = "--";
    document.getElementById("timestamp").textContent = "--";

    if (pathLine) pathLine.setLatLngs([]);
    if (headingLine) headingLine.setLatLngs([[0, 0], [0, 0]]);
    if (takeOffMarker) {
      map.removeLayer(takeOffMarker);
      takeOffMarker = null;
    }
    if (liveMarker) liveMarker.setLatLng([0, 0]);

    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    logBody.innerHTML = "";
    trackingLog = [];
    pathCoordinates = [];
    hasMarkedTakeOff = false;
    gpsBuffer = [];
  });

  // Device GPS button
  const gpsButton = document.getElementById("toggleDeviceGPS");
  if (gpsButton) {
    gpsButton.addEventListener("click", () => {
      if (!usingDeviceGPS) {
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

              // update marker + map even if not tracking
              if (liveMarker) liveMarker.setLatLng([latestLat, latestLng]);
              if (autoFollow && map) map.setView([latestLat, latestLng]);
            },
            (err) => alert("Error accessing device GPS: " + err.message),
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
          );
          
        } else alert("Your browser does not support Geolocation.");
      } else {
        if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
        gpsButton.textContent = "Use Device GPS";
        gpsButton.style.backgroundColor = "#ffa500";
        usingDeviceGPS = false;
      }
    });
  }
});

// Update heading
window.updateHeading = function(degrees) {
  currentHeading = degrees;
  if (headingEl) headingEl.textContent = degrees + "°";
  const compassLabel = document.getElementById("compassLabel");
  if (compassLabel) compassLabel.textContent = getCompassDirection(degrees);

  if (latestLat && latestLng && headingLine) {
    const distance = 0.0003;
    const headingRad = degrees * Math.PI / 180;
    const destLat = latestLat + distance * Math.cos(headingRad);
    const destLng = latestLng + distance * Math.sin(headingRad);
    headingLine.setLatLngs([[latestLat, latestLng], [destLat, destLng]]);
  }
};

// Update GPS & log
// Update GPS & log
window.updateGPS = function(lat, lng, timestamp) {
  const timeStr = new Date(parseInt(timestamp)).toLocaleTimeString();
  if (latEl) latEl.textContent = lat.toFixed(5);
  if (lngEl) lngEl.textContent = lng.toFixed(5);
  if (timeEl) timeEl.textContent = timeStr;

  if (!isTracking) return;

  // -----------------------------
  // GPS buffer for inferred transport
  // -----------------------------
  gpsBuffer.push({ lat, lng, time: timestamp / 1000 });
  if (gpsBuffer.length > 3) gpsBuffer.shift();

  // Inferred transport based on avg speed
  let inferredTransport = "--";
  if (gpsBuffer.length >= 2) {
    let totalDistance = 0, totalTime = 0;
    for (let i = 1; i < gpsBuffer.length; i++) {
      const prev = gpsBuffer[i - 1], curr = gpsBuffer[i];
      const distance = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      const deltaTime = curr.time - prev.time;
      totalDistance += distance;
      totalTime += deltaTime;
    }
    if (totalTime > 0) {
      const avgSpeedKmh = (totalDistance / totalTime) * 3.6;
      inferredTransport = avgSpeedKmh < 6 ? "Walking" : "Driving";
    }
  }

  // -----------------------------
  // Add table row for this sample
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

  // Save to tracking log
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
  // Movement tracking for inferred takeoff
  // -----------------------------
  const nowMs = Date.now();

  // First GPS point
  if (lastMoveLat === null || lastMoveLng === null) {
    lastMoveLat = lat;
    lastMoveLng = lng;
    lastMoveTime = nowMs;
    inferredTakeoffLoggedForCurrentStop = false;
  } else {
    const dist = haversineDistance(lastMoveLat, lastMoveLng, lat, lng);

    if (dist > STOP_DISTANCE_THRESHOLD_M) {
      // We moved → reset idle timer
      lastMoveLat = lat;
      lastMoveLng = lng;
      lastMoveTime = nowMs;
      inferredTakeoffLoggedForCurrentStop = false;
    } else {
      // Not moving
      const idleTime = nowMs - lastMoveTime;

      if (!inferredTakeoffLoggedForCurrentStop &&
          idleTime >= STOP_TIME_THRESHOLD_MS) {

        // Mark inferred takeoff on the LAST row recorded
        const lastRow = logBody.lastElementChild;
        if (lastRow && lastRow.children && lastRow.children[4]) {
          lastRow.children[4].textContent = "Inferred takeoff (idle 5 min)";
        }

        // Also add flag for exporter
        if (trackingLog.length > 0) {
          const lastEntry = trackingLog[trackingLog.length - 1];
          lastEntry.note = "Inferred takeoff (idle 5 min)";
          lastEntry.isInferredTakeoff = true;
        }

        inferredTakeoffLoggedForCurrentStop = true;
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


// Periodic logging every 5 seconds
setInterval(() => {
  if (isTracking && latestLat && latestLng) {
    updateGPS(latestLat, latestLng, Date.now());
  }
}, 5000); // log strictly every 5 seconds

// Haversine distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  lat1 = parseFloat(lat1.toFixed(5));
  lon1 = parseFloat(lon1.toFixed(5));
  lat2 = parseFloat(lat2.toFixed(5));
  lon2 = parseFloat(lon2.toFixed(5));

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCompassDirection(deg) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(deg / 45) % 8];
}
// --- Voice-to-Text (mic icon + small language box) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = document.getElementById("micBtn");
const noteInput = document.getElementById("noteInput");
const noteLang = document.getElementById("noteLang");

let recognition = null;
let listening = false;
let finalBuffer = "";

// helper: quick warning when offline / network error
function speechNeedsInternet() {
  alert("Speech-to-text needs an internet connection in this browser. You can still type notes manually.");
}

if (SpeechRecognition && micBtn && noteInput) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = (noteLang && noteLang.value) || "en-CA";

  // change STT language
  noteLang?.addEventListener("change", () => {
    recognition.lang = noteLang.value;
    if (listening) {
      listening = false;
      micBtn.classList.remove("recording");
      try { recognition.stop(); } catch {}
    }
  });

  // mic button click
  micBtn.addEventListener("click", () => {
    // no connection → don’t even try to start
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
        // if start fails because of network / permissions
        listening = false;
        micBtn.classList.remove("recording");
        speechNeedsInternet();
      }
    } else {
      try { recognition.stop(); } catch {}
      micBtn.classList.remove("recording");
      listening = false;
    }
  });

  // results → fill noteInput
  recognition.addEventListener("result", (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalBuffer += (r[0].transcript || "") + " ";
      else interim += (r[0].transcript || "");
    }
    noteInput.value = (finalBuffer + interim).trim();
  });

  // handle network errors cleanly
  recognition.addEventListener("error", (e) => {
    if (e.error === "network") {
      listening = false;
      micBtn.classList.remove("recording");
      speechNeedsInternet();
    }
  });

  // if the engine stops by itself while we think we’re listening
  recognition.addEventListener("end", () => {
    if (listening && !navigator.onLine) {
      listening = false;
      micBtn.classList.remove("recording");
      speechNeedsInternet();
    }
  });
} else if (micBtn) {
  // no STT support at all
  micBtn.addEventListener("click", () => {
    alert("Speech-to-text is not supported in this browser. You can still type notes manually.");
  });
}

//Download Map Update
// ---- Offline pre-download helpers (no service worker) ----

const TILE_SIZE = 256; // not strictly needed, but kept for clarity

// lon/lat → XYZ tile index (Web Mercator)
function lonLatToTileXY(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
  );
  return { x, y };
}

// radius in meters → approx deg lat/lng at given latitude
function metersToLngLatDelta(radius_m, lat) {
  const dLat = radius_m / 111320; // ~meters per degree latitude
  const dLng = radius_m / (111320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng };
}

// haversine in meters (separate from haversineDistance used for speed)
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

// all tiles whose centers fall inside a circle
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
      const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
      const latT = (latRad * 180) / Math.PI;
      const d = offlineHaversine(lat, lng, latT, lonT);
      if (d <= radius_m) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

const AVG_TILE_BYTES_DEFAULT = 120_000; // rough guess

// build list of tile URLs to prefetch
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

// NEW: plain JS prefetch, no service worker
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
      // browser should keep these in its normal HTTP cache
    } catch (e) {
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
