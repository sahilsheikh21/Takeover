// Takeover Telegram Bot Service (runs as separate process)
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const os = require('os');

if (typeof fetch !== 'function') {
  console.error('[Telegram Bot] Global fetch is not available. Use Node.js 18+ runtime.');
  process.exit(1);
}

// ─── Environment & Config ───────────────────────────────────────────────────
const DATA_DIR = process.env.TAKEOVER_DATA_DIR || path.join(os.homedir(), '.takeover-data');
const PORT = process.env.PORT || 3000;
const API_BASE = `http://localhost:${PORT}/api`;

const TELEGRAM_CONFIG_FILE = path.join(DATA_DIR, 'integrations', 'telegram.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadConfig() {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return { enabled: false };
}

function saveConfig(config) {
  ensureDir(path.dirname(TELEGRAM_CONFIG_FILE));
  fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function cleanForTelegram(text) {
  if (!text) return '';
  return String(text)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sendSafeMessage(chatId, text, options = undefined) {
  const cleaned = cleanForTelegram(text);
  if (!cleaned) return;
  return bot.sendMessage(chatId, cleaned, options).catch((err) => {
    console.error('[Telegram Bot] sendMessage failed:', err.message || err);
  });
}

let config = loadConfig();
if (!config.enabled || !config.botToken) {
  console.log('[Telegram Bot] Bot is disabled or missing token in config. Exiting.');
  process.exit(0); // Exit cleanly, let main process manage it
}

// ─── Bot Initialization ───────────────────────────────────────────────────────
console.log(`[Telegram Bot] Starting with Token: ${config.botToken.substring(0, 5)}...`);
const bot = new TelegramBot(config.botToken, { polling: true });

// Ensure we have a pairing code
if (!config.pairingCode) {
  config.pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  saveConfig(config);
  console.log(`[Telegram Bot] Generated new pairing code: ${config.pairingCode}`);
}

// ─── Keyboard Menus ───────────────────────────────────────────────────────────
const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🛠 Settings', callback_data: 'cmd_settings' }, { text: '⚡️ Skills', callback_data: 'cmd_skills' }],
      [{ text: '📸 Screenshot', callback_data: 'cmd_screenshot' }, { text: '📋 Active Jobs', callback_data: 'cmd_jobs' }],
      [{ text: '🔄 Restart Agent', callback_data: 'cmd_restart' }]
    ]
  }
};

// ─── Verification ─────────────────────────────────────────────────────────────
function verifyUser(msg) {
  const chatId = msg.chat.id.toString();
  if (!config.pairedChatId) {
    if (msg.text && msg.text.startsWith('/pair ')) {
      const code = msg.text.split(' ')[1];
      if (code === config.pairingCode) {
        config.pairedChatId = chatId;
        config.pairedUserName = msg.from.username || msg.from.first_name || 'User';
        saveConfig(config);
        sendSafeMessage(chatId, 'Successfully paired with Takeover Desktop Agent.', MAIN_MENU);
        return true;
      } else {
        sendSafeMessage(chatId, 'Invalid pairing code.');
      }
    } else {
      sendSafeMessage(chatId, 'Unauthorized. Please pair your device using: /pair <code_from_dashboard>');
    }
    return false;
  }
  
  if (config.pairedChatId !== chatId) {
    sendSafeMessage(chatId, 'This bot is privately paired to another user.');
    return false;
  }
  
  return true;
}

// ─── Command Handlers ─────────────────────────────────────────────────────────
bot.onText(/^\/start($| )/, (msg) => {
  const chatId = msg.chat.id.toString();
  if (config.pairedChatId === chatId) {
    sendSafeMessage(chatId, 'Active and connected to Takeover Desktop. What can I do for you today?', MAIN_MENU);
  } else {
    sendSafeMessage(chatId, 'Welcome to Takeover AI. To connect to your desktop agent, use /pair <code_from_dashboard>.');
  }
});

bot.on('callback_query', async (query) => {
  if (!query.message) return;
  if (!verifyUser(query.message)) return;
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data === 'cmd_settings') {
    let settingsStr = "Settings unavailable";
    try {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      settingsStr = `Active Provider: ${s.activeProvider}\nSafe Mode: ${s.safeMode ? 'Enabled' : 'Disabled'}\nPersona: ${s.persona}`;
    } catch {}
    sendSafeMessage(chatId, `Current Settings\n\n${settingsStr}\n\n(Edit full settings in Desktop UI)`);
  } else if (data === 'cmd_skills') {
     sendSafeMessage(chatId, 'Change skills in the Web Dashboard via the Skills menu.');
  } else if (data === 'cmd_screenshot') {
    sendSafeMessage(chatId, 'Taking screenshot... (Feature in development)');
  } else {
    bot.answerCallbackQuery(query.id, { text: 'Not implemented yet' });
  }
});

// ─── Main Message Handler ─────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  // Ignore commands like /start or /pair
  if (msg.text && msg.text.startsWith('/')) return;
  
  if (!verifyUser(msg)) return;
  const chatId = msg.chat.id.toString();

  // Show typing indicator
  bot.sendChatAction(chatId, 'typing');

  try {
    let messageText = msg.text || '';
    let imageDataUri = undefined;

    // Handle Photos
    if (msg.photo && msg.photo.length > 0) {
      sendSafeMessage(chatId, 'Attempting to process image via Vision provider...');
      messageText = msg.caption || 'Analyze this image';
    }
    
    // Handle Voice
    if (msg.voice) {
      sendSafeMessage(chatId, 'Attempting to process voice via Whisper provider...');
      return; 
    }

    if (!messageText) return;

    sendSafeMessage(chatId, 'Agent is thinking...');

    const res = await fetch(`${API_BASE}/chat/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageText,
        telegramChatId: chatId,
        telegramUserName: msg.from.username
      })
    });

    if (res.ok) {
        const data = await res.json();
        sendSafeMessage(chatId, data.response || 'Success');
    } else {
       sendSafeMessage(chatId, 'API error: The agent is not running or unreachable.');
    }

  } catch (error) {
    console.error('[Telegram Bot] Error processing message:', error);
    sendSafeMessage(chatId, `Error processing message: ${error.message}`);
  }
});

console.log('[Telegram Bot] Polling started.');

// Handle graceful shutdown
process.once('SIGINT', () => bot.stopPolling());
process.once('SIGTERM', () => bot.stopPolling());

