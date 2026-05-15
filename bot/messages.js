// messages.js — Mensajes predefinidos del bot HTK
// ⚠️ Edita solo los textos entre comillas, no las claves.
// Usa {nombre} para que el bot lo reemplace por el nombre del contacto.

module.exports = {
  // ─── PRIMER CONTACTO ───────────────────────────────
  presentacion: `🔧 *HTK INGENIERIA* ⚡ — Barranquilla

¡Hola! Soy el asistente virtual de HTK. 🙌

Por favor, **escribe tu nombre** para continuar. 😊`,

  bienvenida: `🔧 *HTK INGENIERIA* ⚡ — Barranquilla

¡Hola, {nombre}! Somos una empresa de ingeniería con experiencia en soluciones eléctricas, electrónicas e industriales.

¿En qué podemos ayudarte?

1️⃣ 🔧 *Reparación de equipos electrónicos*
→ Electrodomésticos, aires acondicionados, tarjetas, fuentes, pantallas

2️⃣ ⚡ *Elevadores de voltaje y Estabilizadores (E/E)*
→ Fabricación, venta y reparación. Desde 3 a 5 días hábiles

3️⃣ ⚙️ *Automatización industrial*
→ PLC, tableros de control, sensórica, SCADA

4️⃣ 🚗 *Cargadores para vehículos eléctricos*
→ Instalación en hogar, empresa o conjunto

5️⃣ 📡 *Monitoreo IoT*
→ Sensores remotos, temperatura, energía, alarmas

6️⃣ 🛠️ *Otra consulta*
→ Cuéntanos qué necesitas

Responde con el *número* de la opción que necesites. 😊`,

  // ─── REINTENTO ─────────────────────────────────────
  reintento: `🙌 ¿Necesitas algo más, {nombre}?

1️⃣ Reparación de equipos
2️⃣ Elevadores y Estabilizadores
3️⃣ Automatización
4️⃣ Cargadores eléctricos
5️⃣ Monitoreo IoT
6️⃣ Otra consulta`,

  // ─── SUBMENÚ: ELEVADORES Y ESTABILIZADORES ────────
  submenu_elev_estab: `⚡ *Elevadores de Voltaje y Estabilizadores (E/E) HTK*

*⏱ Plazo:* Menores a 12kVA en solo 3 a 5 días hábiles

Elige una subopción:

1️⃣ 🛗 *Elevador de voltaje (manual)*
Sube el voltaje mediante cambios manuales de devanados
• Residencial • Comercial • Industrial

2️⃣ 🔌 *Estabilizador / Regulador (automático)*
Mantiene el voltaje estable en 115V ±7% automáticamente
• Residencial • Comercial • Industrial

Responde con el *número* para más información.`,

  // ─── SUB-OPCIÓN 1: ELEVADORES ─────────────────────
  elevadores: `⚡ *Elevadores de Voltaje HTK (manual)*

Fabricamos elevadores de voltaje que te permiten subir el voltaje de entrada mediante cambios manuales en los devanados.

✅ *Usos comunes:*
• Viviendas con voltaje bajo 🏠
• Locales comerciales 🏪
• Talleres y bodegas 🏭

✅ *Por qué elegir un elevador:*
• Solución económica para voltaje bajo constante
• Operación manual sencilla
• Fabricación a medida según tu necesidad

✅ *También reparamos* elevadores de cualquier marca.

*Plazo de fabricación:* E/E menores a 12kVA en solo **3 a 5 días hábiles** ⏱

¿Qué capacidad necesitas, {nombre}? Te asesoramos sin compromiso. 📞`,

  // ─── SUB-OPCIÓN 2: ESTABILIZADORES ────────────────
  estabilizadores: `🔌 *Estabilizadores y Reguladores HTK*

Fabricamos estabilizadores/reguladores de voltaje para toda aplicación:

✅ *Capacidades:*
• Residenciales: 3kVA — 15kVA 🏠
• Comerciales: 15kVA — 50kVA 🏢
• Industriales: 50kVA en adelante 🏭

✅ *Características:*
• Monofásicos y trifásicos
• Con o sin tablero de distribución
• Protección contra sobretensión y picos
• Diseño compacto y eficiente

✅ *También reparamos* estabilizadores de cualquier marca.

¿Qué capacidad necesitas, {nombre}? Te enviamos una cotización personalizada. 💰`,

  // ─── OPCIÓN 1: REPARACIÓN ──────────────────────────
  reparacion_equipos: `🔧 *Reparación de equipos electrónicos*

Recibimos equipos para diagnóstico *sin costo* ✅

Trabajamos con:
• Electrodomésticos en general 🏠
• Aires acondicionados (residenciales e inverter) ❄️
• Tarjetas electrónicas y fuentes conmutadas
• Pantallas y monitores 📺
• Equipos de audio y video 🎵
• Herramientas eléctricas 🔨

📍 Recibimos equipos en nuestro taller en Barranquilla

Para agilizar tu atención, {nombre}, ¿puedes compartirnos?
• ¿Qué equipo tienes?
• ¿Qué falla presenta?
• Una foto del equipo si es posible 📸

Un técnico revisará tu caso y te dará respuesta.`,

  // ─── OPCIÓN 3: AUTOMATIZACIÓN ──────────────────────
  automatizacion: `⚙️ *Automatización Industrial*

Diseñamos e implementamos soluciones a la medida:

• Programación de PLC (Siemens, Allen-Bradley, Delta, etc.)
• Desarrollo de SCADA y HMI
• Tableros de control y fuerza
• Sensórica industrial (temperatura, presión, nivel, flujo)
• Variadores de velocidad y arrancadores suaves
• Redes industriales (Modbus, Profibus, Ethernet/IP)

✅ *Sectores:* Industrial, comercial, agrícola, petróleo y gas

Un ingeniero se comunicará contigo, {nombre}, para conocer tu proyecto y darte la mejor solución. 📞`,

  // ─── OPCIÓN 4: CARGADORES ELÉCTRICOS ──────────────
  cargadores: `🚗⚡ *Cargadores para Vehículos Eléctricos*

Instalamos cargadores en:
• Hogares 🏠
• Empresas 🏢
• Conjuntos residenciales 🏘️
• Locales comerciales 🏪

✅ *Servicios:*
• Asesoría técnica sin costo
• Instalación profesional certificada
• Cargadores Nivel 1 y Nivel 2
• Mantenimiento de equipos existentes

📍 Servicio en Barranquilla y toda la Costa Caribe.

¿Tienes vehículo eléctrico o planeas adquirir uno, {nombre}? Te ayudamos a elegir la mejor opción. ⚡`,

  // ─── OPCIÓN 5: IoT ─────────────────────────────────
  iot: `📡 *Monitoreo IoT — Control desde cualquier lugar*

Ofrecemos soluciones de monitoreo remoto para:

• Temperatura y humedad 🌡️
• Presión
• Nivel de tanques y silos
• Consumo de energía ⚡
• Corriente y voltaje
• Alarmas y notificaciones en tiempo real 📱
• Control de bombas y motores

✅ *Ventajas:*
• Dashboard web 24/7
• Alertas por WhatsApp y correo
• Históricos y reportes
• Fácil instalación

¿Qué necesitas monitorear, {nombre}? Te presentamos una solución a la medida. 📊`,

  // ─── OPCIÓN 6: OTRA CONSULTA ───────────────────────
  otra_consulta: `📝 *Cuéntanos más, {nombre}*

Escríbenos tu consulta y un ingeniero te responderá a la brevedad.

Mientras tanto, si necesitas orientación rápida, puedes elegir una opción del menú principal. 😊`,

  // ─── DERIVACIÓN A INGENIERO ────────────────────────
  derivar_ingeniero: `🙌 ¡Gracias, {nombre}!

Hemos registrado tu solicitud. Un ingeniero de *HTK INGENIERIA* se comunicará contigo pronto.

⏱ *Tiempo estimado:* En horario laboral respondemos en menos de 2 horas.

Si es urgente, responde "URGENTE" y le daremos prioridad. 🚨`,

  // ─── FUERA DE HORARIO ──────────────────────────────
  fuera_horario: `🕐 *Gracias por escribirnos, {nombre}*

Nuestro horario de atención es:
• Lunes a Viernes: 8:00 AM — 6:00 PM
• Sábados: 8:00 AM — 1:00 PM

Hemos recibido tu mensaje y te atenderemos en cuanto retomemos labores. 😊`,

  // ─── URGENCIA ──────────────────────────────────────
  urgente_recibido: `🚨 *Urgencia registrada, {nombre}*

Hemos marcado tu caso como prioritario. Un ingeniero te contactará lo antes posible.`,

  // ─── DESPEDIDA ─────────────────────────────────────
  despedida: `✅ Quedamos atentos, {nombre}. Si necesitas algo más, no dudes en escribirnos.

*HTK INGENIERIA* 🔧⚡ — Soluciones en ingeniería de confianza.`,

  // ─── RESPUESTA POR DEFECTO ─────────────────────────
  default: `🙌 Gracias por escribirnos, {nombre}. Elige una opción del menú o cuéntanos qué necesitas y te orientamos. 😊`,
};
