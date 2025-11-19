// exporter.js
// Handles exporting the log table as CSV and KML

document.getElementById("exportData").addEventListener("click", () => {
  const logBody = document.getElementById("logBody");
  if (!logBody) {
    console.error("logBody element not found");
    return;
  }

  // ----------------------------------------------------
  // COLLECT LOG ENTRIES FROM TABLE
  // ----------------------------------------------------
  const logEntries = Array.from(logBody.children).map(row => {
    const cells = Array.from(row.children).map(cell => cell.textContent);
    const noteText = cells[4] || "";

    const isInferredTakeoff =
      noteText.toLowerCase().startsWith("inferred takeoff");

    return {
      time: cells[0],
      lat: parseFloat(cells[1]),
      lng: parseFloat(cells[2]),
      heading: cells[3],
      note: noteText,
      takeOff: cells[5],
      transport: cells[6],
      inferredTransport: cells[7],
      isInferredTakeoff
    };
  }).filter(e => !Number.isNaN(e.lat) && !Number.isNaN(e.lng));

  if (logEntries.length === 0) {
    alert("No log data to export.");
    return;
  }

  // Common filename base
  const now = new Date();
  const pad = n => n.toString().padStart(2, "0");
  const filenameBase =
    `PointTrack_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}`;

  // ====================================================
  // CSV EXPORT
  // ====================================================
  const csvRows = [];

  // Header / metadata
  csvRows.push(["Detect GPS Export"]);
  csvRows.push([`Generated: ${now.toLocaleString()}`]);
  csvRows.push([`Total Points: ${logEntries.length}`]);

  // Simple summary by mode (points count)
  const modeCounts = {};
  logEntries.forEach(e => {
    const mode = e.transport || "Unknown";
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
  });
  csvRows.push([]);
  csvRows.push(["Summary by Mode (points)"]);
  Object.entries(modeCounts).forEach(([mode, count]) => {
    csvRows.push([mode, count]);
  });

  // Blank line then raw data header
  csvRows.push([]);
  csvRows.push([
    "Time",
    "Lat",
    "Lng",
    "Heading",
    "Note",
    "Take-Off",
    "Transportation",
    "Inferred Transportation"
  ]);

  logEntries.forEach(e => {
    csvRows.push([
      e.time,
      e.lat.toFixed(5),
      e.lng.toFixed(5),
      e.heading,
      e.note,
      e.takeOff === "✔" ? "X" : e.takeOff,
      e.transport,
      e.inferredTransport
    ]);
  });

  const csvContent = csvRows.map(r => r.join(",")).join("\n");

  const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const csvLink = document.createElement("a");
  csvLink.href = URL.createObjectURL(csvBlob);
  csvLink.setAttribute("download", `${filenameBase}.csv`);
  document.body.appendChild(csvLink);
  csvLink.click();
  document.body.removeChild(csvLink);

  // ====================================================
  // KML EXPORT
  // ====================================================

  // ---------- Point Placemarks (pins) ----------
  const regularPlacemarks = [];
  const inferredPlacemarks = []; // these will be appended last so they render on top

  logEntries.forEach(e => {
    const mode = (e.transport || "").toLowerCase();
    const isTakeoff = e.takeOff === "✔";

    let styleId;
    if (e.isInferredTakeoff) {
      styleId = "inferredTakeoffStyle";       // big white pin
    } else if (isTakeoff) {
      styleId = "takeoffStyle";               // big blue helicopter
    } else if (mode === "walking") {
      styleId = "walkingStyle";               // small yellow pin
    } else if (mode === "helicopter") {
      styleId = "heliTransportStyle";         // small green pin
    } else {
      styleId = "drivingStyle";               // small blue pin
    }

    const placemark = `
    <Placemark>
      <name>${e.time}</name>
      <styleUrl>#${styleId}</styleUrl>
      <description><![CDATA[
        Time: ${e.time}<br/>
        Heading: ${e.heading}<br/>
        Note: ${e.note}<br/>
        Take-Off: ${e.takeOff}<br/>
        Transport: ${e.transport}<br/>
        Inferred Transport: ${e.inferredTransport}
      ]]></description>
      <Point>
        <coordinates>${e.lng.toFixed(5)},${e.lat.toFixed(5)},0</coordinates>
      </Point>
    </Placemark>`;

    if (e.isInferredTakeoff) {
      inferredPlacemarks.push(placemark);
    } else {
      regularPlacemarks.push(placemark);
    }
  });

  const placemarksXml =
    regularPlacemarks.join("\n") + "\n" + inferredPlacemarks.join("\n");

  // ---------- LineString segments, colored by transport ----------
  let transportSegments = "";

  for (let i = 1; i < logEntries.length; i++) {
    const prev = logEntries[i - 1];
    const curr = logEntries[i];

    const mode = (curr.transport || "").toLowerCase();
    let styleId;
    if (mode === "walking") {
      styleId = "walkingLine";
    } else if (mode === "helicopter") {
      styleId = "heliLine";
    } else {
      styleId = "drivingLine"; // default for truck/other
    }

    transportSegments += `
    <Placemark>
      <styleUrl>#${styleId}</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${prev.lng.toFixed(5)},${prev.lat.toFixed(5)},0
          ${curr.lng.toFixed(5)},${curr.lat.toFixed(5)},0
        </coordinates>
      </LineString>
    </Placemark>`;
  }

  // ---------- Full KML document ----------
  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${filenameBase}</name>

    <!-- PIN STYLES -->
    <!-- Real Takeoff: big blue helicopter -->
    <Style id="takeoffStyle">
      <IconStyle>
        <scale>1.3</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/heliport.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- Inferred Takeoff: BIG white pin, drawn last -->
    <Style id="inferredTakeoffStyle">
      <IconStyle>
        <scale>1.5</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- Walking: small yellow pin -->
    <Style id="walkingStyle">
      <IconStyle>
        <scale>0.9</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- Driving/Other: small blue pin -->
    <Style id="drivingStyle">
      <IconStyle>
        <scale>0.9</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- Helicopter transport: small green pin -->
    <Style id="heliTransportStyle">
      <IconStyle>
        <scale>0.9</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/grn-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- LINE STYLES -->
    <!-- Walking path: yellow -->
    <Style id="walkingLine">
      <LineStyle>
        <color>ff00ffff</color> <!-- yellow -->
        <width>4</width>
      </LineStyle>
    </Style>

    <!-- Driving/Other path: blue -->
    <Style id="drivingLine">
      <LineStyle>
        <color>ffff0000</color> <!-- blue -->
        <width>4</width>
      </LineStyle>
    </Style>

    <!-- Helicopter transport path: green -->
    <Style id="heliLine">
      <LineStyle>
        <color>ff00ff00</color> <!-- green -->
        <width>4</width>
      </LineStyle>
    </Style>

    <!-- Segmented path colored by transport -->
    ${transportSegments}

    <!-- Point markers (regular first, inferred last so they sit on top) -->
    ${placemarksXml}

  </Document>
</kml>`;

  const kmlBlob = new Blob([kmlContent], {
    type: "application/vnd.google-earth.kml+xml"
  });
  const kmlLink = document.createElement("a");
  kmlLink.href = URL.createObjectURL(kmlBlob);
  kmlLink.setAttribute("download", `${filenameBase}.kml`);
  document.body.appendChild(kmlLink);
  kmlLink.click();
  document.body.removeChild(kmlLink);
});
