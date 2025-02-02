// Ensure location history is initialized from localStorage
let locationHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];

/**
 * Logs the user's location, updates the UI, and stores data in localStorage.
 * @param {float} lat - The latitude of the user.
 * @param {float} lon - The longitude of the user.
 */
function logLocation(lat, lon) {
    let timestamp = new Date().toLocaleTimeString();
    let locationEntry = `${timestamp} - Latitude: ${lat}, Longitude: ${lon}`;

    // Retrieve the existing history from localStorage or create an empty array
    let storedHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];

    // Add the new entry
    storedHistory.push(locationEntry);

    // Save the updated history back to localStorage
    localStorage.setItem("locationHistory", JSON.stringify(storedHistory));

    // Update the log display on the webpage
    let logDiv = document.getElementById("locationLog");
    if (logDiv) {
        logDiv.innerHTML += `<p>${locationEntry}</p>`;
    }

    // Debugging: Confirm it is being saved
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
 * Downloads the logged location history as a .txt file.
 */
function downloadHistory() {
    // Reload history from localStorage to ensure it includes recent updates
    locationHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];

    // Check if there is any location data to download
    if (locationHistory.length === 0) {
        alert("No location history to download.");
        return;
    }

    // Convert the location history array into a text string
    let historyText = locationHistory.join("\n");

    // Create a downloadable text file
    let blob = new Blob([historyText], { type: "text/plain" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "location_history.txt";

    // Append the link to the document, trigger a click, and remove it
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
