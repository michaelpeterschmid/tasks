
// Minimal, drop-in enhancements for tasks: delete, edit, mark as done (persisted via localStorage)
// Ensures dates display as dd.mm.yyyy, adds sorting (creation, deadline, important), and per-task timers.

(() => {
  const form = document.getElementById("newTask");
  const tasklist = document.getElementById("tasklist");
  const createBtn = document.getElementById("taskCreate");
  const modalTitle = document.querySelector('#modal-example h3');
  const saveBtn = document.getElementById("saveTask");
  const STORAGE_ACTIVE = "tasks";
  const STORAGE_DONE = "completedTasks";

  const deadlineInput = document.getElementById("deadline");
  const notesInput = document.getElementById("notes");
  const titleInput = document.getElementById("title");
  const highlightInput = form.querySelector('input[name="highlight"]');


  // ---- Date helpers ----
  const isoToday = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`; // YYYY-MM-DD
  };
  const parseAnyDate = (s) => {
    if (!s) return null;
    if (typeof s !== "string") return null;
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

  // ---- Persistence helpers ----
  const load = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  };
  const saveAll = () => {
    localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(tasks));
    localStorage.setItem(STORAGE_DONE, JSON.stringify(doneTasks));
  };

  // ---- State ----
  let tasks = load(STORAGE_ACTIVE).map(t => ({
    timeSpentMs: 0,
    timerRunning: false,
    timerStart: null,
    ...t
  }));
  let doneTasks = load(STORAGE_DONE);
  let sortMode = "created_desc";

  // ---- Utils ----
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (str="") => String(str).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
  const msToHMS = (ms = 0) => {
    ms = Math.max(0, Math.floor(ms));
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  // ---- UI: inject sort bar (no HTML changes needed) ----
  const injectSortBar = () => {
    if (document.getElementById("sortBar")) return;
    const markup = `
      <section id="sortBar" class="container" style="margin-bottom: .75rem;">
        <label for="sortTasks">Sort tasks</label>
        <select id="sortTasks">
          <option value="created_desc">Creation date ↓ (newest)</option>
          <option value="created_asc">Creation date ↑ (oldest)</option>
          <option value="deadline_asc">Deadline date ↑ (soonest)</option>
          <option value="deadline_desc">Deadline date ↓ (latest)</option>
          <option value="important_first">Important first</option>
        </select>
      </section>
    `;
    tasklist.insertAdjacentHTML("beforebegin", markup);
    const select = document.getElementById("sortTasks");
    select.value = sortMode;
    select.addEventListener("change", () => {
      sortMode = select.value;
      rerenderActive();
    });
  };

  const taskCardHTML = (t) => {
    const running = !!t.timerRunning;
    const now = Date.now();
    const elapsed = t.timeSpentMs + (running && t.timerStart ? (now - new Date(t.timerStart).getTime()) : 0);
    return `
      <div class="grid_card ${t.highlight ? "grid_card--featured" : ""}" data-id="${t.id}">
        <h3 class="center">${escapeHtml(t.title)}</h3>
        <p>Creation date: ${escapeHtml(formatDDMMYYYY(t.creationDate))}</p>
        <p>Deadline date: ${escapeHtml(formatDDMMYYYY(t.deadline))}</p>
        <p class="time_spent">Time spent: <span data-role="timer" data-id="${t.id}">${msToHMS(elapsed)}</span></p>
        <details>
          <summary><a>Notes</a></summary>
          <p>${escapeHtml(t.notes || "")}</p>
        </details>
        <section class="modal">
          <span class="nowrap">
            <button class="secondary tasklist_button" data-action="edit" data-target="modal-example">edit</button>
            <button class="secondary tasklist_button" data-action="urgent">urgent</button>
          </span>
          <span class="nowrap">
            <button class="secondary tasklist_button" data-action="delete">delete</button>
            <button class="secondary tasklist_button" data-action="done">done</button>
          </span>
          <span class="nowrap">
            ${running
              ? `<button class="secondary tasklist_button" data-action="stop-timer">stop</button>`
              : `<button class="secondary tasklist_button" data-action="start-timer">start</button>`}
          </span>
        </section>
      </div>
    `;
  };

  const sortFns = {
    created_desc: (a, b) => a.creationDate < b.creationDate ? 1 : (a.creationDate > b.creationDate ? -1 : 0),
    created_asc:  (a, b) => a.creationDate > b.creationDate ? 1 : (a.creationDate < b.creationDate ? -1 : 0),
    deadline_asc: (a, b) => {
      const ad = a.deadline || "9999-12-31";
      const bd = b.deadline || "9999-12-31";
      return ad > bd ? 1 : (ad < bd ? -1 : 0);
    },
    deadline_desc: (a, b) => {
      const ad = a.deadline || "0000-01-01";
      const bd = b.deadline || "0000-01-01";
      return ad < bd ? 1 : (ad > bd ? -1 : 0);
    },
    important_first: (a, b) => {
      if (a.highlight && !b.highlight) return -1;
      if (!a.highlight && b.highlight) return 1;
      // tie-breaker: most recent creation date first
      return (a.creationDate < b.creationDate) ? 1 : (a.creationDate > b.creationDate ? -1 : 0);
    }
  };

  const getSortedTasks = () => {
    const arr = tasks.slice();
    const fn = sortFns[sortMode] || sortFns.created_desc;
    arr.sort(fn);
    return arr;
  };

  const rerenderActive = () => {
    // Remove dynamic cards (those created from tasks with data-id)
    tasklist.querySelectorAll(".grid_card[data-id]").forEach(el => el.remove());
    // Insert in sorted order
    getSortedTasks().forEach(t => {
      tasklist.insertAdjacentHTML("beforeend", taskCardHTML(t));
    });
  };

  const renderAll = () => {
    injectSortBar();
    rerenderActive();
  };

  // Initial render for persisted tasks
  document.addEventListener("DOMContentLoaded", renderAll);

  // ---- Create / Update submit handler ----
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const object = Object.fromEntries(data.entries());

    const isEditing = !!form.dataset.editingId;

    if (isEditing) {
      const id = form.dataset.editingId;
      const idx = tasks.findIndex(t => t.id === id);
      if (idx > -1) {
        const t = tasks[idx];
        t.title = object.title;
        t.deadline = object.deadline || "";
        t.notes = object.notes || "";
        t.highlight = !!object.highlight;

        saveAll();
        alert("Task updated.");
      }
      delete form.dataset.editingId;
      modalTitle.textContent = "Create a new Task";
      saveBtn.value = "Save task";
    } else {
      // create new
      const task = {
        id: uid(),
        title: object.title,
        creationDate: isoToday(),         // store as ISO
        deadline: object.deadline || "",  // store as ISO or empty
        notes: object.notes || "",
        highlight: !!object.highlight,

        done: false,
        // timer fields
        timeSpentMs: 0,
        timerRunning: false,
        timerStart: null
      };
      tasks.push(task);
      saveAll();
      alert("new Task has been save successfully.");
    }

    // close modal
    const cancelBtn = document.querySelector('#modal-example footer input[type="button"]');
    if (cancelBtn) cancelBtn.click();

    // reset form
    form.reset();
    if (deadlineInput) deadlineInput.type = "text";

    rerenderActive();
  });

  // ---- Click delegation for edit, delete, done, urgent, timer ----
  tasklist.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const card = btn.closest(".grid_card");
    if (!card) return;
    const id = card.dataset.id;
    const action = (btn.dataset.action || btn.textContent || "").trim().toLowerCase();
    if (!id) return; // ignore static/sample cards

    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const t = tasks[idx];

    if (action === "delete") {
      if (confirm("Delete this task?")) {
        tasks.splice(idx, 1);
        saveAll();
        rerenderActive();
      }
    } else if (action === "done") {
      // stop timer if running and finalize
      if (t.timerRunning && t.timerStart) {
        const delta = Date.now() - new Date(t.timerStart).getTime();
        t.timeSpentMs += delta;
        t.timerRunning = false;
        t.timerStart = null;
      }
      const task = tasks.splice(idx, 1)[0];
      task.done = true;
      task.doneDate = new Date().toISOString();
      doneTasks.push(task);
      saveAll();
      alert("Task marked as done. You can find it in History.");
      rerenderActive();
    } else if (action === "edit") {
      titleInput.value = t.title || "";
      if (deadlineInput) {
        deadlineInput.type = "date";
        deadlineInput.value = t.deadline || "";
      }
      notesInput.value = t.notes || "";
      highlightInput.checked = !!t.highlight;


      form.dataset.editingId = t.id;
      modalTitle.textContent = "Edit Task";
      saveBtn.value = "Save changes";
      createBtn.click();
    } else if (action === "urgent") {
      t.highlight = !t.highlight;
      saveAll();
      rerenderActive();
    } else if (action === "start-timer") {
      if (!t.timerRunning) {
        t.timerRunning = true;
        t.timerStart = new Date().toISOString();
        saveAll();
        rerenderActive();
      }
    } else if (action === "stop-timer") {
      if (t.timerRunning) {
        const started = new Date(t.timerStart).getTime();
        const delta = Date.now() - started;
        t.timeSpentMs += delta;
        t.timerRunning = false;
        t.timerStart = null;
        saveAll();
        rerenderActive();
      }
    }
  });

  // ---- Live timer update for running tasks ----
  setInterval(() => {
    const now = Date.now();
    tasks.forEach(t => {
      if (!t.timerRunning || !t.timerStart) return;
      const el = document.querySelector(`.grid_card[data-id="${t.id}"] [data-role="timer"]`);
      if (!el) return;
      const elapsed = t.timeSpentMs + (now - new Date(t.timerStart).getTime());
      el.textContent = msToHMS(elapsed);
    });
  }, 1000);

  // Re-render on storage changes from other tabs
  window.addEventListener("storage", (ev) => {
    if (ev.key === STORAGE_ACTIVE) {
      tasks = load(STORAGE_ACTIVE).map(t => ({
        timeSpentMs: 0,
        timerRunning: false,
        timerStart: null,
        ...t
      }));
      rerenderActive();
    }
  });
})();
