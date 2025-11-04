document.getElementById("exportData").addEventListener("click", () => {
  const logBody = document.getElementById("logBody");

  // Collect all rows into structured array
  const logEntries = Array.from(logBody.children).map(row => {
    const cells = Array.from(row.children).map(cell => cell.textContent);
    return {
      time: cells[0],
      lat: parseFloat(cells[1]),
      lng: parseFloat(cells[2]),
      heading: cells[3],
      note: cells[4],
      takeOff: cells[5],
      transport: cells[6],
      inferredTransport: cells[7]
    };
  });

  // Compute distances per transport type in meters
  const transportDistances = {}; // { Walking: m, Driving: m, ... }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    // Round coordinates to 5 decimal places (~1m precision)
    lat1 = parseFloat(lat1.toFixed(5));
    lon1 = parseFloat(lon1.toFixed(5));
    lat2 = parseFloat(lat2.toFixed(5));
    lon2 = parseFloat(lon2.toFixed(5));

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  for (let i = 1; i < logEntries.length; i++) {
    const prev = logEntries[i - 1];
    const curr = logEntries[i];
    const distance = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    if (!transportDistances[curr.transport]) transportDistances[curr.transport] = 0;
    transportDistances[curr.transport] += distance;
  }

  // Build summary string in meters
  const summaryStr = "Summary: " + Object.entries(transportDistances)
    .map(([mode, m]) => `${mode} ${Math.round(m)}m`)
    .join(", ");

  // Build CSV rows
  const rows = [[summaryStr]]; // first row is summary
  rows.push(["Time", "Lat", "Lng", "Heading", "Note", "Take-Off", "Transportation", "Inferred Transportation"]);

  for (const entry of logEntries) {
    rows.push([
      entry.time,
      entry.lat.toFixed(5),
      entry.lng.toFixed(5),
      entry.heading,
      entry.note,
      entry.takeOff === "✔" ? "X" : entry.takeOff, // Force X for Take-Off
      entry.transport,
      entry.inferredTransport
    ]);
  }

  // Convert rows to CSV string
  const csvContent = rows.map(r => r.join(",")).join("\n");

  // Format filename
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const filename = `PointTrack_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.csv`;

  // Trigger download as UTF-8 CSV
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
