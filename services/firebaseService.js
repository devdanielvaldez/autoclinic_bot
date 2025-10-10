const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc,
  setDoc,
  query, 
  where,
  orderBy,
  limit,
  Timestamp
} = require('firebase/firestore');

class FirebaseService {
  constructor() {
    const firebaseConfig = {
      apiKey: "AIzaSyB5KzoWNSrgqlzPXbG97Uz25KhOXjsTWm0",
      authDomain: "myride-v2-prod.firebaseapp.com",
      projectId: "myride-v2-prod",
      storageBucket: "myride-v2-prod.appspot.com",
      messagingSenderId: "865989544609",
      appId: "1:865989544609:web:a1aa3a1f3303eec028bee0"
    };

    this.app = initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);
  }

  // Obtener información de la empresa
  async getCompanyInfo() {
    try {
      const docRef = doc(this.db, 'companyInfo', 'autoclinic');
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      console.error('Error obteniendo companyInfo:', error);
      return null;
    }
  }

  // Obtener paquetes de lavado
  async getWashPackages() {
    try {
      const querySnapshot = await getDocs(collection(this.db, 'washPackages'));
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error obteniendo washPackages:', error);
      return [];
    }
  }

  // Obtener ítems del menú
  async getMenuItems() {
    try {
      const querySnapshot = await getDocs(collection(this.db, 'menuItems'));
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error obteniendo menuItems:', error);
      return [];
    }
  }

  // Obtener categorías del menú
  async getMenuCategories() {
    try {
      const q = query(
        collection(this.db, 'menuCategories'), 
        where('active', '==', true),
        orderBy('order')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error obteniendo menuCategories:', error);
      return [];
    }
  }

  // Obtener reservaciones por número de teléfono
  async getBookingsByPhoneNumber(phone) {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phone);
      
      const q = query(
        collection(this.db, 'washBookings'),
        where('customerPhone', '==', normalizedPhone),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error obteniendo bookings:', error);
      return [];
    }
  }

  // Crear reservación
  async createReservation(reservationData) {
    try {
      const confirmationNumber = this.generateConfirmationNumber();
      
      const reservation = {
        ...reservationData,
        confirmationNumber,
        status: 'pending',
        createdAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(this.db, 'washBookings'), reservation);
      
      return {
        id: docRef.id,
        ...reservation,
        confirmationNumber
      };
    } catch (error) {
      console.error('Error creando reservación:', error);
      throw error;
    }
  }

  // Gestión del estado de reservación
  async getReservationState(phone) {
    try {
      const docRef = doc(this.db, 'reservationStates', phone);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      return null;
    }
  }

  async saveReservationState(phone, state) {
    try {
      const docRef = doc(this.db, 'reservationStates', phone);
      await setDoc(docRef, {
        ...state,
        updatedAt: Timestamp.now()
      }, { merge: true });
    } catch (error) {
      console.error('Error guardando reservationState:', error);
    }
  }

  async clearReservationState(phone) {
    try {
      const docRef = doc(this.db, 'reservationStates', phone);
      await setDoc(docRef, {
        step: null,
        data: {},
        clearedAt: Timestamp.now()
      }, { merge: true });
    } catch (error) {
      console.error('Error limpiando reservationState:', error);
    }
  }

  // Gestión de conversaciones - FUNCIÓN FALTANTE
  async saveConversation(phone, message, isUser, userName = null) {
    try {
      await addDoc(collection(this.db, 'conversations'), {
        phone: this.normalizePhoneNumber(phone),
        message,
        isUser,
        userName,
        timestamp: Timestamp.now()
      });
    } catch (error) {
      console.error('Error guardando conversación:', error);
    }
  }

  // Obtener historial de conversación - FUNCIÓN FALTANTE
  async getConversationHistory(phone, limitCount = 10) {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phone);
      const q = query(
        collection(this.db, 'conversations'),
        where('phone', '==', normalizedPhone),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs
        .map(doc => doc.data())
        .reverse(); // Ordenar de más antiguo a más reciente
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      return [];
    }
  }

  // Gestión de chat pausado
  async isChatPaused(phone) {
    try {
      const docRef = doc(this.db, 'chatStates', phone);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data().paused === true : false;
    } catch (error) {
      return false;
    }
  }

  async pauseChat(phone) {
    try {
      const docRef = doc(this.db, 'chatStates', phone);
      await setDoc(docRef, {
        paused: true,
        pausedAt: Timestamp.now()
      }, { merge: true });
    } catch (error) {
      console.error('Error pausando chat:', error);
    }
  }

  async resumeChat(phone) {
    try {
      const docRef = doc(this.db, 'chatStates', phone);
      await setDoc(docRef, {
        paused: false,
        resumedAt: Timestamp.now()
      }, { merge: true });
    } catch (error) {
      console.error('Error resumiendo chat:', error);
    }
  }

  // Métodos auxiliares
  normalizePhoneNumber(phone) {
    return phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '$1');
  }

  generateConfirmationNumber() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `AC${timestamp}${random}`.toUpperCase();
  }

  isAdminCommand(message) {
    return ['**', '***', '!!pause', '!!resume'].includes(message.trim());
  }
}

// Exportar una instancia, no la clase
module.exports = new FirebaseService();