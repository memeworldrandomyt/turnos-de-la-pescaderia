const POLLING_INTERVAL_MS = 1000;

let queue = [];
let className = "Nombre de la clase";
let lastUpdated = "";
let isSaving = false;
let isTeacherEditingClassName = false;
let pollTimer = null;

const classNameElement = document.getElementById("className");
const classNameInput = document.getElementById("classNameInput");
const queueList = document.getElementById("queueList");
const currentGroupElement = document.getElementById("currentGroup");
const statusMessage = document.getElementById("statusMessage");
const syncInfo = document.getElementById("syncInfo");
const refreshButton = document.getElementById("refreshButton");
const openTeacherPanelButton = document.getElementById("openTeacherPanel");
const closeTeacherPanelButton = document.getElementById("closeTeacherPanel");
const modalOverlay = document.getElementById("modalOverlay");
const passwordView = document.getElementById("passwordView");
const teacherView = document.getElementById("teacherView");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const passwordError = document.getElementById("passwordError");
const saveClassNameButton = document.getElementById("saveClassNameButton");
const nextGroupButton = document.getElementById("nextGroupButton");
const deleteTurnsButton = document.getElementById("deleteTurnsButton");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderQueue();

  document.querySelectorAll(".group-btn").forEach((button) => {
    button.addEventListener("click", () => requestTurn(button.dataset.group));
  });

  refreshButton.addEventListener("click", () => loadState(true));
  openTeacherPanelButton.addEventListener("click", openTeacherPanel);
  closeTeacherPanelButton.addEventListener("click", closeTeacherPanel);
  modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) closeTeacherPanel();
  });
  loginButton.addEventListener("click", loginTeacher);
  passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginTeacher();
  });
  classNameInput.addEventListener("focus", () => { isTeacherEditingClassName = true; });
  classNameInput.addEventListener("input", () => { isTeacherEditingClassName = true; });
  classNameInput.addEventListener("blur", () => {
    setTimeout(() => { isTeacherEditingClassName = false; }, 800);
  });
  classNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveClassName();
  });

  saveClassNameButton.addEventListener("click", saveClassName);
  nextGroupButton.addEventListener("click", nextGroup);
  deleteTurnsButton.addEventListener("click", deleteTurns);

  await loadState(true);
  startAutoSync();
}

function startAutoSync() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!isSaving) loadState(false);
  }, POLLING_INTERVAL_MS);
}

async function loadState(showMessage = false) {
  try {
    const data = await apiGet("/api/state");
    if (!data.ok) throw new Error(data.error || "Error cargando estado");
    applyServerState(data);
    if (showMessage) showStatus("Datos cargados desde archivo local.");
  } catch (error) {
    console.error(error);
    setSyncInfo("Error conectando con el servidor local");
    if (showMessage) showStatus("No se pudo conectar con el servidor local.");
  }
}

async function requestTurn(groupNumber) {
  const previousQueue = [...queue];
  queue = queue.filter(group => group !== groupNumber);
  queue.push(groupNumber);
  renderQueue();
  showStatus(`Grupo ${groupNumber} añadido al final.`);

  try {
    isSaving = true;
    setSyncInfo("Guardando...");
    const data = await apiPost("/api/turn/request", { groupNumber });
    if (!data.ok) throw new Error(data.error || "No se pudo guardar");
    applyServerState(data);
    showStatus(`Grupo ${groupNumber} guardado.`);
  } catch (error) {
    console.error(error);
    queue = previousQueue;
    renderQueue();
    showStatus("Error guardando el turno.");
  } finally {
    isSaving = false;
  }
}

async function nextGroup() {
  if (queue.length === 0) {
    showStatus("No hay grupos en cola.");
    renderQueue();
    return;
  }

  const previousQueue = [...queue];
  const current = queue[0];
  queue.shift();
  renderQueue();
  showStatus(`Sale el grupo ${current}.`);

  try {
    isSaving = true;
    setSyncInfo("Guardando...");
    const data = await apiPost("/api/turn/next", {});
    if (!data.ok) throw new Error(data.error || "No se pudo avanzar");
    applyServerState(data);
    showStatus("Cola actualizada.");
  } catch (error) {
    console.error(error);
    queue = previousQueue;
    renderQueue();
    showStatus("Error avanzando la cola.");
  } finally {
    isSaving = false;
  }
}

async function deleteTurns() {
  const confirmed = confirm(`¿Seguro que quieres eliminar los turnos de "${className}"?`);
  if (!confirmed) return;

  const previousQueue = [...queue];
  queue = [];
  renderQueue();

  try {
    isSaving = true;
    setSyncInfo("Eliminando turnos...");
    const data = await apiPost("/api/turn/delete", {});
    if (!data.ok) throw new Error(data.error || "No se pudieron eliminar los turnos");
    applyServerState(data);
    showStatus(`Turnos eliminados para "${className}".`);
  } catch (error) {
    console.error(error);
    queue = previousQueue;
    renderQueue();
    showStatus("Error eliminando los turnos.");
  } finally {
    isSaving = false;
  }
}

async function saveClassName() {
  const newClassName = classNameInput.value.trim();
  if (!newClassName) {
    showStatus("Escribe un nombre de clase válido.");
    return;
  }

  try {
    isSaving = true;
    isTeacherEditingClassName = false;
    setSyncInfo("Cambiando clase...");
    showStatus(`Cargando clase "${newClassName}"...`);
    const data = await apiPost("/api/class", { className: newClassName });
    if (!data.ok) throw new Error(data.error || "No se pudo cambiar la clase");
    applyServerState(data);
    showStatus(`Clase activa: ${data.className}`);
  } catch (error) {
    console.error(error);
    showStatus("Error cambiando de clase.");
  } finally {
    isSaving = false;
  }
}

async function loginTeacher() {
  try {
    const data = await apiPost("/api/teacher/login", { password: passwordInput.value });
    if (!data.ok) throw new Error(data.error || "Contraseña incorrecta");
    passwordView.classList.add("hidden");
    teacherView.classList.remove("hidden");
    classNameInput.value = className === "Nombre de la clase" ? "" : className;
    setTimeout(() => {
      classNameInput.focus();
      isTeacherEditingClassName = true;
    }, 50);
  } catch {
    passwordError.textContent = "Contraseña incorrecta.";
  }
}

function applyServerState(data) {
  const incomingClassName = data.className || "Nombre de la clase";
  const incomingQueue = Array.isArray(data.queue) ? data.queue.map(String) : [];
  const incomingUpdatedAt = data.updatedAt || "";
  const changed = incomingClassName !== className ||
    JSON.stringify(incomingQueue) !== JSON.stringify(queue) ||
    incomingUpdatedAt !== lastUpdated;

  className = incomingClassName;
  queue = incomingQueue;
  lastUpdated = incomingUpdatedAt;
  classNameElement.textContent = className;

  if (!isTeacherEditingClassName && document.activeElement !== classNameInput) {
    classNameInput.value = className === "Nombre de la clase" ? "" : className;
  }

  if (changed) renderQueue();
  updateSyncInfo();
}

function renderQueue() {
  queueList.innerHTML = "";

  if (queue.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-queue";
    emptyItem.textContent = "No hay grupos en cola";
    queueList.appendChild(emptyItem);
    currentGroupElement.textContent = "Sin turno";
    return;
  }

  queue.forEach((group, index) => {
    const item = document.createElement("li");
    item.className = index === 0 ? "queue-item current" : "queue-item";
    item.innerHTML = index === 0
      ? `<span class="queue-badge">Ahora</span><strong>Grupo ${escapeHtml(group)}</strong>`
      : `<span class="queue-badge">#${index + 1}</span><strong>Grupo ${escapeHtml(group)}</strong>`;
    queueList.appendChild(item);
  });

  currentGroupElement.textContent = `Grupo ${queue[0]}`;
}

function openTeacherPanel() {
  modalOverlay.classList.remove("hidden");
  passwordView.classList.remove("hidden");
  teacherView.classList.add("hidden");
  passwordInput.value = "";
  passwordError.textContent = "";
  isTeacherEditingClassName = false;
  passwordInput.focus();
}

function closeTeacherPanel() {
  modalOverlay.classList.add("hidden");
  isTeacherEditingClassName = false;
}

function updateSyncInfo() {
  if (!lastUpdated) {
    setSyncInfo("Sincronizado con archivo local");
    return;
  }

  const date = new Date(lastUpdated);
  setSyncInfo(Number.isNaN(date.getTime())
    ? "Sincronizado con archivo local"
    : `Sincronizado: ${date.toLocaleTimeString("es-ES")}`
  );
}

function setSyncInfo(text) {
  syncInfo.textContent = text;
}

function showStatus(message) {
  statusMessage.textContent = message;
  setTimeout(() => {
    if (statusMessage.textContent === message) statusMessage.textContent = "";
  }, 3000);
}

async function apiGet(url) {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  return parseJsonResponse(response);
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return parseJsonResponse(response);
}

async function parseJsonResponse(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error de servidor");
  return data;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
