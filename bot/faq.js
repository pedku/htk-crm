// faq.js — Preguntas frecuentes con detección por keywords
// Edita los textos libremente, el bot matchea automático.

module.exports = {
  entries: [
    // ─── DIFERENCIA ELEVADOR vs ESTABILIZADOR ─────────
    {
      keywords: ["diferencia", "diferencia entre", "cual es la diferencia",
                 "elevador y estabilizador", "estabilizador y elevador",
                 "que es un elevador", "que es un estabilizador"],
      priority: 10,
      response: `🔌 *¿Diferencia entre Elevador y Estabilizador?* 🤔

Son dos equipos distintos con funciones diferentes:

⚡ *Elevador de voltaje:*
Es un equipo *manual*. Sube el voltaje de salida mediante cambios en los devanados (conexiones internas). No regula por sí solo —si el voltaje de entrada varía, tú tienes que hacer el ajuste manualmente.

✅ Sirve cuando el voltaje de entrada es más bajo de lo normal y necesitas subirlo un nivel fijo.

⚡ *Estabilizador de voltaje:*
Es *automático*. Detecta las variaciones de voltaje de entrada y las corrige solito para darte siempre un voltaje estable, generalmente en *115V ±7%*.

✅ Ideal para proteger equipos sensibles (computadores, aires, neveras, etc.) porque reacciona solo ante bajas y subidas de voltaje.

📌 *En resumen:*
• Elevador = manual, sube un % fijo
• Estabilizador = automático, mantiene el voltaje estable solo

¿Cuál necesitas tú? Con gusto te asesoramos. 😊`
    },

    // ─── TIEMPOS DE FABRICACIÓN ───────────────────────
    {
      keywords: ["cuanto se demora", "tiempo de fabricacion", "tiempo de fabricación",
                  "cuanto tarda", "demora", "plazo de entrega", "dias",
                  "cuantos dias", "cuándo está", "cuando esta",
                  "que tiempo", "en cuanto tiempo"],
      priority: 5,
      response: `⏱ *Tiempos de fabricación*

Trabajamos sobre pedido. Los plazos aproximados son:

• *Elevadores y Estabilizadores (E/E)* menores a 12kVA:
  → **3 a 5 días hábiles** ⚡

• *Equipos de mayor capacidad (>12kVA):*
  → Consultar plazo según especificaciones

• *Reparaciones en general:*
  → 3 a 7 días hábiles según la complejidad 🔧

¿Qué capacidad necesitas? Te confirmamos el tiempo exacto en la cotización, {nombre}. 😊`
    },

    // ─── PROCESO DE COMPRA ────────────────────────────
    {
      keywords: ["proceso", "como comprar", "cómo comprar", "como hago",
                  "comprar", "quiero comprar", "pedido", "encargo",
                  "cómo funciona", "como funciona"],
      priority: 5,
      response: `📋 *Nuestro proceso de trabajo*

1️⃣ *Consulta* — Nos dices qué necesitas (equipo, capacidad, uso)
2️⃣ *Cotización* — Te enviamos precio y plazo sin compromiso
3️⃣ *Fabricación* — Confirmado el pedido con el *50% de depósito*, iniciamos la fabricación
4️⃣ *Entrega* — Coordinamos la entrega y cancelas el *50% restante contra entrega*

¿Qué necesitas cotizar, {nombre}? 😊`
    },

    // ─── GARANTÍA ─────────────────────────────────────
    {
      keywords: ["garantia", "garantía"],
      priority: 5,
      response: `🛡️ *Garantía*

Todos nuestros equipos cuentan con la garantía estándar de fábrica según las políticas del fabricante.

 Cubre defectos de fabricación. No cubre maltrato, sobrecargas externas, instalación incorrecta o uso inadecuado.

¿Tienes alguna duda específica sobre garantía, {nombre}?`
    },

    // ─── ENVÍOS / COBERTURA ──────────────────────────
    {
      keywords: ["envio", "envío", "envian", "envían", "enviamos",
                 "cobertura", "a donde", "hasta donde", "otra ciudad",
                 "fuera de barranquilla", "costa", "domicilio",
                 "hacen envíos", "envio nacional", "a todo el pais",
                 "envian a otra ciudad"],
      priority: 5,
      response: `📦 *Envíos*

Sí realizamos envíos a nivel nacional. El costo del envío *no está incluido* y corre por cuenta del cliente.

Te podemos asesorar con la empresa de transporte y coordinar el despacho desde nuestro taller en Barranquilla.

¿A qué ciudad te enviamos, {nombre}? 😊`
    },

    // ─── FORMAS DE PAGO ──────────────────────────────
    {
      keywords: ["pago", "pagar", "forma de pago", "metodo de pago",
                 "método de pago", "transferencia", "efectivo",
                 "bancolombia", "davivienda", "consignacion",
                 "consignación"],
      priority: 5,
      response: `💰 *Formas de pago*

• Transferencia bancaria (Bancolombia, Davivienda)
• Efectivo (en nuestras instalaciones)

📌 *Condiciones:*
• 50% de depósito para iniciar la fabricación
• 50% contra entrega

¿Te sirve alguna de estas opciones, {nombre}?`
    },

    // ─── UBICACIÓN / TALLER ──────────────────────────
    {
      keywords: ["donde quedan", "donde quedan", "direccion", "dirección",
                 "ubicacion", "ubicación", "estan ubicados", "está ubicado",
                 "taller", "local", "oficina", "barranquilla"],
      priority: 5,
      response: `📍 *HTK INGENIERIA*

Estamos ubicados en *Barranquilla* (Atlántico, Colombia).

Si necesitas la dirección exacta o coordenadas para recibir tu equipo en el taller, escríbenos y te la enviamos. 😊`
    },

    // ─── PRECIOS (remite a cotización) ────────────────
    {
      keywords: ["precio", "precios", "cuanto cuesta", "cuánto cuesta",
                 "cuanto vale", "cuánto vale", "valor", "costos",
                 "costo", "cotizacion", "cotización", "cotizar",
                 "lista de precios", "tarifas"],
      priority: 5,
      response: `💰 *Precios*

Manejamos precios según el tipo de equipo y capacidad. La mejor forma de darte un precio exacto es con una cotización personalizada.

Los precios de E/E (Elevadores/Estabilizadores) varían según la potencia y características.

📌 *Para una cotización exacta, cuéntanos:*
• ¿Qué equipo necesitas (elevador o estabilizador)?
• ¿Qué capacidad en kVA?
• ¿Para qué uso?

Y te enviamos el precio detallado sin compromiso. 😊`
    },
  ],
};
