const GeminiService = require('../services/geminiService');
const FirebaseService = require('../services/firebaseService');
const ReservationService = require('../services/reservationService');
const WhatsAppService = require('../services/whatsappService');

class WhatsAppController {
  constructor(client) {
    this.client = client;
    this.whatsappService = new WhatsAppService(client);
    this.geminiService = new GeminiService();
    this.firebaseService = FirebaseService;
    this.reservationService = new ReservationService();
    this.conversationStates = new Map(); // Para manejar estados de conversación
  }

async handleIncomingMessage(message) {
    try {
      const { from, body, senderName } = message;
      const normalizedPhone = this.normalizePhoneNumber(from);
      
      console.log(`👤 ${senderName} (${normalizedPhone}): ${body}`);

      // Verificar si está pausado para humano
      if (await this.firebaseService.isChatPaused(normalizedPhone)) {
        if (body.trim() === '**') {
          await this.firebaseService.resumeChat(normalizedPhone);
          await this.whatsappService.sendMessage(from, '✅ Bot reactivado. ¿En qué puedo ayudarte?');
          return this.showMainMenu(from, senderName);
        }
        return; // No responder si está pausado para humano
      }

      // Verificar si está en reservación
      const reservationState = await this.firebaseService.getReservationState(normalizedPhone);
      const isInReservation = reservationState && reservationState.step;

      if (isInReservation || this.isReservationCommand(body)) {
        const response = await this.reservationService.handleReservationStep(normalizedPhone, body, senderName);
        if (response) {
          await this.whatsappService.sendMessage(from, response);
        }
        return;
      }

      // Verificar si está en conversación de servicios (Opción 3)
      const isInServicesConversation = this.conversationStates.get(normalizedPhone) === 'services';
      if (isInServicesConversation) {
        return await this.handleServicesConversation(normalizedPhone, body, senderName, from);
      }

      // Verificar si está en conversación general con Alexa (Opción 7)
      const isInAlexaConversation = this.conversationStates.get(normalizedPhone) === 'alexa_general';
      if (isInAlexaConversation) {
        return await this.handleAlexaGeneralConversation(normalizedPhone, body, senderName, from);
      }

      // Procesar opciones del menú
      const menuResponse = await this.handleMenuOptions(normalizedPhone, body, senderName);
      if (menuResponse) {
        await this.whatsappService.sendMessage(from, menuResponse);
        return;
      }

      // Para cualquier otro mensaje, mostrar el menú principal
      await this.showMainMenu(from, senderName);

    } catch (error) {
      console.error('❌ Error en controller:', error);
      await this.whatsappService.sendMessage(
        message.from, 
        '❌ Error temporal. Escribe "menu" para volver al inicio.'
      );
    }
  }

  async handleAlexaGeneralConversation(phone, message, userName, from) {
    try {
      // Si el usuario quiere salir
      if (message.toLowerCase().includes('salir') || message.toLowerCase().includes('volver') || message === '0') {
        this.conversationStates.delete(phone);
        return this.getMainMenu(userName);
      }

      // Obtener TODA la información para el contexto de Alexa
      const [companyInfo, packages, userBookings, menuItems, menuCategories] = await Promise.all([
        this.firebaseService.getCompanyInfo(),
        this.firebaseService.getWashPackages(),
        this.firebaseService.getBookingsByPhoneNumber(phone),
        this.firebaseService.getMenuItems(),
        this.firebaseService.getMenuCategories()
      ]);

      // Preparar contexto completo para Gemini
      const contextMessage = this.prepareAlexaContext(message, companyInfo, packages, userBookings, menuItems, menuCategories, userName);
      
      // Usar Gemini con toda la información
      const geminiResponse = await this.geminiService.generateResponseWithContext(phone, contextMessage, userName);
      
      if (geminiResponse && !geminiResponse.includes('❌')) {
        // Agregar instrucción para salir
        const responseWithExit = `${geminiResponse}\n\n💡 *Escribe "salir" para volver al menú principal*`;
        await this.whatsappService.sendMessage(from, responseWithExit);
      } else {
        await this.whatsappService.sendMessage(from, '❌ Error en la conversación. Escribe "salir" para volver al menú.');
      }

    } catch (error) {
      console.error('Error en conversación general con Alexa:', error);
      this.conversationStates.delete(phone);
      await this.whatsappService.sendMessage(from, '❌ Error en la conversación. Volviendo al menú principal.');
      return this.getMainMenu(userName);
    }
  }

  prepareAlexaContext(userMessage, companyInfo, packages, userBookings, menuItems, menuCategories, userName) {
    // Formatear información de la empresa
    const companyText = `
INFORMACIÓN DE LA EMPRESA:
Nombre: ${companyInfo?.name || 'Auto Clinic RD'}
Descripción: ${companyInfo?.description || 'Especialistas en detailing y car wash'}
Misión: ${companyInfo?.mission || 'Proporcionar servicios de detailing de alta calidad'}
Visión: ${companyInfo?.vision || 'Convertirnos en el proveedor líder de servicios'}
Valores: ${companyInfo?.values?.join(', ') || 'Calidad, Integridad, Innovación, Servicio al cliente'}

UBICACIÓN Y CONTACTO:
Dirección: ${companyInfo?.location?.address || 'Av. Pdte. Antonio Guzmán Fernández 23, San Francisco de Macorís'}
Teléfono: ${companyInfo?.contact?.phone || '809-244-0055'}
Email: ${companyInfo?.contact?.email || 'Autoclinicsfm@gmail.com'}
Instagram: ${companyInfo?.contact?.instagram || '@autoclinic_rd'}

HORARIOS:
Lunes a Viernes: ${companyInfo?.hours?.monday || '8:00 AM - 6:00 PM'}
Sábado: ${companyInfo?.hours?.saturday || '8:00 AM - 5:00 PM'}
Domingo: ${companyInfo?.hours?.sunday || '9:00 AM - 3:00 PM'}
`;

    // Formatear servicios
    const servicesText = `
SERVICIOS DISPONIBLES:
${companyInfo?.services?.join('\n• ') || 'Lavado detallado, Ceramic Pro, PPF, Lavado de interiores, Laminados, Brillado, Diagnósticos, Mantenimiento preventivo'}
`;

    // Formatear combos de lavado
    let packagesText = 'COMBOS DE LAVADO:\n';
    packages.forEach(pkg => {
      packagesText += `\n🏁 ${pkg.name} ${pkg.popular ? '(MÁS POPULAR)' : ''}\n`;
      packagesText += `Descripción: ${pkg.description}\n`;
      packagesText += `Precios: Pequeño: $${pkg.prices.small}, Mediano: $${pkg.prices.medium}, Grande: $${pkg.prices.large}\n`;
      packagesText += `Servicios incluidos: ${pkg.services?.join(', ') || 'No especificado'}\n`;
    });

    // Formatear reservaciones del usuario
    let bookingsText = 'RESERVACIONES DEL CLIENTE:\n';
    if (userBookings.length > 0) {
      userBookings.forEach(booking => {
        bookingsText += `\n📅 ${booking.confirmationNumber}: ${booking.packageName}\n`;
        bookingsText += `Fecha: ${this.formatDate(booking.preferredDate)}\n`;
        bookingsText += `Hora: ${booking.preferredTime}\n`;
        bookingsText += `Estado: ${booking.status}\n`;
        bookingsText += `Vehículo: ${booking.vehicleInfo}\n`;
      });
    } else {
      bookingsText += 'No hay reservaciones activas';
    }

    // Formatear menú del bar
    let menuText = 'MENÚ DEL RACING BAR:\n';
    if (menuCategories && menuItems) {
      menuCategories.forEach(category => {
        if (category.active) {
          const categoryItems = menuItems.filter(item => 
            item.category === category.id && item.available
          );
          if (categoryItems.length > 0) {
            menuText += `\n${category.name}:\n`;
            categoryItems.forEach(item => {
              menuText += `• ${item.name}: $${item.price}${item.description ? ` - ${item.description}` : ''}\n`;
            });
          }
        }
      });
    } else {
      menuText += 'Próximamente disponible';
    }

    // Construir mensaje completo para Gemini
    return `
CONTEXTO COMPLETO DE AUTO CLINIC RD:

${companyText}

${servicesText}

${packagesText}

${bookingsText}

${menuText}

MENSAJE DEL USUARIO: "${userMessage}"
NOMBRE DEL CLIENTE: ${userName || 'No proporcionado'}

INSTRUCCIÓN: Responde como Alexa usando TODA esta información para dar una respuesta completa y precisa.
`;
  }

async handleMenuOptions(phone, message, userName) {
    const normalizedPhone = this.normalizePhoneNumber(phone);
    const messageLower = message.toLowerCase().trim();

    // Manejar respuestas después de ver combos
    const afterPackagesState = this.conversationStates.get(normalizedPhone);
    if (afterPackagesState === 'after_packages') {
      this.conversationStates.delete(normalizedPhone);
      
      if (message === '1') {
        return await this.reservationService.handleReservationStep(normalizedPhone, message, userName);
      } else if (message === '2') {
        return this.getMainMenu(userName);
      }
    }

    switch (messageLower) {
      case '1':
      case 'reservar':
        return await this.reservationService.handleReservationStep(normalizedPhone, message, userName);

      case '2':
      case 'mis reservaciones':
        return await this.handleBookingsQuery(normalizedPhone, userName);

      case '3':
      case 'servicios':
        // Iniciar conversación de servicios con Gemini
        this.conversationStates.set(normalizedPhone, 'services');
        return await this.startServicesConversation(userName);

      case '4':
      case 'combos':
        // Marcar estado para manejar la respuesta después de mostrar combos
        this.conversationStates.set(normalizedPhone, 'after_packages');
        return await this.handlePackagesQuery(normalizedPhone, userName);

      case '5':
      case 'menú':
      case 'menu':
      case 'bar':
        return await this.handleBarMenuQuery(userName);

      case '6':
      case 'ubicación':
      case 'horarios':
        return await this.handleLocationQuery(normalizedPhone, userName);

      case '7':
      case 'alexa':
        return await this.handleAlexaConversation(normalizedPhone, userName);

      case '8':
      case 'humano':
      case 'agente humano':
        await this.firebaseService.pauseChat(normalizedPhone);
        return '🔴 *TRANSFIRIENDO A AGENTE HUMANO*\n\nUn especialista te atenderá pronto. El bot estará desactivado temporalmente.\n\nPara reactivar el bot, escribe **';

      case 'salir':
      case 'volver':
      case 'menu':
        this.conversationStates.delete(normalizedPhone);
        return this.getMainMenu(userName);

      default:
        return null;
    }
  }

async handleServicesConversation(phone, message, userName, from) {
    try {
      // Si el usuario quiere salir - MEJOR DETECCIÓN
      const messageLower = message.toLowerCase().trim();
      if (messageLower === 'salir' || messageLower === 'volver' || message === '0') {
        this.conversationStates.delete(phone);
        await this.whatsappService.sendMessage(from, this.getMainMenu(userName));
        return;
      }

      // Usar Gemini para conversar sobre servicios
      const geminiResponse = await this.geminiService.generateResponse(phone, message, userName);
      
      if (geminiResponse && !geminiResponse.includes('❌')) {
        // Agregar instrucción para salir
        const responseWithExit = `${geminiResponse}\n\n💡 *Escribe "SALIR" para volver al menú principal*`;
        await this.whatsappService.sendMessage(from, responseWithExit);
      } else {
        await this.whatsappService.sendMessage(from, '❌ Error en la conversación. Escribe "SALIR" para volver al menú.');
      }

    } catch (error) {
      console.error('Error en conversación de servicios:', error);
      this.conversationStates.delete(phone);
      await this.whatsappService.sendMessage(from, '❌ Error en la conversación. Volviendo al menú principal.');
      await this.whatsappService.sendMessage(from, this.getMainMenu(userName));
    }
  }

  async handleAlexaGeneralConversation(phone, message, userName, from) {
    try {
      // Si el usuario quiere salir - MEJOR DETECCIÓN
      const messageLower = message.toLowerCase().trim();
      if (messageLower === 'salir' || messageLower === 'volver' || message === '0') {
        this.conversationStates.delete(phone);
        await this.whatsappService.sendMessage(from, this.getMainMenu(userName));
        return;
      }

      // Obtener TODA la información para el contexto de Alexa
      const [companyInfo, packages, userBookings, menuItems, menuCategories] = await Promise.all([
        this.firebaseService.getCompanyInfo(),
        this.firebaseService.getWashPackages(),
        this.firebaseService.getBookingsByPhoneNumber(phone),
        this.firebaseService.getMenuItems(),
        this.firebaseService.getMenuCategories()
      ]);

      // Preparar contexto completo para Gemini
      const contextMessage = this.prepareAlexaContext(message, companyInfo, packages, userBookings, menuItems, menuCategories, userName);
      
      // Usar Gemini con toda la información
      const geminiResponse = await this.geminiService.generateResponseWithContext(phone, contextMessage, userName);
      
      if (geminiResponse && !geminiResponse.includes('❌')) {
        // Agregar instrucción para salir
        const responseWithExit = `${geminiResponse}\n\n💡 *Escribe "SALIR" para volver al menú principal*`;
        await this.whatsappService.sendMessage(from, responseWithExit);
      } else {
        await this.whatsappService.sendMessage(from, '❌ Error en la conversación. Escribe "SALIR" para volver al menú.');
      }

    } catch (error) {
      console.error('Error en conversación general con Alexa:', error);
      this.conversationStates.delete(phone);
      await this.whatsappService.sendMessage(from, '❌ Error en la conversación. Volviendo al menú principal.');
      await this.whatsappService.sendMessage(from, this.getMainMenu(userName));
    }
  }

  async startServicesConversation(userName) {
    const nameGreeting = userName ? `, ${userName}` : '';
    
    return `🛠️ *CONVERSACIÓN SOBRE SERVICIOS*${nameGreeting}\n\n¡Hola! Soy Alexa, especialista en servicios de Auto Clinic RD. 🚗\n\nPregúntame sobre:\n• Tipos de lavado disponibles\n• Servicios de detailing\n• Tratamientos especiales\n• Precios y duración\n• Recomendaciones para tu vehículo\n\n💡 *Escribe "salir" en cualquier momento para volver al menú*\n\n¿En qué servicio estás interesado?`;
  }

async handleAlexaConversation(phone, userName) {
    const nameGreeting = userName ? `, ${userName}` : '';
    
    // Iniciar conversación general con Alexa
    this.conversationStates.set(phone, 'alexa_general');
    return `💬 *CONVERSANDO CON ALEXA*${nameGreeting}\n\n¡Hola! Soy Alexa, tu asistente completa de Auto Clinic RD. 🚗💨\n\nPuedo ayudarte con:\n• Información completa de la empresa\n• Todos nuestros servicios y combos\n• Proceso de reservaciones\n• Precios y promociones\n• Ubicación y horarios\n• Cualquier pregunta que tengas\n\n💡 *Escribe "salir" en cualquier momento para volver al menú principal*\n\n¿En qué puedo ayudarte hoy?`;
  }

  async handleBookingsQuery(phone, userName) {
    try {
      const bookings = await this.firebaseService.getBookingsByPhoneNumber(phone);
      
      if (bookings.length === 0) {
        return `📭 *No tienes reservaciones activas*\n\n${this.getMainMenu(userName)}`;
      }
      
      let response = `📋 *TUS RESERVACIONES*\n\n`;
      
      bookings.forEach((booking, index) => {
        response += `📍 *Reserva ${index + 1}:*\n`;
        response += `📦 ${booking.packageName}\n`;
        response += `🚗 ${this.formatVehicleSize(booking.vehicleSize)}\n`;
        response += `📅 ${this.formatDate(booking.preferredDate)}\n`;
        response += `⏰ ${booking.preferredTime}\n`;
        response += `🏷️ ${this.formatStatus(booking.status)}\n`;
        response += `🔢 ${booking.confirmationNumber}\n\n`;
      });
      
      response += this.getMainMenu(userName);
      
      return response;
    } catch (error) {
      return `❌ Error consultando reservaciones.\n\n${this.getMainMenu(userName)}`;
    }
  }

async handlePackagesQuery(phone, userName) {
    try {
      const packages = await this.firebaseService.getWashPackages();
      
      if (packages.length === 0) {
        return `🎁 *COMBOS DE LAVADO*\n\n⚠️ No hay combos disponibles en este momento.\n\n${this.getMainMenu(userName)}`;
      }
      
      let response = `🎁 *TODOS NUESTROS COMBOS DE LAVADO* 🚗💨\n\n`;
      
      packages.forEach((pkg, index) => {
        // Emoji especial para el paquete más popular
        const popularBadge = pkg.popular ? ' 👑 **MÁS SOLICITADO**' : '';
        
        response += `✨ *COMBO ${index + 1}: ${pkg.name}*${popularBadge}\n`;
        response += `   ${pkg.description}\n\n`;
        
        response += `   💰 *INVERSIÓN:*\n`;
        response += `      🚗 Vehículo Pequeño: *$${pkg.prices.small}*\n`;
        response += `      🚙 Vehículo Mediano: *$${pkg.prices.medium}*\n`;
        response += `      🚐 Vehículo Grande: *$${pkg.prices.large}*\n\n`;
        
        if (pkg.services && pkg.services.length > 0) {
          response += `   🎯 *TODO LO INCLUIDO:*\n`;
          pkg.services.forEach(service => {
            response += `      ✨ ${service}\n`;
          });
        }
        
        response += `\n   ════════════════════════\n\n`;
      });
      
      response += `💡 *¿LISTO PARA DEJAR TU VEHÍCULO COMO NUEVO?*\n\n`;
      response += `🚀 *1. ¡SÍ! QUIERO RESERVAR* → Iniciar proceso de agendado\n`;
      response += `📋 *2. Volver al menú* → Explorar otras opciones\n\n`;
      response += `*Responde con el número de tu decisión:*`;
      
      return response;
    } catch (error) {
      console.error('Error obteniendo combos:', error);
      // Fallback con combos básicos
      return `🎁 *NUESTROS COMBOS ESPECIALIZADOS* 🚗\n\n` +
             `🏁 *DETALLING BÁSICO*\n` +
             `   Limpieza esencial y protección básica\n` +
             `   💰 Desde: $500\n\n` +
             `🏁 *DETALLING PREMIUM*\n` +
             `   Limpieza profunda y tratamientos avanzados\n` +
             `   💰 Desde: $800\n\n` +
             `🏁 *RACING PREMIUM* 👑\n` +
             `   Servicio completo con productos premium\n` +
             `   💰 Desde: $1200\n\n` +
             `🚀 *1. Reservar ahora*\n` +
             `📋 *2. Volver al menú*\n\n` +
             `*Tu elección:*`;
    }
  }

  async handleBarMenuQuery(userName) {
    const nameGreeting = userName ? `, ${userName}` : '';
    return `🍔 *MENÚ DEL RACING BAR*${nameGreeting}\n\nPara ver nuestro menú completo y ordenar, visita:\n\n🔗 https://autoclinicrd.com/bar\n\n¡Te esperamos! 🍔🍹\n\n${this.getMainMenu(userName)}`;
  }

  async handleLocationQuery(phone, userName) {
    try {
      // Usar Gemini para dar información de ubicación
      const geminiResponse = await this.geminiService.generateResponse(phone, "Necesito información completa sobre la ubicación, horarios y contacto de Auto Clinic RD", userName);
      
      if (geminiResponse && !geminiResponse.includes('❌')) {
        return `${geminiResponse}\n\n${this.getMainMenu(userName)}`;
      } else {
        // Fallback si Gemini falla
        const nameGreeting = userName ? `, ${userName}` : '';
        return `📍 *UBICACIÓN Y HORARIOS*${nameGreeting}\n\n🏢 Av. Pdte. Antonio Guzmán Fernández 23\n🏙️ San Francisco de Macorís 31000\n\n🕒 *HORARIOS:*\nLunes a Viernes: 8:00 AM - 6:00 PM\nSábado: 8:00 AM - 5:00 PM\nDomingo: 9:00 AM - 3:00 PM\n\n📞 809-244-0055\n📧 Autoclinicsfm@gmail.com\n📸 @autoclinic_rd\n\n${this.getMainMenu(userName)}`;
      }
    } catch (error) {
      const nameGreeting = userName ? `, ${userName}` : '';
      return `📍 *UBICACIÓN Y HORARIOS*${nameGreeting}\n\n🏢 Av. Pdte. Antonio Guzmán Fernández 23, SFM\n📞 809-244-0055\n\n${this.getMainMenu(userName)}`;
    }
  }

  async showMainMenu(phone, userName) {
    const menu = this.getMainMenu(userName);
    await this.whatsappService.sendMessage(phone, menu);
  }

  getMainMenu(userName = '') {
    const nameGreeting = userName ? `, ${userName}` : '';
    
    return `👋 ¡Hola${nameGreeting}! ¡Bienvenido a *Auto Clinic RD*! 🚗💨

¿En qué puedo ayudarte hoy?

📅 *1. Crear Reservación* - Agenda tu servicio de lavado
🔍 *2. Mis Reservaciones* - Consulta el estado de tus citas
🛠️ *3. Ver Servicios* - Conversa sobre nuestros servicios
🎁 *4. Combos de Lavado* - Precios y paquetes disponibles
🍔 *5. Menú del Bar* - Comida y bebidas del Racing Bar
📍 *6. Ubicación y Horarios* - Encuéntranos y contáctanos
💬 *7. Conversar con Alexa* - Habla con nuestra asistente
👤 *8. Agente Humano* - Habla con una persona real

💡 *Escribe el número de tu opción (1-8) o "menu" para ver esto nuevamente:*`;
  }

  // Métodos auxiliares
  normalizePhoneNumber(phone) {
    return phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '$1');
  }

  isReservationCommand(message) {
    const triggers = ['1', 'reservar', 'reservación', 'agendar', 'cita', 'quiero lavar'];
    return triggers.some(trigger => 
      message.toLowerCase().includes(trigger.toLowerCase())
    );
  }

  formatVehicleSize(size) {
    const sizes = {
      'small': 'Pequeño 🚗',
      'medium': 'Mediano 🚙', 
      'large': 'Grande 🚐'
    };
    return sizes[size] || size;
  }

  formatDate(date) {
    if (!date) return 'No especificada';
    try {
      if (date.toDate) {
        return date.toDate().toLocaleDateString('es-DO');
      }
      return new Date(date).toLocaleDateString('es-DO');
    } catch (error) {
      return 'Fecha no válida';
    }
  }

  formatStatus(status) {
    const statuses = {
      'pending': '⏳ Pendiente',
      'confirmed': '✅ Confirmada',
      'in-progress': '🔄 En progreso',
      'completed': '🎉 Completada'
    };
    return statuses[status] || status;
  }
}

module.exports = WhatsAppController;