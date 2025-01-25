// Function to get the user's location
function getLocation() {
    // Check if the browser supports geolocation
    if (navigator.geolocation) {
        // Request the user's location and handle the response or errors
        navigator.geolocation.getCurrentPosition(showPosition, showError);
    } else {
        // Inform the user if their browser does not support geolocation
        document.getElementById('output').innerText = "Geolocation is not supported by this browser.";
    }
}

// Function to display the user's position
function showPosition(position) {
    // Extract latitude and longitude from the position object
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    // Display the coordinates in the HTML element with ID 'output'
    document.getElementById('output').innerText = `Latitude: ${latitude}, Longitude: ${longitude}`;
}

// Function to handle geolocation errors
function showError(error) {
    // Determine the type of error and display an appropriate message
    switch (error.code) {
        case error.PERMISSION_DENIED:
            // User denied the request for geolocation
            document.getElementById('output').innerText = "User denied the request for Geolocation.";
            break;
        case error.POSITION_UNAVAILABLE:
            // Location information is unavailable
            document.getElementById('output').innerText = "Location information is unavailable.";
            break;
        case error.TIMEOUT:
            // The request to get the user's location timed out
            document.getElementById('output').innerText = "The request to get user location timed out.";
            break;
        case error.UNKNOWN_ERROR:
            // An unknown error occurred
            document.getElementById('output').innerText = "An unknown error occurred.";
            break;
    }
}



