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

//ServiceWorker file call for map update
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

function initMap() {
  map = L.map('map').setView([0, 0], 15);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

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

  setupPreDownloadMessaging();
  
    // --- Pre-download popup wiring ---
  const preBtn       = document.getElementById("preDownloadBtn");
  const preModal     = document.getElementById("preDownloadModal");
  const preCancelBtn = document.getElementById("preCancelBtn");
  const preStartBtn  = document.getElementById("preStartBtn");
  const preRadius    = document.getElementById("preRadius");
  const preZoomMin   = document.getElementById("preZoomMin");
  const preZoomMax   = document.getElementById("preZoomMax");

  if (preBtn && preModal && preStartBtn) {
    // open modal
    preBtn.addEventListener("click", () => {
      preModal.style.display = "flex";
    });

    // close modal
    preCancelBtn?.addEventListener("click", () => {
      preModal.style.display = "none";
    });

    // start download
    preStartBtn.addEventListener("click", () => {
      const radiusKm = Number(preRadius.value)  || 2;
      const zMin     = Number(preZoomMin.value) || 13;
      const zMax     = Number(preZoomMax.value) || 17;

      const center = map.getCenter();

      // draw radius on map
      drawOfflineRadius([center.lat, center.lng], radiusKm * 1000);

      // kick off tile download
      startPreDownloadFromMap(
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
    if (!isTracking || trackingLog.length === 0 || hasMarkedTakeOff) return;
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
    hasMarkedTakeOff = true;
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
window.updateGPS = function(lat, lng, timestamp) {
  const timeStr = new Date(parseInt(timestamp)).toLocaleTimeString();
  if (latEl) latEl.textContent = lat.toFixed(5);
  if (lngEl) lngEl.textContent = lng.toFixed(5);
  if (timeEl) timeEl.textContent = timeStr;

  if (!isTracking) return;

  // GPS buffer
  gpsBuffer.push({ lat, lng, time: timestamp / 1000 });
  if (gpsBuffer.length > 3) gpsBuffer.shift();

  // Inferred transport
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
    const avgSpeedKmh = (totalDistance / totalTime) * 3.6;
    inferredTransport = avgSpeedKmh < 6 ? "Walking" : "Driving";
  }

  // Add table row
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

  // Update map
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

if (SpeechRecognition && micBtn && noteInput) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = (noteLang && noteLang.value) || "en-CA";

  noteLang?.addEventListener("change", () => {
    recognition.lang = noteLang.value;
    if (listening) {
      recognition.stop();
      setTimeout(() => recognition.start(), 150);
    }
  });

  micBtn.addEventListener("click", () => {
    if (!listening) {
      finalBuffer = "";
      recognition.start();
      micBtn.classList.add("recording");
      listening = true;
    } else {
      recognition.stop();
      micBtn.classList.remove("recording");
      listening = false;
    }
  });

  recognition.addEventListener("result", (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalBuffer += (r[0].transcript || "") + " ";
      else interim += (r[0].transcript || "");
    }
    noteInput.value = (finalBuffer + interim).trim();
  });

  recognition.addEventListener("end", () => {
    if (listening) {
      try { recognition.start(); } catch {}
    } else {
      micBtn.classList.remove("recording");
    }
  });
}

//Download Map Update
// ---- Offline pre-download helpers (main JS) ----

let currentAreaId = null;

const TILE_SIZE = 256;

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

// haversine in meters (separate from your existing haversineDistance)
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

const AVG_TILE_BYTES_DEFAULT = 120_000; // tweak for your provider

// build list of tile URLs to cache
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

// main entry: called from your UI when user confirms download
async function predownloadArea(options) {
  const { areaId, center, radius_m, zMin, zMax, urlTemplate } = options;

  if (!("serviceWorker" in navigator)) {
    alert("Service worker not supported in this browser.");
    return;
  }

  const urls = await buildTileList(center, radius_m, zMin, zMax, urlTemplate);
  const estBytes = estimateBytes(urls.length);
  updateEstimate(estBytes); // you can implement this to update the UI

  const reg = await navigator.serviceWorker.ready;
  if (!reg.active) {
    alert("Service worker not active yet. Try again in a moment.");
    return;
  }

  reg.active.postMessage({
    type: "CACHE_TILES",
    areaId,
    urls
  });
}

// helper to start from current map view (you can call this from your modal)
function startPreDownloadFromMap(radiusKm, zMin, zMax, urlTemplate) {
  if (!map) {
    console.error("Map not initialized");
    return;
  }
  const center = map.getCenter();
  currentAreaId = crypto.randomUUID();

  showProgress(0); // simple UI hook – implement as you like

  predownloadArea({
    areaId: currentAreaId,
    center: { lng: center.lng, lat: center.lat },
    radius_m: radiusKm * 1000,
    zMin,
    zMax,
    urlTemplate
  });
}

// listen for SW progress messages (call once on startup)
function setupPreDownloadMessaging() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (evt) => {
    const { type, areaId, done, total } = evt.data || {};
    if (!currentAreaId || areaId !== currentAreaId) return;

    if (type === "CACHE_PROGRESS") {
      const pct = total ? (done / total) * 100 : 0;
      updateProgress(pct); // your UI hook
    } else if (type === "CACHE_DONE") {
      markAreaReady(); // your UI hook
    }
  });
}

// expose helpers if you want to call from HTML
window.startPreDownloadFromMap = startPreDownloadFromMap;
window.setupPreDownloadMessaging = setupPreDownloadMessaging;



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
  if (txt) txt.textContent = "Download complete (available offline).";
}
