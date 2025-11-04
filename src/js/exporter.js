document.getElementById("exportData").addEventListener("click", () => {
  // Add the "Mode" column to the headers
  const rows = [["Time", "Lat", "Lng", "Heading", "Note", "Take-Off", "Transportation"]];
  const logBody = document.getElementById("logBody");

  // Collect each table row's cells (includes the new Mode column)
  for (const row of logBody.children) {
    const cells = Array.from(row.children).map(cell => cell.textContent);
    rows.push(cells);
  }

  // Convert to CSV text
  const csvContent = rows.map(r => r.join(",")).join("\n");

  // Format filename
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const filename = `PointTrack_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.csv`;

  // Trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
