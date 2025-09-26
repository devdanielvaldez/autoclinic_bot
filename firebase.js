const admin = require('firebase-admin');
const path = require('path');

// Configuración de Firebase
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: "googleapis.com"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://myride-v2-prod-default-rtdb.firebaseio.com"
});

const db = admin.firestore();

class FirebaseService {
  // Obtener información de la empresa
  async getCompanyInfo() {
    try {
      const doc = await db.collection('companyInfo').doc('autoclinic').get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Error obteniendo companyInfo:', error);
      return null;
    }
  }

  // Obtener paquetes de servicios
  async getWashPackages() {
    try {
      const snapshot = await db.collection('washPackages').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error obteniendo washPackages:', error);
      return [];
    }
  }

  // Función de normalización para códigos de confirmación
  normalizeConfirmationCode(text) {
    const upperText = text.toUpperCase().trim();
    
    // Si ya tiene formato AC, devolverlo tal cual
    if (upperText.startsWith('AC')) {
      return upperText;
    }
    
    // Si tiene 12 caracteres (como AC40686909Z3HM), agregar AC si falta
    if (upperText.length === 12 && !upperText.startsWith('AC')) {
      return 'AC' + upperText;
    }
    
    // Si tiene 14 caracteres con AC, devolver tal cual
    if (upperText.length === 14 && upperText.startsWith('AC')) {
      return upperText;
    }
    
    // Intentar extraer un código válido del texto (12 caracteres alfanuméricos)
    const codeMatch = upperText.match(/(AC)?([A-Z0-9]{12})/);
    if (codeMatch && codeMatch[2]) {
      return 'AC' + codeMatch[2];
    }
    
    return upperText;
  }

  // Consultar reservación por código (actualizada)
  async getBookingByConfirmationNumber(confirmationNumber) {
    try {
      const normalizedCode = this.normalizeConfirmationCode(confirmationNumber);
      console.log(`🔍 Buscando reservación con código: ${normalizedCode}`);
      
      const snapshot = await db.collection('washBookings')
        .where('confirmationNumber', '==', normalizedCode)
        .get();
      
      if (snapshot.empty) {
        console.log(`❌ No se encontró reservación con código: ${normalizedCode}`);
        return null;
      }
      
      const doc = snapshot.docs[0];
      const bookingData = { id: doc.id, ...doc.data() };
      console.log(`✅ Reservación encontrada: ${bookingData.customerName} - ${bookingData.status}`);
      return bookingData;
    } catch (error) {
      console.error('Error consultando reservación:', error);
      return null;
    }
  }

  // Crear nueva conversación
  async saveConversation(phone, message, isUser = true, timestamp = new Date()) {
    try {
      const conversationsRef = db.collection('whatsappConversations');
      await conversationsRef.add({
        phone,
        message,
        isUser,
        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error guardando conversación:', error);
    }
  }
}

module.exports = new FirebaseService();