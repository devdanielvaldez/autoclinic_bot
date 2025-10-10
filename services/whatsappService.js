const { MessageMedia } = require('whatsapp-web.js');

class WhatsAppService {
  constructor(client) {
    this.client = client;
  }

  /**
   * Envía un mensaje de texto a un número de WhatsApp
   */
  async sendMessage(phone, message) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      await this.client.sendMessage(formattedPhone, message);
      console.log(`✅ Mensaje enviado a: ${formattedPhone}`);
      return true;
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error);
      throw error;
    }
  }

  /**
   * Envía una imagen con caption
   */
  async sendImage(phone, imageUrl, caption = '') {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      const media = await MessageMedia.fromUrl(imageUrl);
      
      await this.client.sendMessage(formattedPhone, media, { caption });
      console.log(`🖼️ Imagen enviada a: ${formattedPhone}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error enviando imagen:', error);
      throw error;
    }
  }

  /**
   * Envía un mensaje con botones (usando listas de WhatsApp)
   */
  async sendMessageWithOptions(phone, message, options) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      
      let optionsMessage = message + '\n\n';
      options.forEach((option, index) => {
        optionsMessage += `${index + 1}. ${option}\n`;
      });
      
      await this.client.sendMessage(formattedPhone, optionsMessage);
      console.log(`📋 Mensaje con opciones enviado a: ${formattedPhone}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error enviando mensaje con opciones:', error);
      throw error;
    }
  }

  /**
   * Envía un mensaje de ubicación
   */
  async sendLocation(phone, latitude, longitude, name = 'Auto Clinic RD', address = 'Av. Pdte. Antonio Guzmán Fernández 23') {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      
      const locationMessage = `📍 *${name}*\n\n${address}\n\n🌐 Google Maps: https://maps.google.com/?q=${latitude},${longitude}`;
      
      await this.client.sendMessage(formattedPhone, locationMessage);
      console.log(`📍 Ubicación enviada a: ${formattedPhone}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error enviando ubicación:', error);
      throw error;
    }
  }

  /**
   * Envía un mensaje de contacto
   */
  async sendContactInfo(phone) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      
      const contactMessage = `📞 *CONTACTO AUTO CLINIC RD*\n\n📱 WhatsApp: 809-244-0055\n📧 Email: Autoclinicsfm@gmail.com\n📸 Instagram: @autoclinic_rd\n\n📍 Dirección: Av. Pdte. Antonio Guzmán Fernández 23, San Francisco de Macorís`;
      
      await this.client.sendMessage(formattedPhone, contactMessage);
      console.log(`📞 Contacto enviado a: ${formattedPhone}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error enviando contacto:', error);
      throw error;
    }
  }

  /**
   * Formatea un número de teléfono para WhatsApp
   */
  formatPhoneNumber(phone) {
    try {
      // Remover caracteres no numéricos
      let cleaned = phone.replace(/\D/g, '');
      
      // Si es un número dominicano sin código de país, agregar el 1
      if (cleaned.length === 10 && !cleaned.startsWith('1')) {
        cleaned = '1' + cleaned;
      }
      
      // Si empieza con 1 y tiene 11 dígitos, es correcto
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        return `${cleaned}@c.us`;
      }
      
      // Si tiene 10 dígitos y no empieza con 1, agregar 1
      if (cleaned.length === 10) {
        return `1${cleaned}@c.us`;
      }
      
      // Para otros formatos, devolver tal cual con @c.us
      return `${cleaned}@c.us`;
      
    } catch (error) {
      console.error('Error formateando número:', error);
      return phone;
    }
  }

  /**
   * Obtiene información del chat/contacto
   */
  async getChatInfo(phone) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      const contact = await this.client.getContactById(formattedPhone);
      
      return {
        name: contact.name || contact.pushname || 'Cliente',
        phone: formattedPhone,
        isBusiness: contact.isBusiness || false,
        isUser: contact.isUser || false
      };
    } catch (error) {
      console.error('Error obteniendo info del chat:', error);
      return {
        name: 'Cliente',
        phone: this.formatPhoneNumber(phone),
        isBusiness: false,
        isUser: false
      };
    }
  }

  /**
   * Verifica si un número existe en WhatsApp
   */
  async checkNumberExists(phone) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      const contact = await this.client.getContactById(formattedPhone);
      return contact !== undefined;
    } catch (error) {
      console.error('Error verificando número:', error);
      return false;
    }
  }

  /**
   * Envía un mensaje de error genérico
   */
  async sendErrorMessage(phone) {
    const errorMessage = `❌ *Lo sentimos, ha ocurrido un error*\n\nPor favor, intenta nuevamente o escribe "menu" para volver al menú principal.\n\nSi el problema persiste, contacta al 809-244-0055.`;
    
    return await this.sendMessage(phone, errorMessage);
  }

  /**
   * Envía un mensaje de bienvenida
   */
  async sendWelcomeMessage(phone, userName = '') {
    const nameGreeting = userName ? `, ${userName}` : '';
    
    const welcomeMessage = `👋 ¡Hola${nameGreeting}! ¡Bienvenido a *Auto Clinic RD*! 🚗💨

Estoy aquí para ayudarte con:

📅 Reservaciones de lavado
🔍 Consulta de tus citas
🛠️ Información de servicios
🎁 Combos disponibles
🍔 Menú del Racing Bar
📍 Ubicación y horarios

Escribe *menu* en cualquier momento para ver las opciones.`;

    return await this.sendMessage(phone, welcomeMessage);
  }

  /**
   * Envía un mensaje de despedida
   */
  async sendGoodbyeMessage(phone, userName = '') {
    const nameGreeting = userName ? `, ${userName}` : '';
    
    const goodbyeMessage = `👋 ¡Gracias${nameGreeting} por contactar a *Auto Clinic RD*! 🚗

¡Esperamos verte pronto!\n\n📞 *Contacto:* 809-244-0055\n📍 *Dirección:* Av. Pdte. Antonio Guzmán Fernández 23, SFM`;

    return await this.sendMessage(phone, goodbyeMessage);
  }

  /**
   * Envía notificación de reservación confirmada
   */
  async sendReservationConfirmation(phone, reservationDetails) {
    const message = `🎉 *¡RESERVACIÓN CONFIRMADA!*\n\n📦 *Servicio:* ${reservationDetails.packageName}\n🚗 *Vehículo:* ${reservationDetails.vehicleInfo}\n📅 *Fecha:* ${reservationDetails.preferredDate}\n⏰ *Hora:* ${reservationDetails.preferredTime}\n💰 *Total:* $${reservationDetails.total}\n🔢 *Código:* ${reservationDetails.confirmationNumber}\n\n📍 *Ubicación:* Av. Pdte. Antonio Guzmán Fernández 23, San Francisco de Macorís\n📞 *Teléfono:* 809-244-0055\n\n¡Te esperamos! 🚗💨`;

    return await this.sendMessage(phone, message);
  }

  /**
   * Envía recordatorio de reservación
   */
  async sendReservationReminder(phone, reservationDetails) {
    const message = `🔔 *RECORDATORIO DE RESERVACIÓN*\n\nTienes una cita programada para:\n\n📅 ${reservationDetails.preferredDate}\n⏰ ${reservationDetails.preferredTime}\n📦 ${reservationDetails.packageName}\n🚗 ${reservationDetails.vehicleInfo}\n🔢 ${reservationDetails.confirmationNumber}\n\n📍 Av. Pdte. Antonio Guzmán Fernández 23\n📞 809-244-0055`;

    return await this.sendMessage(phone, message);
  }
}

module.exports = WhatsAppService;