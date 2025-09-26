const axios = require('axios');

class OllamaService {
  constructor() {
    this.baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.conversations = new Map(); // Almacena el contexto por usuario
    this.awaitingConfirmationCode = new Map(); // Usuarios que están esperando proporcionar código
  }

  // Cargar conversaciones desde archivo local
  loadConversations() {
    try {
      const fs = require('fs');
      if (fs.existsSync('conversations.json')) {
        const data = fs.readFileSync('conversations.json', 'utf8');
        const parsed = JSON.parse(data);
        this.conversations = new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.error('Error cargando conversaciones:', error);
    }
  }

  // Guardar conversaciones en archivo local
  saveConversations() {
    try {
      const fs = require('fs');
      const obj = Object.fromEntries(this.conversations);
      fs.writeFileSync('conversations.json', JSON.stringify(obj, null, 2));
    } catch (error) {
      console.error('Error guardando conversaciones:', error);
    }
  }

  // Agregar mensaje al contexto del usuario
  addMessageToContext(phone, message, isUser = true) {
    if (!this.conversations.has(phone)) {
      this.conversations.set(phone, []);
    }
    
    const context = this.conversations.get(phone);
    context.push({
      role: isUser ? 'user' : 'assistant',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Mantener solo los últimos 10 mensajes para no saturar el contexto
    if (context.length > 10) {
      this.conversations.set(phone, context.slice(-10));
    }

    this.saveConversations();
  }

  // Obtener contexto del usuario
  getContext(phone) {
    return this.conversations.get(phone) || [];
  }

  // Marcar que estamos esperando un código de confirmación
  setAwaitingConfirmationCode(phone, isAwaiting = true) {
    if (isAwaiting) {
      this.awaitingConfirmationCode.set(phone, true);
    } else {
      this.awaitingConfirmationCode.delete(phone);
    }
  }

  // Verificar si estamos esperando un código de confirmación
  isAwaitingConfirmationCode(phone) {
    return this.awaitingConfirmationCode.has(phone);
  }

  // Función para limpiar el contenido entre <think> y </think>
  cleanThinkTags(text) {
    if (!text) return text;
    
    // Eliminar contenido entre <think> y </think> incluyendo las etiquetas
    const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    // Si después de limpiar queda vacío, devolver un mensaje por defecto
    if (!cleanedText) {
      return 'Entiendo tu pregunta. ¿En qué más puedo ayudarte?';
    }
    
    return cleanedText;
  }

  // Detectar si el usuario está preguntando sobre el estado de su lavado
  isAskingAboutWashStatus(message) {
    const washStatusKeywords = [
      'proceso', 'lavado', 'vehículo', 'carro', 'auto', 'terminaron', 'listo',
      'cuándo', 'cuando', 'pasar a buscar', 'recoger', 'estado', 'cómo va',
      'como va', 'avance', 'progress', 'listo', 'terminado', 'finalizado',
      'listo mi carro', 'listo mi auto', 'listo el vehículo', 'puedo buscar',
      'está listo', 'esta listo', 'ya terminaron', 'cuando lo tengo',
      'mi vehiculo', 'mi carro', 'mi auto', 'está mi carro', 'esta mi carro'
    ];

    const messageLower = message.toLowerCase();
    return washStatusKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Verificar si un texto parece un código de confirmación
  looksLikeConfirmationCode(text) {
    // Patrón para códigos como AC40686909Z3HM (AC + 12 caracteres alfanuméricos)
    const confirmationPattern = /^AC[A-Z0-9]{12}$/i;
    // También aceptar sin el AC (12 caracteres alfanuméricos)
    const shortPattern = /^[A-Z0-9]{12}$/i;
    
    return confirmationPattern.test(text.toUpperCase()) || 
           shortPattern.test(text.toUpperCase());
  }

  // Generar prompt con información de la empresa
  async generatePrompt(userMessage, companyInfo, washPackages, userContext, isAwaitingCode = false) {
    const contextMessages = userContext.map(msg => 
      `${msg.role}: ${msg.content}`
    ).join('\n');

    const packagesInfo = washPackages.map(pkg => 
      `- ${pkg.name}: ${pkg.description}. Precios: Pequeño: $${pkg.prices.small}, Mediano: $${pkg.prices.medium}, Grande: $${pkg.prices.large}`
    ).join('\n');

    let instructions = `Eres un asistente virtual de Auto Clinic RD, una empresa especializada en detailing y car wash. Responde de manera amable, humana y concisa.

INFORMACIÓN DE LA EMPRESA:
- Nombre: ${companyInfo.name}
- Descripción: ${companyInfo.description}
- Servicios: ${companyInfo.services.join(', ')}
- Horarios: Lunes a Viernes ${companyInfo.hours.monday}, Sábado ${companyInfo.hours.saturday}, Domingo ${companyInfo.hours.sunday}
- Contacto: ${companyInfo.contact.phone} | ${companyInfo.contact.email}
- Dirección: ${companyInfo.location.address}, ${companyInfo.location.city}

PAQUETES DISPONIBLES:
${packagesInfo}

CONTEXTO PREVIO:
${contextMessages}

INSTRUCCIONES:`;

    if (isAwaitingCode) {
      instructions += `
- El usuario está proporcionando un código de confirmación para consultar el estado de su lavado
- Si el código es válido, muestra la información de la reservación
- Si el código no es válido, pide que lo verifique e intente nuevamente
- Los códigos de confirmación tienen el formato AC40686909Z3HM (AC + 12 caracteres)`;
    } else if (this.isAskingAboutWashStatus(userMessage)) {
      instructions += `
- El usuario está preguntando sobre el estado/proceso de lavado de su vehículo
- Debes pedirle el código de confirmación que recibió al hacer la reserva
- No intentes adivinar el estado sin el código
- Pide amablemente el código de confirmación`;
    } else {
      instructions += `
- Sé amable, empático y profesional
- Responde de forma natural y humana
- Sé conciso, no des información innecesaria
- Si preguntan por reservaciones o estado de lavado, pide el código de confirmación
- Para crear reservaciones, dirige al portal web
- Si no sabes algo, sugiere contactar un representante humano`;
    }

    instructions += `
- Responde directamente sin usar etiquetas XML como <think> o <response>

Usuario: ${userMessage}

Asistente:`;

    return instructions;
  }

  // Generar respuesta para solicitud de código de confirmación
  generateConfirmationCodeRequest() {
    return `🔍 *Consulta de Estado de Lavado*

Para verificar el estado de lavado de tu vehículo, necesito tu *código de confirmación*.

Este código lo recibiste cuando agendaste tu cita y tiene el formato: *AC40686909Z3HM*

*Por favor, escribe tu código de confirmación:*`;
  }

  // Generar respuesta usando Ollama
  async generateResponse(phone, userMessage, companyInfo, washPackages) {
    try {
      const userContext = this.getContext(phone);
      
      // Si estamos esperando un código de confirmación
      if (this.isAwaitingConfirmationCode(phone)) {
        this.setAwaitingConfirmationCode(phone, false);
        
        // Si es un código de confirmación, dejar que el bot principal lo maneje
        if (this.looksLikeConfirmationCode(userMessage)) {
          // El bot principal se encargará de consultar la base de datos
          return `PROCESAR_CODIGO:${userMessage.toUpperCase()}`;
        } else {
          // Si no es un código válido, pedirlo nuevamente
          this.setAwaitingConfirmationCode(phone, true);
          return `❌ El formato no parece ser un código de confirmación válido. Los códigos tienen el formato: *AC40686909Z3HM* (12 caracteres después de AC)

*Por favor, escribe tu código de confirmación nuevamente:*`;
        }
      }

      // Si el usuario está preguntando sobre el estado del lavado
      if (this.isAskingAboutWashStatus(userMessage)) {
        this.setAwaitingConfirmationCode(phone, true);
        return this.generateConfirmationCodeRequest();
      }

      // Si el usuario envía directamente un código de confirmación
      if (this.looksLikeConfirmationCode(userMessage)) {
        return `PROCESAR_CODIGO:${userMessage.toUpperCase()}`;
      }

      // Generar respuesta normal con Ollama
      const isAwaitingCode = this.isAwaitingConfirmationCode(phone);
      const prompt = await this.generatePrompt(userMessage, companyInfo, washPackages, userContext, isAwaitingCode);

      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: 'deepseek-r1:latest',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 500
        }
      });

      let responseText = response.data.response.trim();
      
      // Limpiar etiquetas <think> del texto de respuesta
      responseText = this.cleanThinkTags(responseText);
      
      // Agregar respuesta al contexto
      this.addMessageToContext(phone, responseText, false);
      
      return responseText;
    } catch (error) {
      console.error('Error con Ollama:', error);
      return 'Lo siento, estoy teniendo dificultades técnicas. Por favor, intenta nuevamente o contacta a un representante humano.';
    }
  }
}

module.exports = new OllamaService();