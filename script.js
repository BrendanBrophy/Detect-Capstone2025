// Ensure location history is initialized from localStorage
let locationHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];
let compassActive = false;

/**
 * Logs the user's location, updates the UI, and stores data in localStorage.
 * @param {float} lat - The latitude of the user.
 * @param {float} lon - The longitude of the user.
 * @param {float} heading - The heading direction of the user.
 */
function logLocation(lat, lon, heading) {
    let timestamp = new Date().toLocaleTimeString();
    let headingText = heading !== null ? heading.toFixed(2) + "°" : "N/A";
    let locationEntry = `${timestamp} - Latitude: ${lat}, Longitude: ${lon}, Heading: ${headingText}`;

    let storedHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];
    storedHistory.push(locationEntry);
    localStorage.setItem("locationHistory", JSON.stringify(storedHistory));

    let logDiv = document.getElementById("locationLog");
    if (logDiv) {
        logDiv.innerHTML += `<p>${locationEntry}</p>`;
    }

    console.log("Updated locationHistory:", JSON.parse(localStorage.getItem("locationHistory")));
}

// Make sure logLocation is available globally
window.logLocation = logLocation;

window.onload = function () {
    let logDiv = document.getElementById("locationLog");

    // Retrieve stored history and display it (only for reference)
    let storedHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];
    if (storedHistory.length > 0 && logDiv) {
        storedHistory.forEach(entry => {
            logDiv.innerHTML += `<p>${entry}</p>`;
        });
    }
};

/**
 * Request permission for motion access on iOS
 */
function requestPermission() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    DeviceOrientationEvent.requestPermission()
                        .then(permissionState => {
                            if (permissionState === 'granted') {
                                startCompass();
                                alert("Compass enabled! Move your phone to test.");
                            } else {
                                alert("Permission denied for orientation.");
                            }
                        })
                        .catch(error => console.error("Orientation permission error:", error));
                } else {
                    alert("Permission denied for motion.");
                }
            })
            .catch(error => console.error("Motion permission error:", error));
    } else {
        // If not an iPhone, start compass directly
        startCompass();
    }
}


/**
 * Start listening for device orientation changes (heading)
 */
let previousHeading = null;

function startCompass() {
    if (!compassActive) {
        window.addEventListener("deviceorientationabsolute", event => {
            if (event.alpha !== null) {
                userHeading = event.alpha;

                let arrow = document.querySelector('.custom-user-icon .arrow');
                if (arrow) {
                    arrow.style.transform = `rotate(${userHeading}deg)`;
                }
            }
        });
        compassActive = true;
    }
}




/**
 * Downloads the logged location history as a .txt file.
 */
function downloadHistory() {
    let storedHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];

    if (storedHistory.length === 0) {
        alert("No location history to download.");
        return;
    }

    let historyText = storedHistory.join("\n");

    let blob = new Blob([historyText], { type: "text/plain" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "location_history.txt";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
