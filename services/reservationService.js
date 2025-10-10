const firebaseService = require('./firebaseService');

class ReservationService {
  constructor() {}

  async handleReservationStep(phone, userMessage, userName = null) {
    try {
      const normalizedPhone = firebaseService.normalizePhoneNumber(phone);
      let reservationState = await firebaseService.getReservationState(normalizedPhone);
      
      // Si no hay estado, iniciar nueva reservación
      if (!reservationState || !reservationState.step) {
        return this.startReservation(normalizedPhone, userName);
      }

      const currentStep = reservationState.step;
      const reservationData = reservationState.data || {};

      switch (currentStep) {
        case 1: return await this.handlePhoneConfirmation(normalizedPhone, userMessage, reservationData, userName);
        case 2: return await this.handlePackageSelection(normalizedPhone, userMessage, reservationData);
        case 3: return await this.handleVehicleSize(normalizedPhone, userMessage, reservationData);
        case 4: return await this.handleVehicleInfo(normalizedPhone, userMessage, reservationData);
        case 5: return await this.handleDateSelection(normalizedPhone, userMessage, reservationData);
        case 6: return await this.handleTimeSelection(normalizedPhone, userMessage, reservationData);
        case 7: return await this.handleFinalConfirmation(normalizedPhone, userMessage, reservationData);
        default: return this.getMainMenu(userName);
      }
    } catch (error) {
      console.error('Error en reservación:', error);
      return '❌ Error en el proceso. Escribe "menu" para volver al inicio.';
    }
  }

  async startReservation(phone, userName) {
    const nameGreeting = userName ? `, ${userName}` : '';
    
    await firebaseService.saveReservationState(phone, {
      step: 1,
      data: {
        customerName: userName || '',
        customerPhone: phone
      },
      startedAt: new Date()
    });

    return `📅 *INICIANDO RESERVACIÓN*${nameGreeting}\n\nVeo que tu número es ${phone}. ¿Confirmas que este es tu número para la reservación?\n\nResponde *SÍ* para confirmar o escribe el número correcto:`;
  }

  async handlePhoneConfirmation(phone, userMessage, reservationData, userName) {
    const messageLower = userMessage.toLowerCase();
    
    if (this.isPositiveConfirmation(messageLower)) {
      reservationData.customerPhone = phone;
      reservationData.customerName = userName || reservationData.customerName;
      
      await firebaseService.saveReservationState(phone, {
        step: 2,
        data: reservationData
      });

      const packages = await firebaseService.getWashPackages();
      return this.generatePackageSelectionMessage(packages);
    
    } else if (this.looksLikePhoneNumber(userMessage)) {
      const newPhone = firebaseService.normalizePhoneNumber(userMessage);
      reservationData.customerPhone = newPhone;
      reservationData.customerName = userName || reservationData.customerName;
      
      await firebaseService.saveReservationState(phone, {
        step: 2,
        data: reservationData
      });

      const packages = await firebaseService.getWashPackages();
      return `✅ Número actualizado: ${newPhone}\n\n${this.generatePackageSelectionMessage(packages)}`;
    
    } else {
      return `❌ No entendí. ¿Confirmas que ${phone} es tu número?\n\nResponde *SÍ* o escribe el número correcto:`;
    }
  }

  async handlePackageSelection(phone, userMessage, reservationData) {
    const packageNumber = this.extractNumber(userMessage);
    const packages = await firebaseService.getWashPackages();
    
    if (packageNumber >= 1 && packageNumber <= packages.length) {
      const selectedPackage = packages[packageNumber - 1];
      reservationData.package = selectedPackage;
      reservationData.packageName = selectedPackage.name;
      reservationData.packageId = selectedPackage.id;
      
      await firebaseService.saveReservationState(phone, {
        step: 3,
        data: reservationData
      });

      return `✅ *${selectedPackage.name}* seleccionado\n\n¿Qué tamaño tiene tu vehículo?\n\n1. 🚗 Pequeño (Sedán compacto)\n2. 🚙 Mediano (SUV mediano)  \n3. 🚐 Grande (SUV grande/Pickup)\n\nResponde con el número:`;
    
    } else {
      return this.generatePackageSelectionMessage(packages, true);
    }
  }

  async handleVehicleSize(phone, userMessage, reservationData) {
    const sizeNumber = this.extractNumber(userMessage);
    const sizeMap = {1: 'small', 2: 'medium', 3: 'large'};
    
    if (sizeMap[sizeNumber]) {
      reservationData.vehicleSize = sizeMap[sizeNumber];
      
      if (reservationData.package) {
        reservationData.total = reservationData.package.prices[reservationData.vehicleSize];
      }
      
      await firebaseService.saveReservationState(phone, {
        step: 4,
        data: reservationData
      });

      return `✅ Tamaño: *${this.formatVehicleSize(reservationData.vehicleSize)}*\n\nDime la marca, modelo, año y color de tu vehículo:\n\nEjemplo: "Toyota Corolla 2022 blanco"`;
    
    } else {
      return `❌ Selecciona el tamaño:\n\n1. 🚗 Pequeño\n2. 🚙 Mediano\n3. 🚐 Grande\n\nResponde con el número:`;
    }
  }

  async handleVehicleInfo(phone, userMessage, reservationData) {
    if (userMessage.trim().length < 3) {
      return `❌ Por favor, proporciona la información de tu vehículo:\n\nMarca, modelo, año y color\n\nEjemplo: "Honda Civic 2021 gris"`;
    }

    reservationData.vehicleInfo = userMessage;
    
    await firebaseService.saveReservationState(phone, {
      step: 5,
      data: reservationData
    });

    return `✅ Vehículo registrado\n\n¿Para qué fecha quieres agendar?\n\nFormato: *DD/MM/AAAA*\nEjemplo: "15/01/2024"`;
  }

  async handleDateSelection(phone, userMessage, reservationData) {
    if (!this.isValidDate(userMessage)) {
      return `❌ Formato incorrecto. Usa *DD/MM/AAAA*\n\nEjemplo: "15/01/2024"\n\n¿Para qué fecha?`;
    }

    reservationData.preferredDate = userMessage;
    
    await firebaseService.saveReservationState(phone, {
      step: 6,
      data: reservationData
    });

    return `✅ Fecha: *${userMessage}*\n\n¿Qué hora prefieres?\n\nHorarios:\n🕗 8:00 AM   🕘 9:00 AM   🕙 10:00 AM\n🕚 11:00 AM  🕛 12:00 PM  🕐 1:00 PM\n🕑 2:00 PM   🕒 3:00 PM   🕓 4:00 PM\n🕔 5:00 PM\n\nResponde con la hora:`;
  }

  async handleTimeSelection(phone, userMessage, reservationData) {
    if (!this.isValidTime(userMessage)) {
      return `❌ Hora no válida. Horarios:\n\n🕗 8:00 AM   🕘 9:00 AM   🕙 10:00 AM\n🕚 11:00 AM  🕛 12:00 PM  🕐 1:00 PM\n🕑 2:00 PM   🕒 3:00 PM   🕓 4:00 PM\n🕔 5:00 PM\n\nResponde con la hora:`;
    }

    reservationData.preferredTime = userMessage.toUpperCase();
    
    await firebaseService.saveReservationState(phone, {
      step: 7,
      data: reservationData
    });

    return this.generateFinalConfirmation(reservationData);
  }

  async handleFinalConfirmation(phone, userMessage, reservationData) {
    const messageLower = userMessage.toLowerCase();
    
    if (this.isPositiveConfirmation(messageLower)) {
      try {
        const reservationForFirebase = {
          customerName: reservationData.customerName,
          customerPhone: reservationData.customerPhone,
          packageId: reservationData.packageId,
          packageName: reservationData.packageName,
          vehicleSize: reservationData.vehicleSize,
          preferredDate: this.parseDate(reservationData.preferredDate),
          preferredTime: reservationData.preferredTime,
          vehicleInfo: reservationData.vehicleInfo,
          total: reservationData.total,
          status: 'pending'
        };

        const createdReservation = await firebaseService.createReservation(reservationForFirebase);
        
        await firebaseService.clearReservationState(phone);
        
        const menu = this.getMainMenu(reservationData.customerName);
        return `🎉 *¡RESERVACIÓN CONFIRMADA!*\n\n📦 ${reservationData.packageName}\n🚗 ${reservationData.vehicleInfo}\n📅 ${reservationData.preferredDate}\n⏰ ${reservationData.preferredTime}\n💰 $${reservationData.total}\n🔢 ${createdReservation.confirmationNumber}\n\n${menu}`;
      
      } catch (error) {
        console.error('Error:', error);
        await firebaseService.clearReservationState(phone);
        return '❌ Error al crear la reservación. Escribe "menu" para volver al inicio.';
      }
    
    } else {
      await firebaseService.clearReservationState(phone);
      return this.getMainMenu();
    }
  }

  // Métodos auxiliares
  generatePackageSelectionMessage(packages, showError = false) {
    let message = showError ? '❌ Selecciona un paquete válido:\n\n' : '🎁 *SELECCIONA UN PAQUETE:*\n\n';
    
    packages.forEach((pkg, index) => {
      message += `${index + 1}. *${pkg.name}* - $${pkg.prices.small}\n`;
      message += `   ${pkg.description}\n\n`;
    });
    
    message += 'Responde con el número:';
    return message;
  }

  generateFinalConfirmation(reservationData) {
    return `📋 *CONFIRMACIÓN FINAL*\n\n👤 ${reservationData.customerName}\n📞 ${reservationData.customerPhone}\n📦 ${reservationData.packageName}\n🚗 ${this.formatVehicleSize(reservationData.vehicleSize)}\n🔧 ${reservationData.vehicleInfo}\n📅 ${reservationData.preferredDate}\n⏰ ${reservationData.preferredTime}\n💰 $${reservationData.total}\n\n¿Todo correcto? Responde *SÍ* para confirmar:`;
  }

  getMainMenu(userName = '') {
    const nameGreeting = userName ? `, ${userName}` : '';
    
    return `👋 ¡Hola${nameGreeting}! ¡Bienvenido a *Auto Clinic RD*! 🚗💨

¿En qué puedo ayudarte hoy?

📅 *1. Crear Reservación*
🔍 *2. Mis Reservaciones*  
🛠️ *3. Ver Servicios*
🎁 *4. Combos de Lavado*
🍔 *5. Menú del Bar*
📍 *6. Ubicación y Horarios*
💬 *7. Agente Humano*

💡 *Escribe el número de tu opción:*`;
  }

  isPositiveConfirmation(message) {
    return ['sí', 'si', 'yes', 'confirmo', 'correcto', 'ok'].some(word => 
      message.includes(word)
    );
  }

  looksLikePhoneNumber(message) {
    const digits = message.replace(/\D/g, '');
    return digits.length >= 10;
  }

  extractNumber(message) {
    const match = message.match(/\b\d+\b/);
    return match ? parseInt(match[0]) : null;
  }

  isValidDate(dateString) {
    const pattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    return pattern.test(dateString);
  }

  isValidTime(timeString) {
    const timeRegex = /^(0?[8-9]|1[0-7]):[0-5][0-9]\s?(AM|PM|am|pm)$/;
    return timeRegex.test(timeString.trim());
  }

  parseDate(dateString) {
    const parts = dateString.split('/');
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }

  formatVehicleSize(size) {
    const sizes = {
      'small': 'Pequeño 🚗',
      'medium': 'Mediano 🚙', 
      'large': 'Grande 🚐'
    };
    return sizes[size] || size;
  }
}

// Exportar la clase
module.exports = ReservationService;