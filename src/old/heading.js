// Handles heading updates from Kotlin
window.updateHeading = function (degrees) {
  const h = document.getElementById("heading");
  if (h) h.textContent = degrees + "°";
};
