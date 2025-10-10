const axios = require('axios');
const firebaseService = require('./firebaseService');

class GeminiService {
  constructor() {
    this.apiKey = "AIzaSyAggwqs331SU_SpEiMsZU5DzPWptpAFdVY";
    this.modelId = 'gemini-2.0-flash';
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async generateResponse(phone, userMessage, userName = null) {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phone);
      
      // Verificar si está pausado para humano
      const isPaused = await firebaseService.isChatPaused(normalizedPhone);
      if (isPaused) {
        return null;
      }

      // Obtener datos
      const [companyInfo, conversationHistory] = await Promise.all([
        firebaseService.getCompanyInfo(),
        firebaseService.getConversationHistory(normalizedPhone, 10)
      ]);

      const prompt = this.buildPrompt(
        userMessage, 
        companyInfo, 
        conversationHistory, 
        normalizedPhone,
        userName
      );

      const response = await this.callGeminiAPI(prompt);

      // Guardar conversación
      await firebaseService.saveConversation(normalizedPhone, userMessage, true, userName);
      await firebaseService.saveConversation(normalizedPhone, response, false);

      return response;

    } catch (error) {
      console.error('Error en Gemini:', error);
      return '❌ Lo siento, estoy teniendo dificultades para responder. Por favor, intenta nuevamente.';
    }
  }

  async generateResponseWithContext(phone, contextMessage, userName = null) {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phone);
      
      // Verificar si está pausado para humano
      const isPaused = await firebaseService.isChatPaused(normalizedPhone);
      if (isPaused) {
        return null;
      }

      // Obtener historial de conversación
      const conversationHistory = await firebaseService.getConversationHistory(normalizedPhone, 15);

      const prompt = this.buildAlexaPrompt(contextMessage, conversationHistory, userName);

      const response = await this.callGeminiAPI(prompt);

      // Extraer el mensaje original del usuario del contexto
      const userMessage = contextMessage.split('MENSAJE DEL USUARIO: "')[1]?.split('"')[0] || 'Consulta general';
      
      // Guardar conversación
      await firebaseService.saveConversation(normalizedPhone, userMessage, true, userName);
      await firebaseService.saveConversation(normalizedPhone, response, false);

      return response;

    } catch (error) {
      console.error('Error en Gemini con contexto:', error);
      return '❌ Lo siento, estoy teniendo dificultades para responder. Por favor, intenta nuevamente.';
    }
  }

  buildPrompt(userMessage, companyInfo, conversationHistory, phone, userName) {
    
    const historyText = conversationHistory.map(msg => 
      `${msg.isUser ? (msg.userName || 'Usuario') : 'Alexa'}: ${msg.message}`
    ).join('\n');

    const userNameText = userName ? `, ${userName}` : '';

    return `Eres Alexa, la asistente especializada de Auto Clinic RD. Eres amable, profesional, experta en servicios de detailing y muy servicial.

INFORMACIÓN DE AUTO CLINIC RD:
${companyInfo?.name || 'Auto Clinic RD'}
${companyInfo?.description || 'Especialistas en detailing y car wash'}

UBICACIÓN:
${companyInfo?.location?.address || 'Av. Pdte. Antonio Guzmán Fernández 23, San Francisco de Macorís'}

CONTACTO: ${companyInfo?.contact?.phone || '809-244-0055'}

HORARIOS:
Lunes a Viernes: ${companyInfo?.hours?.monday || '8:00 AM - 6:00 PM'}
Sábado: ${companyInfo?.hours?.saturday || '8:00 AM - 5:00 PM'}
Domingo: ${companyInfo?.hours?.sunday || '9:00 AM - 3:00 PM'}

SERVICIOS PRINCIPALES:
${companyInfo?.services?.join(', ') || 'Lavado detallado, Ceramic Pro, PPF, Lavado de interiores, Laminados, Brillado, Diagnósticos, Mantenimiento preventivo'}

INSTRUCCIONES IMPORTANTES:

1. IDENTIDAD: Eres Alexa, especialista de Auto Clinic RD. NUNCA digas que eres IA.

2. ENFOQUE: Eres experta en servicios de detailing, lavado y cuidado automotriz.

3. CONVERSACIÓN NATURAL: Mantén un tono conversacional y amable.

4. INFORMACIÓN PRECISA: Proporciona detalles específicos sobre servicios, procesos, beneficios.

5. RECOMENDACIONES: Ofrece recomendaciones basadas en el tipo de vehículo y necesidades.

6. PREGUNTAS: Haz preguntas claras para entender mejor las necesidades del cliente.

7. LENGUAJE: Usa emojis apropiados 🚗💦✨ pero mantén profesionalismo.

8. NO menciones que estás en un modo de conversación especial.

HISTORIAL RECIENTE:
${historyText}

MENSAJE ACTUAL DEL USUARIO: "${userMessage}"
NOMBRE DEL CLIENTE: ${userName || 'No proporcionado'}

RESPONDE como Alexa (experta en detailing, natural y servicial):`;
  }

  buildAlexaPrompt(contextMessage, conversationHistory, userName) {
    const historyText = conversationHistory.map(msg => 
      `${msg.isUser ? (msg.userName || 'Usuario') : 'Alexa'}: ${msg.message}`
    ).join('\n');

    return `Eres Alexa, la asistente completa y experta de Auto Clinic RD. Tienes acceso a TODA la información de la empresa y puedes responder cualquier pregunta.

INSTRUCCIONES CRÍTICAS:

1. IDENTIDAD: Eres Alexa, especialista de Auto Clinic RD. NUNCA digas que eres IA.

2. INFORMACIÓN COMPLETA: Tienes acceso a toda la información de la empresa, servicios, combos, precios, reservaciones, menú, etc.

3. RESPUESTAS PRECISAS: Usa la información proporcionada para dar respuestas exactas.

4. CONVERSACIÓN NATURAL: Mantén un tono amable, profesional y conversacional.

5. RECOMENDACIONES: Ofrece recomendaciones basadas en la información disponible.

6. ACCIONES: Si el usuario quiere hacer una reservación, explícale el proceso o sugiere la opción 1.

7. CONSULTAS: Si pregunta por sus reservaciones, usa la información disponible.

8. LENGUAJE: Usa emojis apropiados pero mantén profesionalismo.

HISTORIAL DE CONVERSACIÓN:
${historyText}

INFORMACIÓN COMPLETA DE AUTO CLINIC RD:
${contextMessage}

RESPONDE como Alexa (usando toda la información disponible, de manera natural y servicial):`;
  }

  async callGeminiAPI(prompt) {
    try {
      const response = await axios.post(
        `${this.baseURL}/models/${this.modelId}:generateContent?key=${this.apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Error Gemini API:', error);
      throw error;
    }
  }

  // ⬇️⬇️⬇️ AGREGAR ESTE MÉTODO QUE FALTABA ⬇️⬇️⬇️
  normalizePhoneNumber(phone) {
    return phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '$1');
  }
}

module.exports = GeminiService;