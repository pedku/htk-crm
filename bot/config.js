// config.js — Configuración del bot HTK

module.exports = {
  // Número de WhatsApp (formato internacional sin +)
  botNumber: "573156032940",

  // Horario laboral
  horario: {
    semana: { inicio: 8, fin: 18 },    // Lun-Vie 8:00 - 18:00
    sabado: { inicio: 8, fin: 13 },     // Sáb 8:00 - 13:00
  },

  // Tiempo sin actividad para resetear sesión (30 min)
  resetTimeoutMs: 30 * 60 * 1000,

  // Límite de mensajes sin opción clara antes de derivar a ingeniero
  maxAutoMensajes: 5,

  // URL base del CRM (para consulta de OT, API local)
  crmApiUrl: "http://localhost:18800",

  // Toggle de consulta de OT desde WhatsApp (CRM lo activa/desactiva)
  consultaOTActiva: false,

  // Palabras clave → número de opción
  // 1=Reparación, 2=Elev/Estab, 3=Automatización,
  // 4=Cargadores, 5=IoT, 6=Otra consulta
  keywords: {
    // ── ELEVADORES (opción 2) ──
    elevador: 2,
    elevadores: 2,
    ascensor: 2,
    ascensores: 2,
    montacarga: 2,
    montacargas: 2,

    // ── ESTABILIZADORES (opción 2) ──
    estabilizador: 2,
    estabilizadores: 2,
    regulador: 2,
    reguladores: 2,
    voltaje: 2,

    // ── CARGADORES (opción 4) ──
    cargador: 4,
    cargadores: 4,
    "vehículo eléctrico": 4,
    "vehiculo electrico": 4,
    "carro eléctrico": 4,
    "carro electrico": 4,
    "auto eléctrico": 4,
    "auto electrico": 4,

    // ── IoT (opción 5) ──
    iot: 5,
    sensor: 5,
    sensores: 5,
    monitoreo: 5,

    // ── AUTOMATIZACIÓN (opción 3) ──
    automatizacion: 3,
    automatización: 3,
    plc: 3,
    tablero: 3,
    "tablero de control": 3,

    // ── REPARACIÓN (opción 1) ──
    reparacion: 1,
    reparación: 1,
    arreglo: 1,
    arreglar: 1,
    dañado: 1,
    dañada: 1,
    "no enciende": 1,
    "no prende": 1,
    "se dañó": 1,
    "se daño": 1,
    taller: 1,
    inverter: 1,
    "aire acondicionado": 1,
    nevera: 1,
    lavadora: 1,
    microondas: 1,
    plancha: 1,
    pantalla: 1,
  },
};
