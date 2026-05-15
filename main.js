// Reemplaza esta constante con la URL real de tu implementación de Google Apps Script
const WEB_APP_URL = "https://google.com";

// Memoria local temporal de la cola del cliente
let localQueue = [];

// 1. LEER DATOS (Consume tu función doGet)
async function fetchSheetData() {
  try {
    const response = await fetch(WEB_APP_URL);
    const data = await response.json();
    
    // Almacenar cola global para mutaciones
    localQueue = data.queue || [];
    
    // Renderizar datos en el DOM de forma asíncrona
    document.getElementById("classNameDisplay").innerText = data.className;
    
    const queueContainer = document.getElementById("queueContainer");
    if (localQueue.length === 0) {
      queueContainer.innerHTML = "<li>La cola está vacía</li>";
    } else {
      queueContainer.innerHTML = localQueue
        .map((group, index) => `<li>Posición ${index + 1}: Grupo ${group}</li>`)
        .join("");
    }
    
    document.getElementById("statusBadge").innerText = "Sincronizado";
    document.getElementById("statusBadge").style.backgroundColor = "#e6f4ea";
  } catch (error) {
    console.error("Error obteniendo datos de Sheets:", error);
    document.getElementById("statusBadge").innerText = "Error de conexión";
    document.getElementById("statusBadge").style.backgroundColor = "#fce8e6";
  }
}

// 2. ESCRIBIR DATOS (Consume tu función doPost)
async function sendSheetData(event) {
  // CRITICAL: Evita que la página web se recargue por el evento Submit del formulario
  event.preventDefault(); 
  
  const classInput = document.getElementById("classNameInput").value;
  const groupInput = document.getElementById("groupInput").value;
  
  // Clonar la cola existente y añadir el nuevo grupo si fue digitado
  let updatedQueue = [...localQueue];
  if (groupInput) {
    updatedQueue.push(parseInt(groupInput));
  }

  // Generar el payload idéntico a lo que espera tu función doPost(e)
  const payload = {
    timestamp: new Date().toISOString(),
    className: classInput || document.getElementById("classNameDisplay").innerText,
    groupNumber: groupInput ? `Grupo ${groupInput}` : "N/A",
    eventType: "Update_Web_Interface",
    queue: updatedQueue
  };

  try {
    document.getElementById("submitBtn").innerText = "Guardando...";
    
    // Ejecución HTTP POST hacia Apps Script
    const response = await fetch(WEB_APP_URL, {
      method: "POST",
      mode: "no-cors", // Requerido para evitar problemas de redirección CORS de Google
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Limpiar input de grupo tras el éxito simulado
    document.getElementById("groupInput").value = "";
    
    // Forzar lectura inmediata para reflejar los cambios en segundos
    setTimeout(fetchSheetData, 1500);
    
  } catch (error) {
    console.error("Error al actualizar datos:", error);
  } finally {
    document.getElementById("submitBtn").innerText = "Actualizar en Sheets";
  }
}

// 3. LISTENERS Y FLUJO DE TIEMPO REAL
document.getElementById("updateForm").addEventListener("submit", sendSheetData);

// Carga inicial de datos de Google Sheets
document.addEventListener("DOMContentLoaded", fetchSheetData);

// Sincronización en segundo plano cada 6 segundos para actualización bidireccional
setInterval(fetchSheetData, 6000);

