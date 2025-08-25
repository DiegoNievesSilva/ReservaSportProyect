
// Frontend updated for ReservaSport MVP - validations and improved UX
const API_BASE = "";

let state = { courts: [], selectedCourtId: null, selectedDate: null, selectedSlotId: null, cachedAvailability: null };

const courtSelect = document.getElementById("courtSelect");
const dateInput = document.getElementById("dateInput");
const checkBtn = document.getElementById("checkBtn");
const availability = document.getElementById("availability");
const feedback = document.getElementById("feedback");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const clienteNombre = document.getElementById("clienteNombre");
const clienteTelefono = document.getElementById("clienteTelefono");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelBtn");

function todayISO() {
  const d = new Date();
  const tzOff = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOff*60000);
  return local.toISOString().slice(0,10);
}

async function loadCourts() {
  const res = await fetch(`${API_BASE}/api/courts`);
  const data = await res.json();
  state.courts = data;
  courtSelect.innerHTML = data.map(c => `<option value="${c.id}">${c.nombre} - ${c.tipo} ($${c.tarifa})</option>`).join("");
  state.selectedCourtId = data.length ? data[0].id : null;
}

async function loadAvailability() {
  if (!state.selectedCourtId || !state.selectedDate) return;
  feedback.textContent = "Cargando disponibilidad...";
  availability.innerHTML = "";
  try {
    const res = await fetch(`/api/availability?courtId=${state.selectedCourtId}&date=${state.selectedDate}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.cachedAvailability = data;
    renderAvailability(data);
    feedback.textContent = "Listo.";
  } catch (err) {
    feedback.textContent = "Error: " + err.message;
  }
}

function renderAvailability(data) {
  availability.innerHTML = "";
  data.slots.forEach(s => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="slot">
        <div class="label">${s.label}</div>
        <div class="badge ${s.disponible ? "ok" : "no"}">${s.disponible ? "Disponible" : "Ocupado"}</div>
      </div>
      <div class="actions">
        <button class="btn ${s.disponible ? "primary" : "outline"}" ${s.disponible ? "" : "disabled"} data-slot="${s.id}">
          ${s.disponible ? "Reservar" : "No disponible"}
        </button>
      </div>
    `;
    availability.appendChild(card);
  });

  availability.querySelectorAll("button[data-slot]").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.getAttribute("data-slot")));
  });
}

function openModal(slotId) {
  state.selectedSlotId = slotId;
  const slot = state.cachedAvailability?.slots?.find(s => s.id === slotId);
  const court = state.courts.find(c => c.id === Number(state.selectedCourtId));
  modalTitle.textContent = `Confirmar: ${court?.nombre} | ${state.selectedDate} | ${slot?.label}`;
  clienteNombre.value = "";
  clienteTelefono.value = "";
  modal.classList.remove("hidden");
}

function closeModal() { modal.classList.add("hidden"); }

async function confirmReservation() {
  if (!state.selectedCourtId || !state.selectedDate || !state.selectedSlotId) return;
  const body = { courtId: state.selectedCourtId, date: state.selectedDate, slotId: state.selectedSlotId, clienteNombre: clienteNombre.value.trim(), clienteTelefono: clienteTelefono.value.trim() };
  if (!body.clienteNombre || !body.clienteTelefono) return alert("Por favor completa nombre y teléfono.");
  if (!/^\d{6,15}$/.test(body.clienteTelefono)) return alert("Teléfono inválido. Usa solo números (6-15 dígitos).");

  confirmBtn.disabled = true;
  try {
    const res = await fetch(`/api/reservations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al crear la reserva.");
    // show success modal-like feedback
    closeModal();
    feedback.innerHTML = `<div style="padding:12px;background:#052e16;border-radius:10px;">✅ Reserva creada (ID: ${data.reservation.id}) — ${data.reservation.date} ${data.reservation.slotId}</div>`;
    await loadAvailability();
  } catch (err) {
    feedback.textContent = "❌ " + err.message;
  } finally {
    confirmBtn.disabled = false;
  }
}

courtSelect.addEventListener("change", (e) => state.selectedCourtId = Number(e.target.value));
dateInput.addEventListener("change", (e) => state.selectedDate = e.target.value);
checkBtn.addEventListener("click", loadAvailability);
cancelBtn.addEventListener("click", closeModal);
confirmBtn.addEventListener("click", confirmReservation);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

// Init
(async () => {
  await loadCourts();
  dateInput.value = todayISO();
  state.selectedDate = dateInput.value;
  await loadAvailability();
})();
