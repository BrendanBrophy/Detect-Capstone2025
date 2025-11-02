let isTracking = false;
let trackingLog = [];
let pathCoordinates = [];
let map, liveMarker, pathLine, takeOffMarker, headingLine;
let currentHeading = "--";
let hasMarkedTakeOff = false;
let autoFollow = true;
let latestLat = 0;
let latestLng = 0;

const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const headingEl = document.getElementById("heading");
const timeEl = document.getElementById("timestamp");
const logBody = document.getElementById("logBody");

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
    last.takeOff = true;
    hasMarkedTakeOff = true;
    const lastRow = logBody.lastChild;
    if (lastRow) lastRow.children[5].textContent = "✔";
  });

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

  document.getElementById("followMap").addEventListener("change", e => {
    autoFollow = e.target.checked;
  });

  document.getElementById("recenterMap").addEventListener("click", () => {
    if (latestLat !== 0 && latestLng !== 0) {
      map.setView([latestLat, latestLng]);
    } else {
      alert("No GPS fix yet.");
    }
  });

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
  });
});

window.updateHeading = function (degrees) {
  currentHeading = degrees;
  if (headingEl) headingEl.textContent = degrees + "°";

  const compassLabel = document.getElementById("compassLabel");
  if (compassLabel) compassLabel.textContent = getCompassDirection(degrees);

  if (latestLat && latestLng && headingLine) {
    const distance = 0.0003; // roughly ~30 meters
    const headingRad = degrees * Math.PI / 180;
    const destLat = latestLat + distance * Math.cos(headingRad);
    const destLng = latestLng + distance * Math.sin(headingRad);
    headingLine.setLatLngs([[latestLat, latestLng], [destLat, destLng]]);
  }
};

window.updateGPS = function (lat, lng, timestamp) {
  const timeStr = new Date(parseInt(timestamp)).toLocaleTimeString();
  if (latEl) latEl.textContent = lat.toFixed(6);
  if (lngEl) lngEl.textContent = lng.toFixed(6);
  if (timeEl) timeEl.textContent = timeStr;

  if (!isTracking) return;

  latestLat = lat;
  latestLng = lng;

  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${timeStr}</td>
    <td>${lat.toFixed(6)}</td>
    <td>${lng.toFixed(6)}</td>
    <td>${currentHeading}</td>
    <td>--</td>
    <td>--</td>
  `;
  logBody.appendChild(row);

  trackingLog.push({
    timestamp: timeStr,
    lat: lat,
    lng: lng,
    heading: currentHeading,
    note: "",
    takeOff: false
  });

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

function getCompassDirection(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}
