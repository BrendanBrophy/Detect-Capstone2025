let trackingLog = [];
let gpsWatchId = null;
let currentHeading = "--";
let magneticDeclination = 0;

window.onload = function () {
  const headingEl = document.getElementById("heading");
  const compassBtn = document.getElementById("enableCompass");
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");
  const timeEl = document.getElementById("timestamp");
  const logBody = document.getElementById("logBody");
  const startBtn = document.getElementById("startTracking");
  const stopBtn = document.getElementById("stopTracking");

  // Get declination once on load
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const date = new Date();

    const result = geomagnetism.model().point([lat, lng], date);
    magneticDeclination = result.decl;
  });

  compassBtn.onclick = function () {
    startHeading((magneticHeading) => {
      const trueHeading = (magneticHeading + magneticDeclination + 360) % 360;
      currentHeading = Math.round(trueHeading);
      headingEl.textContent = `${currentHeading}°`;

      const arrow = document.querySelector(".heading-img");
      if (arrow) {
        arrow.style.transform = `rotate(${currentHeading}deg)`;
      }
    });

    compassBtn.disabled = true;
    compassBtn.textContent = "Compass Enabled";
    setTimeout(() => compassBtn.style.display = "none", 1000);
  };

  startBtn.onclick = function () {
    startBtn.disabled = true;
    stopBtn.disabled = false;

    gpsWatchId = startGPS(({ lat, lng, timestamp }) => {
      latEl.textContent = lat;
      lngEl.textContent = lng;
      timeEl.textContent = timestamp;

      trackingLog.push({ timestamp, lat, lng, heading: currentHeading });

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${timestamp}</td>
        <td>${lat}</td>
        <td>${lng}</td>
        <td>${currentHeading}</td>
        <td></td>
        <td></td>
      `;
      logBody.appendChild(row);
    });
  };

  stopBtn.onclick = function () {
    stopBtn.disabled = true;
    startBtn.disabled = false;
    stopGPS(gpsWatchId);
  };
};
