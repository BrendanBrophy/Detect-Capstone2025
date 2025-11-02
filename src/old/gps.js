let isTracking = false;

function logData(lat, lng, heading, time) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${new Date(time).toLocaleTimeString()}</td>
    <td>${lat.toFixed(6)}</td>
    <td>${lng.toFixed(6)}</td>
    <td>${heading}</td>
    <td>--</td>
    <td>--</td>
  `;
  document.getElementById("logBody").appendChild(row);
}

document.getElementById("startTracking").addEventListener("click", () => {
  isTracking = true;
  document.getElementById("stopTracking").disabled = false;

  if (!window.updateGPS) {
    // Fallback for browser
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const time = Date.now();
        document.getElementById("lat").textContent = lat.toFixed(6);
        document.getElementById("lng").textContent = lng.toFixed(6);
        document.getElementById("timestamp").textContent = new Date(time).toLocaleTimeString();
        if (isTracking) logData(lat, lng, "--", time);
      });
    }
  }
});

document.getElementById("stopTracking").addEventListener("click", () => {
  isTracking = false;
  document.getElementById("stopTracking").disabled = true;
});

// Hook for native Kotlin injection
window.updateGPS = function (lat, lng, timestamp) {
  document.getElementById("lat").textContent = lat.toFixed(6);
  document.getElementById("lng").textContent = lng.toFixed(6);
  document.getElementById("timestamp").textContent = new Date(parseInt(timestamp)).toLocaleTimeString();

  if (isTracking) {
    const heading = document.getElementById("heading").textContent || "--";
    logData(lat, lng, heading, parseInt(timestamp));
  }
};
