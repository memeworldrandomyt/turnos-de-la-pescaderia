require("dotenv").config();

const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || "PR0F3SOR";
const DEFAULT_CLASS_NAME = process.env.DEFAULT_CLASS_NAME || "Nombre de la clase";
const DB_FILE = path.join(__dirname, process.env.DB_FILE || "data/db.json");

let writeQueue = Promise.resolve();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (req, res) => {
  try {
    await ensureDatabase();
    res.json({ ok: true, database: "text-file", file: process.env.DB_FILE || "data/db.json" });
  } catch {
    res.status(500).json({ ok: false, error: "No se pudo abrir el archivo de datos" });
  }
});

app.post("/api/teacher/login", (req, res) => {
  if (String(req.body.password || "") === TEACHER_PASSWORD) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
});

app.get("/api/state", async (req, res) => {
  try {
    const db = await readDatabase();
    const activeClass = getActiveClass(db);
    const classData = getOrCreateClass(db, activeClass);

    res.json({
      ok: true,
      className: activeClass,
      queue: classData.queue,
      updatedAt: classData.updatedAt || new Date().toISOString()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "No se pudo cargar la cola" });
  }
});

app.post("/api/class", async (req, res) => {
  const className = sanitizeClassName(req.body.className);
  if (!className) return res.status(400).json({ ok: false, error: "Nombre de clase no válido" });

  try {
    const result = await updateDatabase((db) => {
      db.activeClass = className;
      const classData = getOrCreateClass(db, className);

      addHistory(db, {
        className,
        groupNumber: null,
        action: "change_class",
        queue: classData.queue,
        ip: req.ip
      });

      return {
        db,
        response: {
          ok: true,
          className,
          queue: classData.queue,
          updatedAt: classData.updatedAt || new Date().toISOString()
        }
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "No se pudo cambiar la clase" });
  }
});

app.post("/api/turn/request", async (req, res) => {
  const groupNumber = sanitizeGroupNumber(req.body.groupNumber);
  if (!groupNumber) return res.status(400).json({ ok: false, error: "Grupo no válido" });

  try {
    const result = await updateDatabase((db) => {
      const activeClass = getActiveClass(db);
      const classData = getOrCreateClass(db, activeClass);

      classData.queue = classData.queue.filter((group) => String(group) !== groupNumber);
      classData.queue.push(groupNumber);
      classData.updatedAt = new Date().toISOString();

      addHistory(db, {
        className: activeClass,
        groupNumber,
        action: "request_turn",
        queue: classData.queue,
        ip: req.ip
      });

      return {
        db,
        response: {
          ok: true,
          className: activeClass,
          groupNumber,
          queue: classData.queue,
          updatedAt: classData.updatedAt
        }
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "No se pudo guardar el turno" });
  }
});

app.post("/api/turn/next", async (req, res) => {
  try {
    const result = await updateDatabase((db) => {
      const activeClass = getActiveClass(db);
      const classData = getOrCreateClass(db, activeClass);
      const removedGroup = classData.queue.length > 0 ? String(classData.queue.shift()) : null;

      classData.updatedAt = new Date().toISOString();

      addHistory(db, {
        className: activeClass,
        groupNumber: removedGroup,
        action: "next_group",
        queue: classData.queue,
        ip: req.ip
      });

      return {
        db,
        response: {
          ok: true,
          className: activeClass,
          groupNumber: removedGroup,
          queue: classData.queue,
          updatedAt: classData.updatedAt
        }
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "No se pudo avanzar la cola" });
  }
});

app.post("/api/turn/delete", async (req, res) => {
  try {
    const result = await updateDatabase((db) => {
      const activeClass = getActiveClass(db);
      const classData = getOrCreateClass(db, activeClass);

      classData.queue = [];
      classData.updatedAt = new Date().toISOString();

      addHistory(db, {
        className: activeClass,
        groupNumber: null,
        action: "delete_turns",
        queue: classData.queue,
        ip: req.ip
      });

      return {
        db,
        response: {
          ok: true,
          className: activeClass,
          queue: classData.queue,
          updatedAt: classData.updatedAt
        }
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "No se pudieron eliminar los turnos" });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const db = await readDatabase();
    const activeClass = getActiveClass(db);
    const history = Array.isArray(db.history) ? db.history : [];

    res.json({
      ok: true,
      className: activeClass,
      history: history.filter((item) => item.className === activeClass).slice(-50).reverse()
    });
  } catch {
    res.status(500).json({ ok: false, error: "No se pudo cargar el historial" });
  }
});

function updateDatabase(mutator) {
  writeQueue = writeQueue.then(async () => {
    const db = await readDatabase();
    const result = mutator(db);
    const nextDb = result.db || db;
    await writeDatabase(nextDb);
    return result.response;
  });
  return writeQueue;
}

async function ensureDatabase() {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await writeDatabase(createEmptyDatabase());
  }
}

async function readDatabase() {
  await ensureDatabase();
  const raw = await fs.readFile(DB_FILE, "utf-8");
  try {
    return normalizeDatabase(JSON.parse(raw));
  } catch {
    const backup = DB_FILE + ".broken-" + Date.now();
    await fs.rename(DB_FILE, backup);
    const fresh = createEmptyDatabase();
    await writeDatabase(fresh);
    return fresh;
  }
}

async function writeDatabase(db) {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  const tempFile = DB_FILE + ".tmp";
  await fs.writeFile(tempFile, JSON.stringify(normalizeDatabase(db), null, 2), "utf-8");
  await fs.rename(tempFile, DB_FILE);
}

function createEmptyDatabase() {
  const now = new Date().toISOString();
  return {
    activeClass: DEFAULT_CLASS_NAME,
    classes: {
      [DEFAULT_CLASS_NAME]: {
        queue: [],
        updatedAt: now
      }
    },
    history: []
  };
}

function normalizeDatabase(db) {
  const normalized = {
    activeClass: sanitizeClassName(db && db.activeClass) || DEFAULT_CLASS_NAME,
    classes: db && typeof db.classes === "object" && db.classes !== null ? db.classes : {},
    history: Array.isArray(db && db.history) ? db.history : []
  };

  getOrCreateClass(normalized, normalized.activeClass);
  return normalized;
}

function getActiveClass(db) {
  db.activeClass = sanitizeClassName(db.activeClass) || DEFAULT_CLASS_NAME;
  getOrCreateClass(db, db.activeClass);
  return db.activeClass;
}

function getOrCreateClass(db, className) {
  const cleanName = sanitizeClassName(className) || DEFAULT_CLASS_NAME;

  if (!db.classes || typeof db.classes !== "object") db.classes = {};

  if (!db.classes[cleanName]) {
    db.classes[cleanName] = {
      queue: [],
      updatedAt: new Date().toISOString()
    };
  }

  if (!Array.isArray(db.classes[cleanName].queue)) {
    db.classes[cleanName].queue = [];
  }

  db.classes[cleanName].queue = db.classes[cleanName].queue
    .map(String)
    .filter((group) => /^[1-8]$/.test(group));

  if (!db.classes[cleanName].updatedAt) {
    db.classes[cleanName].updatedAt = new Date().toISOString();
  }

  return db.classes[cleanName];
}

function addHistory(db, entry) {
  if (!Array.isArray(db.history)) db.history = [];

  db.history.push({
    timestamp: new Date().toISOString(),
    className: entry.className,
    groupNumber: entry.groupNumber,
    action: entry.action,
    queueSnapshot: [...entry.queue],
    ip: entry.ip || null
  });

  if (db.history.length > 1000) {
    db.history = db.history.slice(-1000);
  }
}

function sanitizeClassName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 150);
}

function sanitizeGroupNumber(value) {
  const clean = String(value || "").trim();
  return /^[1-8]$/.test(clean) ? clean : "";
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
  console.log(`Base de datos: ${process.env.DB_FILE || "data/db.json"}`);
});
