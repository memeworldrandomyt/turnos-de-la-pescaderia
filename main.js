/*
  Organizador de turnos

  IMPORTANTE PARA GOOGLE SHEETS:
  1. Crea un Google Sheet.
  2. Abre Extensiones > Apps Script.
  3. Pega el código de Apps Script incluido al final de este archivo.
  4. Despliega como "Aplicación web".
  5. Copia la URL del despliegue y pégala en GOOGLE_SCRIPT_URL.
*/

const TEACHER_PASSWORD = "PR0F3SOR";

// Pega aquí la URL de tu Google Apps Script Web App.
// Ejemplo: const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/XXXXX/exec";
const GOOGLE_SCRIPT_URL = "";

const STORAGE_KEYS = {
  className: "turnos_class_name",
  queue: "turnos_queue"
};

let queue = loadQueue();

const classNameElement = document.getElementById("className");
const classNameInput = document.getElementById("classNameInput");
const queueList = document.getElementById("queueList");
const currentGroupElement = document.getElementById("currentGroup");
const statusMessage = document.getElementById("statusMessage");

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

function init() {
  const savedClassName = localStorage.getItem(STORAGE_KEYS.className) || "Nombre de la clase";
  classNameElement.textContent = savedClassName;
  classNameInput.value = savedClassName === "Nombre de la clase" ? "" : savedClassName;

  renderQueue();

  document.querySelectorAll(".group-btn").forEach((button) => {
    button.addEventListener("click", () => requestTurn(button.dataset.group));
  });

  openTeacherPanelButton.addEventListener("click", openTeacherPanel);
  closeTeacherPanelButton.addEventListener("click", closeTeacherPanel);
  modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) closeTeacherPanel();
  });

  loginButton.addEventListener("click", loginTeacher);
  passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginTeacher();
  });

  saveClassNameButton.addEventListener("click", saveClassName);
  nextGroupButton.addEventListener("click", nextGroup);
  deleteTurnsButton.addEventListener("click", deleteTurns);
}

function requestTurn(groupNumber) {
  // Si el grupo ya estaba en la cola, se elimina para colocarlo al final.
  queue = queue.filter((group) => group !== groupNumber);
  queue.push(groupNumber);

  saveQueue();
  renderQueue();

  showStatus(`Grupo ${groupNumber} añadido al final de la cola.`);
  saveTurnToGoogleSheets(groupNumber, "solicita_turno");
}

function nextGroup() {
  if (queue.length === 0) {
    showStatus("No hay grupos en cola.");
    renderQueue();
    return;
  }

  const finishedGroup = queue.shift();
  saveQueue();
  renderQueue();

  showStatus(`Avanza la cola. Sale el grupo ${finishedGroup}.`);
  saveTurnToGoogleSheets(finishedGroup, "siguiente_grupo");
}

function deleteTurns() {
  const confirmed = confirm("¿Seguro que quieres eliminar todos los turnos?");
  if (!confirmed) return;

  queue = [];
  saveQueue();
  renderQueue();

  showStatus("Todos los turnos han sido eliminados.");
  saveTurnToGoogleSheets("", "eliminar_turnos");
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
      ? `<span class="queue-badge">Ahora</span><strong>Grupo ${group}</strong>`
      : `<span class="queue-badge">#${index + 1}</span><strong>Grupo ${group}</strong>`;
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
  passwordInput.focus();
}

function closeTeacherPanel() {
  modalOverlay.classList.add("hidden");
}

function loginTeacher() {
  if (passwordInput.value === TEACHER_PASSWORD) {
    passwordView.classList.add("hidden");
    teacherView.classList.remove("hidden");
    classNameInput.focus();
  } else {
    passwordError.textContent = "Contraseña incorrecta.";
  }
}

function saveClassName() {
  const newClassName = classNameInput.value.trim();

  if (!newClassName) {
    showStatus("Escribe un nombre de clase válido.");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.className, newClassName);
  classNameElement.textContent = newClassName;
  showStatus(`Nombre de la clase cambiado a "${newClassName}".`);

  saveTurnToGoogleSheets("", "cambia_nombre_clase", {
    className: newClassName
  });
}

function saveQueue() {
  localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
}

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.queue)) || [];
  } catch {
    return [];
  }
}

function showStatus(message) {
  statusMessage.textContent = message;
  setTimeout(() => {
    if (statusMessage.textContent === message) {
      statusMessage.textContent = "";
    }
  }, 3500);
}

async function saveTurnToGoogleSheets(groupNumber, action, extraData = {}) {
  if (!GOOGLE_SCRIPT_URL) {
    console.info("Google Sheets no configurado. Acción local:", { groupNumber, action, extraData });
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    className: classNameElement.textContent,
    groupNumber,
    action,
    queue: [...queue],
    ...extraData
  };

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("No se pudo guardar en Google Sheets:", error);
  }
}

/*
CÓDIGO PARA GOOGLE APPS SCRIPT

Pega esto en Extensiones > Apps Script dentro de tu Google Sheet:

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Fecha",
      "Clase",
      "Grupo",
      "Acción",
      "Cola completa"
    ]);
  }

  sheet.appendRow([
    data.timestamp,
    data.className,
    data.groupNumber,
    data.action,
    JSON.stringify(data.queue)
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
*/
