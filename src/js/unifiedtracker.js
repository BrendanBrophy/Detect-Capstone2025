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

function initMap() {
  map = L.map('map').setView([0, 0], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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

window.addEventListener("DOMContentLoaded", () => {
  initMap();

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
              // Only update latest coordinates, do NOT log immediately
              latestLat = pos.coords.latitude;
              latestLng = pos.coords.longitude;
              currentHeading = pos.coords.heading ?? 0;
              if (headingEl) headingEl.textContent = currentHeading + "°";
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

const TILE_SIZE = 256;
function lonLatToTileXY(lon, lat, z){
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2 * n);
  return {x, y};
}
function metersToLngLatDelta(radius_m, lat){
  const dLat = (radius_m / 111320) * 1;        // ~ meters per deg latitude
  const dLng = (radius_m / (111320 * Math.cos(lat*Math.PI/180)));
  return {dLat, dLng};
}
function tilesInCircle(center, radius_m, z){
  const {lng, lat} = center;
  const {dLat, dLng} = metersToLngLatDelta(radius_m, lat);
  const min = {lng: lng - dLng, lat: lat - dLat};
  const max = {lng: lng + dLng, lat: lat + dLat};
  const tMin = lonLatToTileXY(min.lng, max.lat, z);
  const tMax = lonLatToTileXY(max.lng, min.lat, z);
  const tiles = [];
  for(let x=tMin.x; x<=tMax.x; x++){
    for(let y=tMin.y; y<=tMax.y; y++){
      // keep tiles whose center falls inside the circle
      const n = 2**z;
      const lonT = x/n*360 - 180 + 180/n;
      const latRad = Math.atan(Math.sinh(Math.PI*(1 - 2*(y+0.5)/n)));
      const latT = latRad*180/Math.PI;
      const d = haversine(lat, lng, latT, lonT);
      if(d <= radius_m) tiles.push({z,x,y});
    }
  }
  return tiles;
}
function haversine(lat1, lon1, lat2, lon2){
  const R=6371000, toRad = d=>d*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

const AVG_TILE_BYTES_DEFAULT = 120_000; // tweak per provider
async function buildTileList(center, radius_m, zMin, zMax, urlTemplate){
  const urls = [];
  for(let z=zMin; z<=zMax; z++){
    for(const {x,y} of tilesInCircle(center, radius_m, z)){
      const url = urlTemplate
        .replace('{z}', z)
        .replace('{x}', x)
        .replace('{y}', y);
      urls.push({z,x,y,url});
    }
  }
  return urls;
}
function estimateBytes(tileCount, avg=AVG_TILE_BYTES_DEFAULT){
  return tileCount * avg;
}
export async function predownloadArea(opts){
  const {center, radius_m, zMin, zMax, urlTemplate, areaId} = opts;
  const tiles = await buildTileList(center, radius_m, zMin, zMax, urlTemplate);
  const est = estimateBytes(tiles.length);
  // persist manifest stub
  await db.put('OfflineAreas', { id: areaId, ...opts, tileCount: tiles.length, estBytes: est, status:'pending', createdAt: Date.now() });
  // send to SW
  navigator.serviceWorker.controller.postMessage({ type:'CACHE_TILES', areaId, tiles });
}

const CACHE_NAME = 'satellite-tiles-v1';
self.addEventListener('message', async (evt)=>{
  const msg = evt.data;
  if(msg?.type === 'CACHE_TILES'){
    const {tiles, areaId} = msg;
    const clientsArr = await self.clients.matchAll({type:'window'});
    const client = clientsArr[0];
    const controller = new AbortController();
    let done=0, observedBytes=0, sample=0;
    const cache = await caches.open(CACHE_NAME);
    for(const t of tiles){
      try{
        const res = await fetch(t.url, {signal: controller.signal});
        if(res.ok){
          await cache.put(t.url, res.clone());
          // update avg size from first 20 tiles
          if(sample<20){ observedBytes += Number(res.headers.get('content-length'))||0; sample++; }
        }
      }catch(_){}
      done++;
      client?.postMessage({type:'CACHE_PROGRESS', areaId, done, total: tiles.length,
        avgBytes: sample? Math.round(observedBytes/sample) : null});
    }
    client?.postMessage({type:'CACHE_DONE', areaId});
  }
});
self.addEventListener('fetch', (evt)=>{
  const url = new URL(evt.request.url);
  // satellite tile domains → try cache first
  if(url.pathname.match(/\/tiles\/satellite\/.*\.(jpg|png|webp)$/)){
    evt.respondWith((async()=>{
      const cache = await caches.open('satellite-tiles-v1');
      const hit = await cache.match(evt.request);
      if(hit) return hit;
      try{
        const res = await fetch(evt.request);
        if(res.ok) cache.put(evt.request, res.clone());
        return res;
      }catch(_){
        return caches.match('/offline-tile.png'); // tiny fallback
      }
    })());
  }
});

let currentAreaId = crypto.randomUUID();
function onStartDownload(){
  const center = map.getCenter(); // {lng, lat}
  const radius_m = Number(radiusInput.value) * 1000; // km → m
  const zMin = Number(zMinInput.value), zMax = Number(zMaxInput.value);
  predownloadArea({
    areaId: currentAreaId,
    center: {lng:center.lng, lat:center.lat},
    radius_m, zMin, zMax,
    urlTemplate: SAT_URL_TEMPLATE // e.g., 'https://tiles.yourcdn/sat/{z}/{x}/{y}.webp'
  });
  showProgress(0);
}
navigator.serviceWorker.addEventListener('message', (evt)=>{
  const {type, areaId, done, total, avgBytes} = evt.data || {};
  if(areaId !== currentAreaId) return;
  if(type==='CACHE_PROGRESS'){
    if(avgBytes) updateEstimate(avgBytes*total);
    updateProgress((done/total)*100);
  }
  if(type==='CACHE_DONE'){ markAreaReady(areaId); }
});

