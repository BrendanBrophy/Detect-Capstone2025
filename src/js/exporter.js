document.getElementById("exportData").addEventListener("click", () => {
  const rows = [["Time", "Lat", "Lng", "Heading", "Note", "Take-Off"]];
  const logBody = document.getElementById("logBody");

  for (const row of logBody.children) {
    const cells = Array.from(row.children).map(cell => cell.textContent);
    rows.push(cells);
  }

  const csvContent = rows.map(r => r.join(",")).join("\n");

  // Format filename
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const filename = `PointTrack_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.csv`;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
