/*
  Organizador de turnos conectado a Google Sheets

  Esta versión NO usa localStorage.
  La cola y el nombre de la clase se leen y se guardan en Google Sheets.

  PASOS:
  1. Crea un Google Sheets.
  2. Crea dos hojas dentro del archivo:
     - Estado
     - Historial
  3. En la hoja "Estado":
     A1: className
     B1: Nombre de la clase
     A2: queue
     B2: []
  4. Abre Extensiones > Apps Script.
  5. Pega el código de Apps Script incluido al final de este archivo.
  6. Implementa como "Aplicación web".
  7. Copia la URL del despliegue y pégala en GOOGLE_SCRIPT_URL.
*/

const TEACHER_PASSWORD = "PR0F3SOR";

// Pega aquí la URL de tu Google Apps Script Web App.
const GOOGLE_SCRIPT_URL = "";

let queue = [];
let className = "Nombre de la clase";

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

async function init() {
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

  await loadStateFromGoogleSheets();
}

async function loadStateFromGoogleSheets() {
  if (!GOOGLE_SCRIPT_URL) {
    showStatus("Falta configurar la URL de Google Sheets en main.js.");
    return;
  }

  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getState`);
    const data = await response.json();

    className = data.className || "Nombre de la clase";
    queue = Array.isArray(data.queue) ? data.queue.map(String) : [];

    classNameElement.textContent = className;
    classNameInput.value = className === "Nombre de la clase" ? "" : className;

    renderQueue();
    showStatus("Datos cargados desde Google Sheets.");
  } catch (error) {
    console.error("No se pudo leer Google Sheets:", error);
    showStatus("No se pudo cargar Google Sheets. Revisa la URL y el despliegue.");
  }
}

async function requestTurn(groupNumber) {
  queue = queue.filter((group) => group !== groupNumber);
  queue.push(groupNumber);

  renderQueue();
  showStatus(`Grupo ${groupNumber} añadido al final de la cola.`);

  await saveStateToGoogleSheets(groupNumber, "solicita_turno");
}

async function nextGroup() {
  if (queue.length === 0) {
    showStatus("No hay grupos en cola.");
    renderQueue();
    return;
  }

  const finishedGroup = queue.shift();
  renderQueue();

  showStatus(`Avanza la cola. Sale el grupo ${finishedGroup}.`);
  await saveStateToGoogleSheets(finishedGroup, "siguiente_grupo");
}

async function deleteTurns() {
  const confirmed = confirm("¿Seguro que quieres eliminar todos los turnos?");
  if (!confirmed) return;

  queue = [];
  renderQueue();

  showStatus("Todos los turnos han sido eliminados.");
  await saveStateToGoogleSheets("", "eliminar_turnos");
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

async function saveClassName() {
  const newClassName = classNameInput.value.trim();

  if (!newClassName) {
    showStatus("Escribe un nombre de clase válido.");
    return;
  }

  className = newClassName;
  classNameElement.textContent = className;

  showStatus(`Nombre de la clase cambiado a "${className}".`);
  await saveStateToGoogleSheets("", "cambia_nombre_clase");
}

async function saveStateToGoogleSheets(groupNumber, action) {
  if (!GOOGLE_SCRIPT_URL) {
    showStatus("Falta configurar la URL de Google Sheets en main.js.");
    return;
  }

  const payload = {
    action: "saveState",
    timestamp: new Date().toISOString(),
    className,
    groupNumber,
    eventType: action,
    queue: [...queue]
  };

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("No se pudo guardar en Google Sheets:", error);
    showStatus("No se pudo guardar en Google Sheets.");
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

/*
CÓDIGO PARA GOOGLE APPS SCRIPT

Pega este código completo en Extensiones > Apps Script:

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const estado = getOrCreateSheet_(ss, "Estado");

  setupEstado_(estado);

  const className = estado.getRange("B1").getValue() || "Nombre de la clase";
  const queueText = estado.getRange("B2").getValue() || "[]";

  let queue = [];
  try {
    queue = JSON.parse(queueText);
  } catch (error) {
    queue = [];
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      className: className,
      queue: queue
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const estado = getOrCreateSheet_(ss, "Estado");
  const historial = getOrCreateSheet_(ss, "Historial");

  setupEstado_(estado);
  setupHistorial_(historial);

  const data = JSON.parse(e.postData.contents);

  estado.getRange("A1").setValue("className");
  estado.getRange("B1").setValue(data.className || "Nombre de la clase");
  estado.getRange("A2").setValue("queue");
  estado.getRange("B2").setValue(JSON.stringify(data.queue || []));

  historial.appendRow([
    data.timestamp,
    data.className,
    data.groupNumber,
    data.eventType,
    JSON.stringify(data.queue || [])
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function setupEstado_(sheet) {
  if (!sheet.getRange("A1").getValue()) {
    sheet.getRange("A1").setValue("className");
    sheet.getRange("B1").setValue("Nombre de la clase");
  }

  if (!sheet.getRange("A2").getValue()) {
    sheet.getRange("A2").setValue("queue");
    sheet.getRange("B2").setValue("[]");
  }
}

function setupHistorial_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Fecha",
      "Clase",
      "Grupo",
      "Acción",
      "Cola completa"
    ]);
  }
}
*/
