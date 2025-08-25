// ReservaSport - Backend (Express) with JSON persistence and admin panel APIs
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // demo password (change for production)
const TOKEN_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading data file', e);
    return null;
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ===== Utilities =====
function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}
function todayISO() {
  const d = new Date();
  const tzOff = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOff*60000);
  return local.toISOString().slice(0,10);
}

// ====== API ======
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/courts', (req, res) => {
  const data = readData();
  res.json(data.courts.filter(c => c.activa));
});

app.get('/api/availability', (req, res) => {
  const { courtId, date } = req.query;
  if (!courtId || !date || !isValidDate(date)) {
    return res.status(400).json({ error: "Parámetros inválidos. Usa courtId y date=YYYY-MM-DD." });
  }
  const data = readData();
  const court = data.courts.find(c => c.id === Number(courtId) && c.activa);
  if (!court) return res.status(404).json({ error: "Cancha no encontrada o inactiva." });
  const slots = court.time_slots.map(sid => {
    const slotMeta = data.time_slots.find(s => s.id === sid) || { id: sid, label: sid };
    const disponible = !data.reservations.some(r => r.courtId === court.id && r.date === date && r.slotId === sid);
    return { id: slotMeta.id, label: slotMeta.label, disponible };
  });
  res.json({ court, date, slots });
});

app.post('/api/reservations', (req, res) => {
  const { courtId, date, slotId, clienteNombre, clienteTelefono } = req.body || {};
  if (!courtId || !date || !slotId || !clienteNombre || !clienteTelefono) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }
  if (!isValidDate(date)) return res.status(400).json({ error: "Fecha inválida. Usa YYYY-MM-DD." });
  if (date < todayISO()) return res.status(400).json({ error: "No se permiten reservas en fechas pasadas." });
  if (!/^\d{6,15}$/.test(clienteTelefono)) return res.status(400).json({ error: "Teléfono inválido. Usa solo números (6-15 dígitos)." });

  const data = readData();
  const court = data.courts.find(c => c.id === Number(courtId) && c.activa);
  if (!court) return res.status(404).json({ error: "Cancha no encontrada." });
  if (!court.time_slots.includes(slotId)) return res.status(400).json({ error: "Franja horaria inválida para esta cancha." });
  const taken = data.reservations.some(r => r.courtId === court.id && r.date === date && r.slotId === slotId);
  if (taken) return res.status(409).json({ error: "La franja ya está reservada." });

  const reservation = {
    id: data.nextReservationId++,
    courtId: court.id,
    date,
    slotId,
    clienteNombre,
    clienteTelefono,
    createdAt: new Date().toISOString()
  };
  data.reservations.push(reservation);
  saveData(data);
  res.status(201).json({ message: "Reserva creada con éxito.", reservation });
});

// List reservations (public debug) or filter by date
app.get('/api/reservations', (req, res) => {
  const { date } = req.query;
  const data = readData();
  if (date && !isValidDate(date)) return res.status(400).json({ error: "Fecha inválida." });
  const filtered = date ? data.reservations.filter(r => r.date === date) : data.reservations;
  res.json(filtered);
});

// ===== Admin auth (simple token) =====
function generateToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Falta password." });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Password incorrecto." });
  const data = readData();
  const token = generateToken();
  data.adminTokens[token] = { createdAt: new Date().toISOString() };
  saveData(data);
  res.json({ token });
});

function requireAdmin(req, res, next) {
  const auth = req.header('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: "No autorizado." });
  const token = auth.slice(7);
  const data = readData();
  if (!data.adminTokens[token]) return res.status(401).json({ error: "Token inválido o expirado." });
  // token TTL check (optional)
  const created = new Date(data.adminTokens[token].createdAt);
  if (new Date() - created > TOKEN_TTL_MS) {
    delete data.adminTokens[token];
    saveData(data);
    return res.status(401).json({ error: "Token expirado." });
  }
  req.adminToken = token;
  next();
}

// Admin routes
app.get('/api/admin/reservations', requireAdmin, (req, res) => {
  const { date } = req.query;
  const data = readData();
  const list = date ? data.reservations.filter(r => r.date === date) : data.reservations;
  res.json(list);
});

app.delete('/api/admin/reservations/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const data = readData();
  const idx = data.reservations.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: "Reserva no encontrada." });
  const removed = data.reservations.splice(idx,1)[0];
  saveData(data);
  res.json({ message: "Reserva cancelada.", removed });
});

// Serve frontend static (including admin pages)
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ReservaSport backend corriendo en http://localhost:${PORT}`);
});
