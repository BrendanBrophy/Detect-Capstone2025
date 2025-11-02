let notes = JSON.parse(localStorage.getItem("geoNotes")) || [];
let currentCoords = null;
let watchId = null;
let loggingInterval = null;
let userHeading = 0; // Default heading
let marker = null; // Global marker variable
let map = null; // Global map variable

function startCompass() {
    if (typeof compassActive === 'undefined') {
        window.compassActive = false; // Ensure it's only defined once
    }

    if (!compassActive) {
        console.log("Starting compass tracking...");
        
        window.addEventListener("deviceorientationabsolute", event => {
            if (event.alpha !== null) {
                userHeading = event.alpha; // Update global userHeading
                
                // Rotate the arrow based on heading
                let arrow = document.querySelector('.custom-user-icon .arrow');
                if (arrow) {
                    arrow.style.transform = `rotate(${userHeading}deg)`;
                }

                console.log("Updated Heading:", userHeading);
            }
        });

        compassActive = true;
    }
}

// Start tracking the user's location
function startTracking() {
    if (navigator.geolocation) {
        localStorage.setItem("locationHistory", JSON.stringify([]));

        document.getElementById('startTrackingBtn').style.display = 'none';
        document.getElementById('stopTrackingBtn').style.display = 'inline-block';

        watchId = navigator.geolocation.watchPosition(updateLocation, handleError, {
            enableHighAccuracy: true,
            maximumAge: 0
        });

        if (loggingInterval === null) {
            loggingInterval = setInterval(() => {
                if (currentCoords) {
                    logTrackingData(currentCoords.latitude, currentCoords.longitude, userHeading);
                }
            }, 2000);
        }
    } else {
        document.getElementById('status').innerText = "Geolocation is not supported by this browser.";
    }
}

function initializeMap(lat, lng) {
    if (!map) {
        map = L.map('map').setView([lat, lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
    }

    // Ensure marker is created
    if (!marker) {
        console.log("Creating marker at:", lat, lng);
        marker = L.marker([lat, lng]).addTo(map);
    }
}

// Update location and save to history
function updateLocation(position) {
    const { latitude, longitude } = position.coords;
    currentCoords = { latitude, longitude, heading: userHeading };

    console.log("Updating location to:", latitude, longitude, "Heading:", userHeading);

    document.getElementById('status').innerText = 
        `Latitude: ${latitude}, Longitude: ${longitude}, Heading: ${userHeading.toFixed(2)}°`;

    if (!map) {
        console.log("Initializing map...");
        initializeMap(latitude, longitude);
    }

    if (!marker) {
        console.log("Creating marker...");
        marker = L.marker([latitude, longitude]).addTo(map);
    } else {
        console.log("Updating marker position...");
        marker.setLatLng([latitude, longitude]);
    }

    map.setView([latitude, longitude], 16);
}



// Log tracking data (Lat, Lng, Heading)
function logTrackingData(lat, lng, heading) {
    let timestamp = new Date().toLocaleTimeString();
    let history = JSON.parse(localStorage.getItem("locationHistory")) || [];
    history.push(`${timestamp} - Lat: ${lat}, Lng: ${lng}, Heading: ${heading.toFixed(2)}°`);
    localStorage.setItem("locationHistory", JSON.stringify(history));
}

// Show note form
function showNoteForm() {
    document.getElementById("noteForm").style.display = "block";
}

// Close note form
function closeNoteForm() {
    document.getElementById("noteForm").style.display = "none";
    document.getElementById("noteText").value = "";
}

// Save a geotagged note
function saveNote() {
    let noteText = document.getElementById("noteText").value.trim();
    if (noteText === "" || !currentCoords) {
        alert("Enter a note and ensure tracking is active.");
        return;
    }

    let note = { lat: currentCoords.latitude, lng: currentCoords.longitude, text: noteText };
    notes.push(note);
    localStorage.setItem("geoNotes", JSON.stringify(notes));

    addNoteMarker(note);
    logNoteToTracking(note);
    closeNoteForm();
}

// Append note to tracking log
function logNoteToTracking(note) {
    let timestamp = new Date().toLocaleTimeString();
    let history = JSON.parse(localStorage.getItem("locationHistory")) || [];
    history.push(`${timestamp} - Note: ${note.text} (Lat: ${note.lat}, Lng: ${note.lng})`);
    localStorage.setItem("locationHistory", JSON.stringify(history));
}

// Load tracking history
function loadHistory() {
    let history = JSON.parse(localStorage.getItem("locationHistory")) || [];
    let historyDiv = document.getElementById("trackingHistory");
    historyDiv.innerHTML = history.map(entry => `<p>${entry}</p>`).join('');
}

// Stop tracking
function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        document.getElementById('status').innerText = "Tracking stopped.";
        document.getElementById('stopTrackingBtn').style.display = 'none';
        document.getElementById('startTrackingBtn').style.display = 'inline-block';

        if (loggingInterval !== null) {
            clearInterval(loggingInterval);
            loggingInterval = null;
        }
    }
}

// Handle geolocation errors
function handleError(error) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            document.getElementById('status').innerText = "User denied the request for Geolocation.";
            break;
        case error.POSITION_UNAVAILABLE:
            document.getElementById('status').innerText = "Location information is unavailable.";
            break;
        case error.TIMEOUT:
            document.getElementById('status').innerText = "The request to get user location timed out.";
            break;
        case error.UNKNOWN_ERROR:
            document.getElementById('status').innerText = "An unknown error occurred.";
            break;
    }
}

