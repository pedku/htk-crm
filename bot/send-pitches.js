// send-pitches.js — Enviar propuestas a leads HTK vía API del bot
// Orden: A/A → Electrónica → Plásticos → Cargadores
// node send-pitches.js [--dry-run]

const http = require("http");
const fs = require("fs");
const path = require("path");

const API_URL = "http://localhost:18802/send";
const DRY_RUN = process.argv.includes("--dry-run");

const LEADS_PATH = "/home/peku/.openclaw/workspace/data/leads.json";
const SCRAPED_PATH = "/home/peku/.openclaw/workspace/data/scraped_contacts.json";

// ─── PITCHES POR SEGMENTO ──────────────────────────
const PITCHES = {
  "Taller A/A": `Buenos días, ¿cómo está?

Soy Pedro Castro, ingeniero, de HTK INGENIERÍA en Barranquilla.

Le comento por qué le escribo: usted recibe aires todo el tiempo y estoy seguro de que en más de una ocasión le ha llegado uno con la tarjeta electrónica dañada — un inversor, un mini-split, un VRF — y conseguir esa tarjeta o repararla no es fácil.

Justo ahí podemos ayudarle. Nosotros nos encargamos de esas tarjetas, las revisamos sin costo y si tienen reparación, le damos respuesta en el menor tiempo posible. Tenemos experiencia trabajando con este tipo de equipos a nivel electrónico.

Cuente con nosotros para eso, ¿qué le parece?`,

  "Taller Electrónica": `Buenos días, ¿cómo está?

Soy Pedro Castro, ingeniero, de HTK INGENIERÍA en Barranquilla.

Le escribo porque he visto su trabajo en reparación electrónica y creo que podemos ser un buen aliado para usted.

La idea es la siguiente: de vez en cuando llegan trabajos que requieren un perfil distinto — electrónica industrial, control, automatización — que no es exactamente lo mismo que la reparación de equipos de consumo. Y viceversa: a nosotros nos llegan trabajos que tal vez encajan mejor en su taller.

La propuesta es simple: tener una relación de colegas donde usted me refiere lo industrial y yo le refiero lo que sea más de su perfil. Todos ganan — usted, nosotros y, sobre todo, el cliente que queda bien atendido.

¿Le interesa la idea de tener un aliado para ese tipo de trabajos?`,

  "Fábrica Plásticos": `Buenos días, ¿cómo está?

Soy Pedro Castro, ingeniero, de HTK INGENIERÍA en Barranquilla.

Le escribo porque usted tiene máquinas con control electrónico en producción — PLCs, variadores, tarjetas de control — y cuando una de esas falla, cada hora que pasa representa una pérdida en productividad.

Nosotros ayudamos a que eso no se extienda. Reparamos componentes electrónicos industriales con respuesta ágil, para que una tarjeta dañada no les pare la producción por días. Tenemos experiencia trabajando con este tipo de equipos.

El objetivo es simple: ayudarlos a mantener su operación y reducir el impacto de las fallas electrónicas en su negocio.

¿Ha tenido alguna situación donde una tarjeta se daña y no consigue quién la repare a tiempo?`,

  "Distribuidor Cargadores": `Buenos días, ¿cómo está?

Soy Pedro Castro, ingeniero, de HTK INGENIERÍA en Barranquilla.

Le escribo porque veo que usted comercializa cargadores para vehículos eléctricos y quiero proponerle algo.

Usted vende el equipo, nosotros instalamos. Trabajamos como su brazo técnico en Barranquilla y la Costa: hacemos la visita, la instalación, la puesta en marcha y le garantizamos al cliente final una experiencia completa.

El beneficio para usted es claro: puede ofrecer un servicio llave en mano sin tener que montar un equipo de instalación propio. El cliente compra el cargador con usted y nosotros nos encargamos de que quede funcionando correctamente.

¿Le interesaría conversar para alinear cómo podemos trabajar juntos?`,
};

// ─── MAPEO MANUAL LEAD → SEGMENTO (preciso, no inferencia) ──
const SEGMENTOS = {
  // Taller A/A
  "PRO-003": "Taller A/A",    // Climatek — solo email
  "PRO-004": "Taller A/A",    // S. Ing. Refrigeración
  "PRO-005": "Taller A/A",    // Génesis Electric
  "PRO-006": "Taller A/A",    // Serviquilla
  "PRO-011": "Taller A/A",    // Tu Aire Barranquilla
  "PRO-012": "Taller A/A",    // S. Técnico del Caribe
  // Taller Electrónica
  "PRO-001": "Taller Electrónica",
  "PRO-002": "Taller Electrónica",
  "PRO-013": "Taller Electrónica", // Industrias Fimet
  // Fábrica Plásticos
  "PRO-007": "Fábrica Plásticos",
  "PRO-008": "Fábrica Plásticos",
  "PRO-009": "Fábrica Plásticos",
  "PRO-010": "Fábrica Plásticos",
  "PRO-014": "Fábrica Plásticos",
  "PRO-015": "Fábrica Plásticos",
  "PRO-016": "Fábrica Plásticos",
  // Distribuidor Cargadores
  "PRO-017": "Distribuidor Cargadores",
  "PRO-018": "Distribuidor Cargadores",
  "PRO-019": "Distribuidor Cargadores",
  "PRO-020": "Distribuidor Cargadores",
  "PRO-021": "Distribuidor Cargadores",
  "PRO-022": "Distribuidor Cargadores",
  "PRO-023": "Distribuidor Cargadores",
  "PRO-024": "Distribuidor Cargadores",
  "PRO-025": "Distribuidor Cargadores",
  "PRO-026": "Distribuidor Cargadores",
};

// ─── ORDEN DE ENVÍO ─────────────────────────────────
const ORDEN_SEGMENTOS = ["Taller A/A", "Taller Electrónica", "Fábrica Plásticos", "Distribuidor Cargadores"];

// ─── TELÉFONOS CONOCIDOS (originales + scrape) ────
const TELEFONOS = {
  "PRO-002": "573157250684",   // Taller Electrónico (original)
  "PRO-018": "573227732297",   // Cargadores VE Colombia (original)
  "PRO-019": "573041253163",   // Colombia EV (original)
  "PRO-020": "573235837210",   // Ecorepost (original)
  "PRO-021": "573332382149",   // e-Charge Colombia (original)
  "PRO-022": "573052266777",   // EVectric (original)
  "PRO-023": "573113128984",   // Ecocharge Colombia (original)
  "PRO-024": "573244219837",   // Emergente Colombia (original)
  // Scrapeados
  "PRO-004": "573106467495",   // S. Ing. Refrigeración
  "PRO-006": "573235549393",   // Serviquilla
  "PRO-007": "573106745251",   // Inyectoplast
  "PRO-008": "573145389722",   // Plastiatlantico
  "PRO-009": "573009128638",   // Plásticos Truher
  "PRO-010": "573226221680",   // Plastix Colombia
  "PRO-012": "573150477045",   // S. Técnico del Caribe
  "PRO-016": "573005651353",   // Plásticos JR
  "PRO-017": "573157541244",   // Electrolineras
  "PRO-026": "573135498875",   // Inprosolar
};

// ─── ENVIAR VÍA API DEL BOT ─────────────────────────
function enviarMensaje(numero, texto) {
  return new Promise((resolve, reject) => {
    const fullNumber = `${numero}@c.us`;
    const data = JSON.stringify({ to: fullNumber, message: texto });

    const req = http.request({
      hostname: "localhost",
      port: 18802,
      path: "/send",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
      timeout: 60000,
    }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ ok: false, error: body }); }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(data);
    req.end();
  });
}

// ─── MAIN ────────────────────────────────────────────
async function main() {
  const leads = JSON.parse(fs.readFileSync(LEADS_PATH, "utf-8"));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📤 ENVÍO DE PROPUESTAS HTK");
  console.log(DRY_RUN ? "🔍 MODO: Dry-run" : "🚀 MODO: Envío real");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Armar cola de envío en orden
  let cola = [];
  for (const seg of ORDEN_SEGMENTOS) {
    for (const [lid, seg2] of Object.entries(SEGMENTOS)) {
      if (seg2 !== seg) continue;
      const telefono = TELEFONOS[lid];
      if (!telefono) continue;
      const lead = leads.find(l => l.id === lid);
      if (!lead) continue;
      cola.push({
        id: lid,
        nombre: lead.nombre,
        segmento: seg,
        telefono,
        pitch: PITCHES[seg],
      });
    }
  }

  console.log(`📊 Total a enviar: ${cola.length} leads\n`);

  // Mostrar plan
  let lastSeg = "";
  for (const item of cola) {
    if (item.segmento !== lastSeg) {
      console.log(`── ${item.segmento} ──`);
      lastSeg = item.segmento;
    }
    console.log(`  ${item.id} | ${item.nombre} → ${item.telefono}`);
  }

  if (DRY_RUN) {
    console.log("\n🔍 Dry-run. Ejecuta sin --dry-run para enviar.");
    return;
  }

  // ─── ENVIAR ───────────────────────────────────
  console.log("\n🚀 Enviando...\n");

  let ok = 0, err = 0;
  for (let i = 0; i < cola.length; i++) {
    const item = cola[i];
    const pct = `[${i + 1}/${cola.length}]`;
    console.log(`${pct} ${item.id} ${item.nombre} → ${item.telefono}...`);

    try {
      const res = await enviarMensaje(item.telefono, item.pitch);
      if (res.ok) {
        console.log(`  ✅ Enviado`);
        ok++;
      } else {
        console.log(`  ❌ ${res.error || "falló"}`);
        err++;
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
      err++;
    }

    // Pausa entre mensajes (5-10s)
    if (i < cola.length - 1) {
      const espera = 5000 + Math.random() * 5000;
      process.stdout.write(`  ⏳ esperando ${Math.round(espera / 1000)}s...`);
      await new Promise(r => setTimeout(r, espera));
      console.log(" listo");
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📊 RESULTADO: ✅ ${ok} enviados | ❌ ${err} fallos`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(console.error);
