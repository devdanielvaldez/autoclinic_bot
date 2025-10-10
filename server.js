require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const WhatsAppController = require('./controllers/whatsappController');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Inicializar controlador
const whatsappController = new WhatsAppController(client);

// Evento QR
client.on('qr', (qr) => {
  console.log('🔐 Escanea este código QR con WhatsApp:');
  qrcode.generate(qr, { small: true });
});

// Evento Ready
client.on('ready', () => {
  console.log('✅ Bot de WhatsApp conectado y listo!');
  console.log('🤖 Bot: Alexa - Auto Clinic RD');
});

// Evento Mensaje
client.on('message', async (message) => {
  if (message.from === 'status@broadcast' || message.isGroup) return;
  
  console.log(`📩 Mensaje de ${message.from}: ${message.body}`);
  
  try {
    await whatsappController.handleIncomingMessage({
      from: message.from,
      body: message.body,
      senderName: message._data?.notifyName || 'Cliente'
    });
  } catch (error) {
    console.error('❌ Error:', error);
  }
});

// Rutas de salud
app.get('/', (req, res) => {
  res.json({ status: 'online', service: 'Auto Clinic WhatsApp Bot' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', bot: client.info ? 'connected' : 'disconnected' });
});

// Inicializar
async function startBot() {
  try {
    console.log('🚀 Iniciando Bot de Auto Clinic RD...');
    await client.initialize();
    
    app.listen(PORT, () => {
      console.log(`🌐 Servidor en puerto ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

startBot();