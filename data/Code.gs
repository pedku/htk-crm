/**
 * HTK INGENIERIA — Webhook para Leads
 * 
 * CÓMO INSTALAR:
 * 1. Abre tu Sheets → Extensions → Apps Script
 * 2. Copia y pega TODO este código
 * 3. Dale "Guardar" → "Implementar" → "Nueva implementación"
 * 4. Tipo: "Aplicación web"
 * 5. Acceso: "Cualquier usuario" (público)
 * 6. Dale "Implementar" y copia la URL que te da
 * 7. Pásame esa URL para conectar el bot
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const leadsSheet = sheet.getSheetByName("👥 Leads") || sheet.insertSheet("👥 Leads");
    
    // Asegurar encabezados si está vacía
    if (leadsSheet.getLastRow() === 0) {
      leadsSheet.appendRow(["Fecha", "Teléfono", "Nombre", "Canal", "Opción", "Detalle", "Atendido"]);
    }
    
    // Agregar el lead
    leadsSheet.appendRow([
      data.fecha || new Date().toISOString(),
      data.numero || "",
      data.nombre || "",
      data.canal || "WhatsApp",
      data.opcion || "",
      data.detalle || "",
      "NO"
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput("✅ HTK Bot — Webhook activo")
    .setMimeType(ContentService.MimeType.TEXT);
}
