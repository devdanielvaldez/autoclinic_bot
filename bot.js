const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const firebaseService = require('./firebase');
const ollamaService = require('./ollama-service');

// Cargar conversaciones al iniciar
ollamaService.loadConversations();

// Configuración del bot
const BOT_TOGGLE_WORD = process.env.BOT_TOGGLE_WORD || 'botoff';
const activeChats = new Set(); // Chats donde el bot está activo

class WhatsAppBot {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    this.companyInfo = null;
    this.washPackages = [];
    this.initializeBot();
  }

  async initializeBot() {
    // Cargar datos de Firebase
    await this.loadCompanyData();

    // Configurar eventos del cliente
    this.setupEventHandlers();

    // Inicializar cliente
    this.client.initialize();
  }

  async loadCompanyData() {
    try {
      this.companyInfo = await firebaseService.getCompanyInfo();
      this.washPackages = await firebaseService.getWashPackages();
      console.log('✅ Datos de la empresa cargados correctamente');
    } catch (error) {
      console.error('❌ Error cargando datos:', error);
    }
  }

  setupEventHandlers() {
    // Generar QR
    this.client.on('qr', (qr) => {
      console.log('🔍 Escanea este código QR con WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    // Cliente listo
    this.client.on('ready', () => {
      console.log('✅ Bot de WhatsApp conectado correctamente');
      console.log('🤖 Auto Clinic RD Bot está listo para recibir mensajes');
    });

    // Mensajes entrantes
    this.client.on('message', async (message) => {
        // console.log(message);
      await this.handleMessage(message);
    });

    // Manejar errores
    this.client.on('auth_failure', (msg) => {
      console.error('❌ Error de autenticación:', msg);
    });

    this.client.on('disconnected', (reason) => {
      console.log('❌ Cliente desconectado:', reason);
    });
  }

  async handleMessage(message) {
    // Ignorar mensajes del propio bot
    if (message.fromMe) return;

    const phone = message.from;
    const body = message.body.trim().toLowerCase();
    const hasMedia = message.hasMedia;

    // Guardar mensaje del usuario en Firebase
    await firebaseService.saveConversation(phone, body, true);

    // Verificar si es multimedia
    if (hasMedia) {
      console.log('📱 Mensaje multimedia recibido - Ignorando para respuesta humana');
      return;
    }

    // Verificar palabra de toggle
    if (body === BOT_TOGGLE_WORD) {
      await this.handleToggle(phone, message);
      return;
    }

    // Verificar si el bot está activo en este chat
    if (!activeChats.has(phone)) {
        console.log('esta inactivo')
      return; // No responder si el bot está desactivado
    }

    // Simular typing
    await this.simulateTyping(phone);

    // Procesar mensaje
    await this.processMessage(phone, body, message);
  }

  async handleToggle(phone, message) {
    if (activeChats.has(phone)) {
      activeChats.delete(phone);
      await message.reply('🤖 *Bot desactivado*\n\nEl bot ha sido desactivado. Escribe "*botoff*" nuevamente para reactivarlo.');
      console.log(`❌ Bot desactivado para: ${phone}`);
    } else {
      activeChats.add(phone);
      await this.sendWelcomeMessage(message);
      console.log(`✅ Bot activado para: ${phone}`);
    }
  }

  async simulateTyping(phone) {
    try {
      const chat = await this.client.getChatById(phone);
      await chat.sendStateTyping();
      
      // Simular tiempo de escritura (1-3 segundos)
      const typingTime = Math.random() * 2000 + 1000;
      await new Promise(resolve => setTimeout(resolve, typingTime));
    } catch (error) {
      console.error('Error simulando typing:', error);
    }
  }

  async processMessage(phone, body, message) {
    try {
      // Menú principal
      if (body === '1' || body.includes('reservacion') || body.includes('reserva')) {
        await this.handleCreateBooking(message);
      }
      else if (body === '2' || body.includes('estado') || body.includes('consultar')) {
        await this.handleCheckBooking(message);
      }
      else if (body === '3' || body.includes('servicio') || body.includes('paquete')) {
        await this.handleServices(message);
      }
      else if (body === '4' || body.includes('representante') || body.includes('humano')) {
        await this.handleRepresentative(message);
      }
      else if (body === '5' || body.includes('ubicacion') || body.includes('contacto')) {
        await this.handleLocation(message);
      }
      else if (body === 'menu' || body === 'help' || body === 'ayuda' || body === '0') {
        await this.sendMainMenu(message);
      }
      else {
        // Conversación con IA
        await this.handleAIConversation(phone, body, message);
      }
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      await message.reply('❌ Ocurrió un error al procesar tu mensaje. Por favor, intenta nuevamente.');
    }
  }

  async sendWelcomeMessage(message) {
    const welcomeMessage = `🚗 *Bienvenido a Auto Clinic RD* 🤖

¡Hola! Soy tu asistente virtual de Auto Clinic RD. Estoy aquí para ayudarte con:

*1. Crear Reservación* - Agenda tu servicio de detailing
*2. Consultar estado de mi reservación* - Revisa el estado de tu cita
*3. Consultar Servicios* - Conoce nuestros paquetes y precios
*4. Conversar con un representante* - Chatea con nuestra IA
*5. Ubicación y Contactos* - Encuéntranos fácilmente

*Escribe el número de la opción que deseas o tu pregunta directamente.*

📍 *Auto Clinic RD - Tu vehículo como nuevo*`;

    await message.reply(welcomeMessage);
  }

  async sendMainMenu(message) {
    const menuMessage = `📋 *Menú Principal - Auto Clinic RD*

Selecciona una opción:

*1. Crear Reservación* - Agenda tu servicio
*2. Consultar estado de mi reservación* - Revisa tu cita
*3. Consultar Servicios* - Conoce paquetes y precios
*4. Conversar con un representante* - Asistencia inteligente
*5. Ubicación y Contactos* - Dirección y horarios

*Escribe el número de la opción que deseas:*`;

    await message.reply(menuMessage);
  }

  async handleCreateBooking(message) {
    const bookingMessage = `📅 *Crear Reservación - Auto Clinic RD*

Para crear tu reservación, por favor accede a nuestro portal web donde podrás:

• Ver todos nuestros paquetes disponibles
• Seleccionar fecha y hora preferida
• Especificar información de tu vehículo
• Recibir confirmación inmediata

🌐 *Accede aquí:* https://portal-web-auto-clin-ma0o.bolt.host/packages

Una vez en la página, haz clic en "Agendar Cita" en el paquete que prefieras.

¿Necesitas ayuda con algún paquete específico? Escribe *3* para ver nuestros servicios.`;

    await message.reply(bookingMessage);
  }

  async handleCheckBooking(message) {
    // Primero pedir el código
    const askCodeMessage = `🔍 *Consultar Estado de Reservación*

Por favor, escribe tu *código de confirmación* (ejemplo: AC20240115ABCD) para consultar el estado de tu reservación.

Este código lo recibiste al completar tu reserva en nuestro portal web.`;

    await message.reply(askCodeMessage);

    // Esperar respuesta con el código
    this.waitForConfirmationCode(message.from);
  }

  async waitForConfirmationCode(phone) {
    // Este es un ejemplo simplificado - en producción necesitarías un sistema más robusto
    // para manejar conversaciones de múltiples pasos
    console.log(`Esperando código de confirmación de: ${phone}`);
  }

  async handleServices(message) {
    if (!this.washPackages.length) {
      await message.reply('❌ No pude cargar la información de servicios en este momento. Por favor, intenta más tarde.');
      return;
    }

    let servicesMessage = `🚿 *Nuestros Servicios - Auto Clinic RD*\n\n`;

    this.washPackages.forEach((pkg, index) => {
      servicesMessage += `*${pkg.name}* ${pkg.popular ? '🏆' : ''}\n`;
      servicesMessage += `📝 ${pkg.description}\n`;
      servicesMessage += `💵 *Precios:*\n`;
      servicesMessage += `   • Pequeño: $${pkg.prices.small}\n`;
      servicesMessage += `   • Mediano: $${pkg.prices.medium}\n`;
      servicesMessage += `   • Grande: $${pkg.prices.large}\n`;
      
      if (pkg.services && pkg.services.length) {
        servicesMessage += `🔧 *Incluye:* ${pkg.services.slice(0, 3).join(', ')}`;
        if (pkg.services.length > 3) servicesMessage += `...`;
        servicesMessage += `\n`;
      }
      
      servicesMessage += `\n`;
    });

    servicesMessage += `💡 *Para reservar:* Escribe *1* o visita:\n`;
    servicesMessage += `https://portal-web-auto-clin-ma0o.bolt.host/packages`;

    await message.reply(servicesMessage);
  }

  async handleRepresentative(message) {
    const repMessage = `💬 *Conversar con Representante*

¡Perfecto! Ahora puedes conversar conmigo libremente. Soy un asistente IA con información actualizada de Auto Clinic RD.

Puedes preguntarme sobre:
• Servicios y precios
• Horarios de atención
• Estado de reservaciones (necesitaré tu código)
• Información general
• Y mucho más...

*Escribe tu pregunta directamente* y te ayudaré de inmediato.

*Para volver al menú principal escribe:* menu`;

    await message.reply(repMessage);
  }

  async handleLocation(message) {
    console.log(this.companyInfo);
    if (!this.companyInfo) {
      await message.reply('❌ No pude cargar la información de contacto en este momento.');
      return;
    }

    const locationMessage = `📍 *Ubicación y Contactos - Auto Clinic RD*

*🏢 Dirección:*
${this.companyInfo.location.address}
${this.companyInfo.location.city}

*🕒 Horarios de Atención:*
Lunes a Viernes: ${this.companyInfo.hours.monday}
Sábado: ${this.companyInfo.hours.saturday}
Domingo: ${this.companyInfo.hours.sunday}

*📞 Contactos:*
Teléfono: ${this.companyInfo.contact.phone}
WhatsApp: ${this.companyInfo.contact.whatsapp}
Email: ${this.companyInfo.contact.email}
Instagram: ${this.companyInfo.contact.instagram}

*🗺️ Ubicación en Google Maps:*
https://maps.app.goo.gl/gVPfDAz1Xr79k1Xi9

*🚗 ¡Te esperamos!*`;

    await message.reply(locationMessage);

    // También enviar la ubicación como mensaje de ubicación
    try {
      const locationMedia = MessageMedia.fromFilePath('./assets/location.jpg'); // Puedes tener una imagen por defecto
      await message.reply(locationMedia, undefined, { caption: '📍 Nuestra ubicación en Google Maps' });
    } catch (error) {
      console.log('No se pudo enviar la imagen de ubicación');
    }
  }

  // Mejorar la función looksLikeConfirmationCode existente
looksLikeConfirmationCode(text) {
  // Patrón para códigos de confirmación (ej: AC20240115ABCD)
  const confirmationPattern = /^AC\d{8}[A-Z]{4}$/i;
  
  // También aceptar códigos sin el prefijo AC (por si el usuario solo escribe la parte numérica)
  const numericPattern = /^\d{8}[A-Z]{4}$/i;
  const shortPattern = /^[A-Z0-9]{12,16}$/i; // Patrón más flexible
  
  return confirmationPattern.test(text.toUpperCase()) || 
         numericPattern.test(text.toUpperCase()) ||
         shortPattern.test(text.toUpperCase());
}

// Función para normalizar códigos de confirmación
normalizeConfirmationCode(text) {
  const upperText = text.toUpperCase().trim();
  
  // Si ya tiene formato AC, devolverlo tal cual
  if (upperText.startsWith('AC')) {
    return upperText;
  }
  
  // Si es solo la parte numérica, agregar el prefijo AC
  if (/^\d{8}[A-Z]{4}$/.test(upperText)) {
    return 'AC' + upperText;
  }
  
  return upperText;
}

async handleAIConversation(phone, userMessage, message) {
    try {
      // Primero verificar si es un código de confirmación o si debemos procesar uno
      if (userMessage.startsWith('PROCESAR_CODIGO:')) {
        const confirmationCode = userMessage.replace('PROCESAR_CODIGO:', '');
        const booking = await firebaseService.getBookingByConfirmationNumber(confirmationCode);
        if (booking) {
          ollamaService.setAwaitingConfirmationCode(phone, false);
          await this.sendBookingStatus(message, booking);
          return;
        } else {
          ollamaService.setAwaitingConfirmationCode(phone, true);
          await message.reply('❌ No encontré una reservación con el código *' + confirmationCode + '*.\n\nPor favor, verifica el código e intenta nuevamente.\n\n*Formato correcto:* AC40686909Z3HM');
          return;
        }
      }

      // Verificar si es un código de confirmación directo
      if (this.looksLikeConfirmationCode(userMessage)) {
        const normalizedCode = firebaseService.normalizeConfirmationCode(userMessage);
        const booking = await firebaseService.getBookingByConfirmationNumber(normalizedCode);
        if (booking) {
          ollamaService.setAwaitingConfirmationCode(phone, false);
          await this.sendBookingStatus(message, booking);
          return;
        } else {
          ollamaService.setAwaitingConfirmationCode(phone, true);
          await message.reply('❌ No encontré una reservación con el código *' + normalizedCode + '*.\n\nPor favor, verifica el código e intenta nuevamente.');
          return;
        }
      }

      // Verificar si estamos esperando un código de confirmación
      if (ollamaService.isAwaitingConfirmationCode(phone)) {
        if (this.looksLikeConfirmationCode(userMessage)) {
          const normalizedCode = firebaseService.normalizeConfirmationCode(userMessage);
          const booking = await firebaseService.getBookingByConfirmationNumber(normalizedCode);
          if (booking) {
            ollamaService.setAwaitingConfirmationCode(phone, false);
            await this.sendBookingStatus(message, booking);
            return;
          } else {
            ollamaService.setAwaitingConfirmationCode(phone, true);
            await message.reply('❌ No encontré una reservación con el código *' + normalizedCode + '*.\n\nPor favor, verifica el código e intenta nuevamente.\n\n*Formato correcto:* AC40686909Z3HM');
            return;
          }
        }
      }

      // Usar Ollama para generar respuesta
      const response = await ollamaService.generateResponse(
        phone, 
        userMessage, 
        this.companyInfo, 
        this.washPackages
      );

      // Si la respuesta indica que debemos procesar un código
      if (response.startsWith('PROCESAR_CODIGO:')) {
        const confirmationCode = response.replace('PROCESAR_CODIGO:', '');
        const booking = await firebaseService.getBookingByConfirmationNumber(confirmationCode);
        if (booking) {
          ollamaService.setAwaitingConfirmationCode(phone, false);
          await this.sendBookingStatus(message, booking);
          return;
        } else {
          ollamaService.setAwaitingConfirmationCode(phone, true);
          await message.reply('❌ No encontré una reservación con el código *' + confirmationCode + '*.\n\nPor favor, verifica el código e intenta nuevamente.');
          return;
        }
      }

      // Simular typing antes de enviar
      await this.simulateTyping(phone);
      
      await message.reply(response);

      // Guardar respuesta del bot en Firebase
      await firebaseService.saveConversation(phone, response, false);

    } catch (error) {
      console.error('Error en conversación con IA:', error);
      const phoneNumber = this.companyInfo?.contact?.phone || "809-244-0055";
      await message.reply(`❌ Estoy teniendo dificultades técnicas. Por favor, intenta nuevamente o contacta al *${phoneNumber}*`);
    }
  }

// Actualizar la función looksLikeConfirmationCode en bot.js
looksLikeConfirmationCode(text) {
  // Patrón para códigos como AC40686909Z3HM (AC + 12 caracteres alfanuméricos)
  const confirmationPattern = /^AC[A-Z0-9]{12}$/i;
  // También aceptar sin el AC (12 caracteres alfanuméricos)
  const shortPattern = /^[A-Z0-9]{12}$/i;
  
  return confirmationPattern.test(text.toUpperCase()) || 
         shortPattern.test(text.toUpperCase());
}

  async sendBookingStatus(message, booking) {
    const statusEmojis = {
      'pending': '⏳',
      'confirmed': '✅',
      'in-progress': '🔧',
      'completed': '🎉'
    };

    const statusTexts = {
      'pending': 'Pendiente de confirmación',
      'confirmed': 'Confirmada',
      'in-progress': 'En progreso',
      'completed': 'Completada'
    };

    const statusMessage = `📋 *Estado de tu Reservación*

*Código:* ${booking.confirmationNumber}
*Cliente:* ${booking.customerName}
*Paquete:* ${booking.packageName}
*Vehículo:* ${booking.vehicleInfo}
*Tamaño:* ${this.getVehicleSizeText(booking.vehicleSize)}
*Fecha preferida:* ${this.formatDate(booking.preferredDate)}
*Hora:* ${booking.preferredTime}

*Estado:* ${statusEmojis[booking.status]} ${statusTexts[booking.status]}
*Total:* $${booking.total}

${booking.notes ? `*Notas:* ${booking.notes}\n` : ''}
¿Necesitas ayuda adicional? Escribe *4* para conversar con un representante.`;

    await message.reply(statusMessage);
  }

  getVehicleSizeText(size) {
    const sizes = {
      'small': 'Pequeño',
      'medium': 'Mediano',
      'large': 'Grande'
    };
    return sizes[size] || size;
  }

  formatDate(date) {
    if (date.toDate) {
      return date.toDate().toLocaleDateString('es-DO');
    }
    return new Date(date).toLocaleDateString('es-DO');
  }
}

// Inicializar el bot
const bot = new WhatsAppBot();

// Manejar cierre graceful
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando bot...');
  ollamaService.saveConversations();
  process.exit(0);
});

module.exports = WhatsAppBot;