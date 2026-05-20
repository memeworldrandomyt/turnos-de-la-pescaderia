// ===============================
// CONFIGURACIÓN GOOGLE
// ===============================
const CLIENT_ID = "612791406937-ng47pmb3u6c6htt36ieek5dkfcn4a3re.apps.googleusercontent.com";
const SPREADSHEET_ID = "1QSGVRcxIL8nvCh2g2ehN-fsHhs0yP_PjVIf2n28mE2c";

const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

// ===============================
// CONFIGURACIÓN APP
// ===============================
const TEACHER_PASSWORD = "PR0F3SOR";
const POLL_INTERVAL_MS = 2500;
const DEFAULT_APP_NAME = "Turnos de la pescadería";

const CONFIG_RANGE = "Config!A1:B2";
const CONFIG_CLASS_CELL = "Config!B2";
const TURNS_RANGE = "Turnos!A1:D";
const TURNS_BODY_RANGE = "Turnos!A2:D";

// ===============================
// ESTADO
// ===============================
let state = {
  className: DEFAULT_APP_NAME,
  queue: [],
  currentGroup: null,
  isTeacherLoggedIn: false,
  teacherPanelOpen: false,
  isSaving: false,
  isGoogleReady: false,
  isSignedIn: false
};

let tokenClient = null;
let pollTimer = null;
let isEditingClassName = false;

// ===============================
// ELEMENTOS
// ===============================
const classNameTitle = document.getElementById("classNameTitle");
const groupsGrid = document.getElementById("groupsGrid");
const queueList = document.getElementById("queueList");
const queueCount = document.getElementById("queueCount");
const currentGroupText = document.getElementById("currentGroupText");
const currentGroupBox = document.getElementById("currentGroupBox");
const statusMessage = document.getElementById("statusMessage");

const connectGoogleButton = document.getElementById("connectGoogleButton");

const modalBackdrop = document.getElementById("modalBackdrop");
const openTeacherPanel = document.getElementById("openTeacherPanel");
const closeTeacherPanel = document.getElementById("closeTeacherPanel");

const loginView = document.getElementById("loginView");
const teacherView = document.getElementById("teacherView");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

const classNameInput = document.getElementById("classNameInput");
const saveClassButton = document.getElementById("saveClassButton");
const teacherCurrentGroup = document.getElementById("teacherCurrentGroup");
const nextGroupButton = document.getElementById("nextGroupButton");
const clearQueueButton = document.getElementById("clearQueueButton");

const nextGroupWaitMessage = document.getElementById("nextGroupWaitMessage");
const clearQueueWaitMessage = document.getElementById("clearQueueWaitMessage");

// ===============================
// INICIO GOOGLE
// ===============================
window.addEventListener("load", () => {
  render();
  initializeWhenGoogleIsReady();
});

function initializeWhenGoogleIsReady() {
  let attempts = 0;
  const maxAttempts = 100;

  const interval = setInterval(() => {
    attempts++;

    const hasGapi = typeof window.gapi !== "undefined";

    const hasGoogleIdentity =
      typeof window.google !== "undefined" &&
      google.accounts &&
      google.accounts.oauth2;

    if (hasGapi && hasGoogleIdentity) {
      clearInterval(interval);
      initializeGoogle();
      return;
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);

      setStatus(
        "No se pudieron cargar las librerías de Google. Abre la web desde http://localhost:5500.",
        "error"
      );

      console.error("Google no cargó correctamente", {
        gapi: hasGapi,
        googleIdentity: hasGoogleIdentity,
        currentOrigin: window.location.origin
      });
    }
  }, 100);
}

async function initializeGoogle() {
  try {
    if (!CLIENT_ID || CLIENT_ID.includes("PEGA_AQUI")) {
      setStatus("Falta poner el CLIENT_ID en main.js.", "error");
      return;
    }

    if (!SPREADSHEET_ID || SPREADSHEET_ID.includes("PEGA_AQUI")) {
      setStatus("Falta poner el SPREADSHEET_ID en main.js.", "error");
      return;
    }

    await new Promise((resolve, reject) => {
      gapi.load("client", {
        callback: resolve,
        onerror: () => reject(new Error("No se pudo cargar gapi.client")),
        timeout: 8000,
        ontimeout: () => reject(new Error("Tiempo agotado cargando gapi.client"))
      });
    });

    await gapi.client.init({
      discoveryDocs: [DISCOVERY_DOC]
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          setStatus("Error al iniciar sesión con Google.", "error");
          console.error(tokenResponse);
          return;
        }

        state.isSignedIn = true;
        state.isGoogleReady = true;

        connectGoogleButton.textContent = "Google conectado";
        connectGoogleButton.disabled = true;

        setStatus("Conectado con Google. Cargando turnos...", "loading");

        await setupSheetsIfNeeded();
        await loadState(false);
        startPolling();
      }
    });

    state.isGoogleReady = true;
    setStatus("Listo. Pulsa “Conectar con Google”.", "ok");
  } catch (error) {
    setStatus(error.message || "No se pudo inicializar Google Sheets API.", "error");
    console.error(error);
  }
}

function connectGoogle() {
  if (!tokenClient) {
    setStatus("Google todavía se está cargando. Inténtalo de nuevo.", "loading");
    return;
  }

  tokenClient.requestAccessToken({
    prompt: "consent"
  });
}

function requireGoogleConnection() {
  if (!state.isSignedIn) {
    setStatus("Primero conecta con Google.", "error");
    return false;
  }

  return true;
}

// ===============================
// GOOGLE SHEETS API
// ===============================
async function getValues(range) {
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range
  });

  return response.result.values || [];
}

async function updateValues(range, values) {
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    resource: {
      values
    }
  });
}

async function clearValues(range) {
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range
  });
}

async function setupSheetsIfNeeded() {
  const spreadsheet = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });

  const sheetNames = spreadsheet.result.sheets.map((sheet) => {
    return sheet.properties.title;
  });

  const requests = [];

  if (!sheetNames.includes("Config")) {
    requests.push({
      addSheet: {
        properties: {
          title: "Config"
        }
      }
    });
  }

  if (!sheetNames.includes("Turnos")) {
    requests.push({
      addSheet: {
        properties: {
          title: "Turnos"
        }
      }
    });
  }

  if (requests.length > 0) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests
      }
    });
  }

  const configValues = await getValues(CONFIG_RANGE);

  if (!configValues[0] || configValues[0][0] !== "clave") {
    await updateValues(CONFIG_RANGE, [
      ["clave", "valor"],
      ["className", DEFAULT_APP_NAME]
    ]);
  }

  const currentClassName = configValues[1] && configValues[1][1];

  if (!currentClassName || currentClassName === "Clase sin configurar") {
    await updateValues(CONFIG_CLASS_CELL, [[DEFAULT_APP_NAME]]);
  }

  const turnValues = await getValues(TURNS_RANGE);

  if (!turnValues[0] || turnValues[0][0] !== "timestamp") {
    await updateValues("Turnos!A1:D1", [
      ["timestamp", "className", "group", "status"]
    ]);
  }
}

async function getClassNameFromSheet() {
  const values = await getValues(CONFIG_CLASS_CELL);
  const value = values[0] && values[0][0];

  return normalizeClassName(value);
}

async function setClassNameInSheet(className) {
  await updateValues(CONFIG_CLASS_CELL, [[className]]);
}

async function getAllTurnRows() {
  const rows = await getValues(TURNS_BODY_RANGE);

  return rows.map((row) => {
    return {
      timestamp: row[0] || "",
      className: row[1] || "",
      group: row[2] || "",
      status: row[3] || ""
    };
  });
}

async function getQueueForClass(className) {
  const rows = await getAllTurnRows();

  return rows
    .filter((row) => {
      return row.className === className && row.status === "queued";
    })
    .sort((a, b) => {
      return new Date(a.timestamp) - new Date(b.timestamp);
    })
    .map((row) => {
      return String(row.group);
    });
}

async function saveQueueForClass(className, queue) {
  const allRows = await getAllTurnRows();

  const remainingRows = allRows.filter((row) => {
    return row.className !== className;
  });

  const now = Date.now();

  const queueRows = queue.map((group, index) => {
    return {
      timestamp: new Date(now + index).toISOString(),
      className,
      group: String(group),
      status: "queued"
    };
  });

  const finalRows = [...remainingRows, ...queueRows];

  await clearValues(TURNS_BODY_RANGE);

  if (finalRows.length > 0) {
    await updateValues(
      TURNS_BODY_RANGE,
      finalRows.map((row) => {
        return [
          row.timestamp,
          row.className,
          row.group,
          row.status
        ];
      })
    );
  }
}

// ===============================
// ACCIONES APP
// ===============================
function normalizeClassName(value) {
  if (!value) return DEFAULT_APP_NAME;

  const cleanValue = String(value).trim();

  if (!cleanValue) return DEFAULT_APP_NAME;
  if (cleanValue === "Clase sin configurar") return DEFAULT_APP_NAME;

  return cleanValue;
}

async function loadState(silent = false) {
  if (!requireGoogleConnection()) return;
  if (state.isSaving) return;

  try {
    const className = await getClassNameFromSheet();
    const queue = await getQueueForClass(className);

    state.className = className;
    state.queue = queue;
    state.currentGroup = queue.length > 0 ? queue[0] : null;

    render();

    if (!silent) {
      setStatus("Turnos cargados desde Google Sheets.", "ok");
    }
  } catch (error) {
    setStatus("No se pudieron cargar los turnos.", "error");
    console.error(error);
  }
}

async function requestTurn(groupNumber) {
  if (!requireGoogleConnection()) return;
  if (state.isSaving) return;

  try {
    state.isSaving = true;
    setStatus(`Añadiendo Grupo ${groupNumber}...`, "loading");

    const className = await getClassNameFromSheet();

    let queue = await getQueueForClass(className);

    queue = queue.filter((group) => {
      return group !== String(groupNumber);
    });

    queue.push(String(groupNumber));

    await saveQueueForClass(className, queue);

    state.className = className;
    state.queue = queue;
    state.currentGroup = queue.length > 0 ? queue[0] : null;

    render();
    setStatus(`Grupo ${groupNumber} añadido a la cola.`, "ok");
  } catch (error) {
    setStatus("No se pudo guardar el turno.", "error");
    console.error(error);
  } finally {
    state.isSaving = false;
  }
}

async function saveClassName() {
  if (!requireGoogleConnection()) return;

  const newClassName = classNameInput.value.trim();

  if (!newClassName) {
    setStatus("El nombre de la clase no puede estar vacío.", "error");
    return;
  }

  if (state.isSaving) return;

  try {
    state.isSaving = true;
    isEditingClassName = false;

    setStatus("Guardando nombre de clase...", "loading");

    await setClassNameInSheet(newClassName);

    const queue = await getQueueForClass(newClassName);

    state.className = newClassName;
    state.queue = queue;
    state.currentGroup = queue.length > 0 ? queue[0] : null;

    render(true);
    setStatus("Nombre de clase guardado.", "ok");
  } catch (error) {
    setStatus("No se pudo guardar el nombre de la clase.", "error");
    console.error(error);
  } finally {
    state.isSaving = false;
  }
}

async function nextGroup() {
  if (!requireGoogleConnection()) return;
  if (state.isSaving) return;

  try {
    state.isSaving = true;

    nextGroupButton.disabled = true;
    clearQueueButton.disabled = true;
    nextGroupWaitMessage.classList.remove("hidden");

    setStatus("Avanzando al siguiente grupo...", "loading");

    const className = await getClassNameFromSheet();
    const queue = await getQueueForClass(className);

    if (queue.length > 0) {
      queue.shift();
    }

    await saveQueueForClass(className, queue);

    state.className = className;
    state.queue = queue;
    state.currentGroup = queue.length > 0 ? queue[0] : null;

    render();
    setStatus("Turno actualizado.", "ok");
  } catch (error) {
    setStatus("No se pudo avanzar el turno.", "error");
    console.error(error);
  } finally {
    state.isSaving = false;

    nextGroupButton.disabled = false;
    clearQueueButton.disabled = false;
    nextGroupWaitMessage.classList.add("hidden");
  }
}

async function clearQueue() {
  if (!requireGoogleConnection()) return;

  const confirmClear = window.confirm("¿Seguro que quieres vaciar la cola de esta clase?");
  if (!confirmClear) return;

  if (state.isSaving) return;

  try {
    state.isSaving = true;

    nextGroupButton.disabled = true;
    clearQueueButton.disabled = true;
    clearQueueWaitMessage.classList.remove("hidden");

    setStatus("Vaciando cola...", "loading");

    const className = await getClassNameFromSheet();

    await saveQueueForClass(className, []);

    state.className = className;
    state.queue = [];
    state.currentGroup = null;

    render();
    setStatus("Cola vaciada.", "ok");
  } catch (error) {
    setStatus("No se pudo vaciar la cola.", "error");
    console.error(error);
  } finally {
    state.isSaving = false;

    nextGroupButton.disabled = false;
    clearQueueButton.disabled = false;
    clearQueueWaitMessage.classList.add("hidden");
  }
}

// ===============================
// RENDER
// ===============================
function render(forceClassInputUpdate = false) {
  const visibleClassName = normalizeClassName(state.className);

  classNameTitle.textContent = visibleClassName;

  if (forceClassInputUpdate) {
    classNameInput.value =
      visibleClassName === DEFAULT_APP_NAME ? "" : visibleClassName;
  } else if (!state.teacherPanelOpen && !isEditingClassName) {
    classNameInput.value =
      visibleClassName === DEFAULT_APP_NAME ? "" : visibleClassName;
  }

  queueCount.textContent = state.queue.length;

  const current = state.queue[0] || null;

  currentGroupText.textContent = current ? `Grupo ${current}` : "Ninguno";
  teacherCurrentGroup.textContent = current ? `Grupo ${current}` : "Ninguno";

  currentGroupBox.classList.toggle("empty", !current);

  queueList.innerHTML = "";

  if (state.queue.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-queue";
    emptyItem.textContent = "No hay grupos en cola";
    queueList.appendChild(emptyItem);
    return;
  }

  state.queue.forEach((group, index) => {
    const item = document.createElement("li");
    item.className = index === 0 ? "queue-item active" : "queue-item";

    const position = document.createElement("span");
    position.className = "queue-position";
    position.textContent = index === 0 ? "Actual" : `${index + 1}`;

    const label = document.createElement("strong");
    label.textContent = `Grupo ${group}`;

    item.appendChild(position);
    item.appendChild(label);

    queueList.appendChild(item);
  });
}

function setStatus(message, type = "normal") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

// ===============================
// MODAL PROFESOR
// ===============================
function openModal() {
  state.teacherPanelOpen = true;
  modalBackdrop.classList.remove("hidden");

  if (state.isTeacherLoggedIn) {
    showTeacherView();
  } else {
    showLoginView();
    passwordInput.focus();
  }
}

function closeModal() {
  state.teacherPanelOpen = false;
  modalBackdrop.classList.add("hidden");

  passwordInput.value = "";
  loginError.textContent = "";
  isEditingClassName = false;
}

function showLoginView() {
  loginView.classList.remove("hidden");
  teacherView.classList.add("hidden");
}

function showTeacherView() {
  loginView.classList.add("hidden");
  teacherView.classList.remove("hidden");

  render(true);
}

function loginTeacher() {
  if (passwordInput.value === TEACHER_PASSWORD) {
    state.isTeacherLoggedIn = true;
    loginError.textContent = "";
    showTeacherView();
    return;
  }

  loginError.textContent = "Contraseña incorrecta";
  passwordInput.select();
}

// ===============================
// POLLING
// ===============================
function startPolling() {
  stopPolling();

  pollTimer = window.setInterval(() => {
    loadState(true);
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ===============================
// EVENTOS
// ===============================
connectGoogleButton.addEventListener("click", connectGoogle);

groupsGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".group-button");
  if (!button) return;

  requestTurn(button.dataset.group);
});

openTeacherPanel.addEventListener("click", openModal);
closeTeacherPanel.addEventListener("click", closeModal);

modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) {
    closeModal();
  }
});

loginButton.addEventListener("click", loginTeacher);

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginTeacher();
  }
});

classNameInput.addEventListener("focus", () => {
  isEditingClassName = true;
});

classNameInput.addEventListener("input", () => {
  isEditingClassName = true;
});

classNameInput.addEventListener("blur", () => {
  isEditingClassName = false;
});

classNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    saveClassName();
  }
});

saveClassButton.addEventListener("click", saveClassName);
nextGroupButton.addEventListener("click", nextGroup);
clearQueueButton.addEventListener("click", clearQueue);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else if (state.isSignedIn) {
    loadState(true);
    startPolling();
  }
});