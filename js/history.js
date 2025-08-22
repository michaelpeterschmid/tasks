
// Render completed tasks saved by addTask.js (localStorage key: 'completedTasks')
(() => {
  const list = document.getElementById("doneList");
  const load = () => {
    try { return JSON.parse(localStorage.getItem("completedTasks") || "[]"); }
    catch { return []; }
  };
  const escapeHtml = (str="") => String(str).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));

  const parseAnyDate = (s) => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
      const [d, m, y] = s.split(".").map(Number);
      return new Date(y, m - 1, d);
    }
    const dt = new Date(s);
    return isNaN(dt) ? null : dt;
  };
  const formatDDMMYYYY = (s) => {
    const dt = parseAnyDate(s);
    if (!dt) return "—";
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  };
  const msToHMS = (ms = 0) => {
    ms = Math.max(0, Math.floor(ms));
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const card = (t) => `
    <div class="grid_card">
      <h3 class="center">${escapeHtml(t.title)}</h3>
      <p>Creation date: ${escapeHtml(formatDDMMYYYY(t.creationDate || ""))}</p>
      <p>Completed: ${t.doneDate ? new Date(t.doneDate).toLocaleString("de-DE") : "—"}</p>
      <p>Time spent: ${msToHMS(t.timeSpentMs || 0)}</p>
      <details>
        <summary><a>Notes</a></summary>
        <p>${escapeHtml(t.notes || "")}</p>
      </details>
    </div>
  `;

  const render = () => {
    const tasks = load();
    list.innerHTML = tasks.length ? tasks.map(card).join("") : "<p>No completed tasks yet.</p>";
  };

  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("storage", (e) => {
    if (e.key === "completedTasks") render();
  });
})();
