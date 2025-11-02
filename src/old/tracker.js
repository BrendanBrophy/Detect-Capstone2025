console.log("tracker.js loaded — real GPS mode");

let trackingLog = [];
const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const headingEl = document.getElementById("heading");
const timeEl = document.getElementById("timestamp");

let currentHeading = "--";

const compassBtn = document.getElementById("enableCompass");

document.addEventListener("DOMContentLoaded", () => {
  const compassBtn = document.getElementById("enableCompass");

  if (compassBtn) {
    compassBtn.addEventListener("click", async () => {
      // Try to request permission
      if (typeof DeviceOrientationEvent?.requestPermission === "function") {
        try {
          const state = await DeviceOrientationEvent.requestPermission();
          if (state === "granted") {
            window.addEventListener("deviceorientation", handleOrientation);
            compassBtn.textContent = "Compass Enabled";
            compassBtn.disabled = true;
            setTimeout(() => compassBtn.style.display = "none", 1000); // hide after 1 sec
          } else {
            alert("Permission denied for heading.");
          }
        } catch (err) {
          console.error("Compass permission error:", err);
          alert("Compass error: " + err.message);
        }
      } else {
        // Fallback for non-iOS devices
        window.addEventListener("deviceorientation", handleOrientation);
        compassBtn.textContent = "Compass Enabled";
        compassBtn.disabled = true;
        setTimeout(() => compassBtn.style.display = "none", 1000);
      }
    });
  } else {
    console.warn("Enable Compass button not found.");
  }
});


// Handle compass heading
function handleOrientation(e) {
  console.log("Heading event:", e.alpha); // Debug log

  if (e.alpha !== null) {
    currentHeading = Math.round(e.alpha);
    headingEl.textContent = currentHeading + "°";

    const headingImg = document.querySelector(".heading-img");
    if (headingImg) {
      headingImg.style.transform = `rotate(${currentHeading}deg)`;
    }
  }
}

// Update GPS data
function updatePosition(pos) {
  if (!isTracking) return;

  const lat = pos.coords.latitude.toFixed(6);
  const lng = pos.coords.longitude.toFixed(6);
  const timestamp = new Date(pos.timestamp).toISOString();

  latEl.textContent = lat;
  lngEl.textContent = lng;
  timeEl.textContent = timestamp;

  trackingLog.push({
    timestamp,
    lat,
    lng,
    heading: currentHeading,
    note: "",
    takeOff: false
  });

  const newRow = document.createElement("tr");
  newRow.innerHTML = `
    <td>${timestamp}</td>
    <td>${lat}</td>
    <td>${lng}</td>
    <td>${currentHeading}</td>
    <td></td>
    <td></td>
  `;
  logBody.appendChild(newRow);

  liveMarker.setLatLng([lat, lng]);
  map.setView([lat, lng]);

  pathCoordinates.push([lat, lng]);
  pathLine.setLatLngs(pathCoordinates);

  L.circleMarker([lat, lng], {
    radius: 2,
    color: "#007aff",
    fillColor: "#007aff",
    fillOpacity: 0.9,
    weight: 2
  }).addTo(map);
}

// Leaflet map setup
const map = L.map('map').setView([0, 0], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const liveMarker = L.marker([0, 0]).addTo(map);

function showError(err) {
  console.warn("Geolocation error:", err.message);
  alert("GPS error: " + err.message);
}

const pathCoordinates = [];
const pathLine = L.polyline([], {
  color: "#08a18b",
  weight: 4,
  opacity: 0.8
}).addTo(map);

const headingIcon = L.divIcon({
  className: "heading-icon",
  html: `<img src="assets/arrow.png" class="heading-img">`,
  iconSize: [40, 40],
  iconAnchor: [20, 20]
});

const headingMarker = L.marker([0, 0], {
  icon: headingIcon,
  rotationAngle: 0
}).addTo(map);

// Tracking logic
let isTracking = false;
let watchId = null;

const startBtn = document.getElementById("startTracking");
const stopBtn = document.getElementById("stopTracking");

startBtn.addEventListener("click", async () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported.");
    return;
  }

  // Request permission for heading (iOS)
  if (typeof DeviceOrientationEvent?.requestPermission === "function") {
    try {
      const state = await DeviceOrientationEvent.requestPermission();
      if (state === "granted") {
        window.addEventListener("deviceorientation", handleOrientation);
      } else {
        alert("Permission for heading denied.");
      }
    } catch (err) {
      console.error("Heading permission error:", err);
    }
  } else {
    window.addEventListener("deviceorientation", handleOrientation);
  }

  isTracking = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;

  watchId = navigator.geolocation.watchPosition(updatePosition, showError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  });
});

stopBtn.addEventListener("click", () => {
  isTracking = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
});

// Take-off marker
const takeOffBtn = document.getElementById("markTakeOff");
let hasMarkedTakeOff = false;
let takeOffMarker = null;

takeOffBtn.addEventListener("click", () => {
  if (!isTracking) {
    alert("You must start tracking first.");
    return;
  }

  if (hasMarkedTakeOff) {
    alert("Take-off location already marked.");
    return;
  }

  const lastEntry = trackingLog[trackingLog.length - 1];
  if (!lastEntry) {
    alert("No tracking data yet.");
    return;
  }

  lastEntry.takeOff = true;
  hasMarkedTakeOff = true;

  takeOffMarker = L.marker([lastEntry.lat, lastEntry.lng], {
    title: "Take-Off Location",
    icon: L.icon({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-red.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [0, -35]
    })
  }).addTo(map).bindPopup("Take-Off Location").openPopup();

  const lastRow = logBody.lastChild;
  if (lastRow) {
    lastRow.children[5].textContent = "✔";
  }
});

// Notes
const noteInput = document.getElementById("noteInput");
const dropNoteBtn = document.getElementById("dropNote");

dropNoteBtn.addEventListener("click", () => {
  const noteText = noteInput.value.trim();
  if (!isTracking) {
    alert("You must start tracking first.");
    return;
  }
  if (!noteText) {
    alert("Note is empty.");
    return;
  }

  const lastEntry = trackingLog[trackingLog.length - 1];
  if (!lastEntry) {
    alert("No tracking data available.");
    return;
  }

  lastEntry.note = noteText;

  L.marker([lastEntry.lat, lastEntry.lng])
    .addTo(map)
    .bindPopup(`Note: ${noteText}`)
    .openPopup();

  const lastRow = logBody.lastChild;
  if (lastRow) {
    lastRow.children[4].textContent = noteText;
  }

  noteInput.value = "";
});
