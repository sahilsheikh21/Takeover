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
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');
const WORKSPACE_INBOX_DIR = path.join(WORKSPACE_DIR, 'inbox');

const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.yml', '.yaml', '.csv',
]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function getOpenAIApiKey() {
  const settings = loadSettings();
  return settings?.providers?.openai?.apiKey || process.env.OPENAI_API_KEY || '';
}

function sanitizeFileName(name) {
  return String(name || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function downloadTelegramFileBuffer(fileId) {
  const fileLink = await bot.getFileLink(fileId);
  const res = await fetch(fileLink);
  if (!res.ok) {
    throw new Error(`Failed to download Telegram file: ${res.status}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function transcribeVoiceNote(voiceBuffer) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key missing for voice transcription.');
  }

  const form = new FormData();
  form.append('file', new Blob([voiceBuffer], { type: 'audio/ogg' }), 'voice.ogg');
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Transcription failed.');
  }

  return String(data?.text || '').trim();
}

async function synthesizeVoiceReply(text) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return null;
  }

  const input = String(text || '').trim().slice(0, 3000);
  if (!input) return null;

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input,
      format: 'opus',
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`TTS failed: ${detail.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function persistIncomingDocument(document) {
  ensureDir(WORKSPACE_INBOX_DIR);
  const fileBuffer = await downloadTelegramFileBuffer(document.file_id);
  const safeName = sanitizeFileName(document.file_name || `document_${Date.now()}.bin`);
  const destPath = path.join(WORKSPACE_INBOX_DIR, safeName);
  fs.writeFileSync(destPath, fileBuffer);

  const ext = path.extname(safeName).toLowerCase();
  let preview = '';
  if (TEXT_FILE_EXTENSIONS.has(ext) && fileBuffer.length <= 1_000_000) {
    preview = fileBuffer.toString('utf8').slice(0, 3000);
  }

  return {
    path: destPath,
    relativePath: path.relative(WORKSPACE_DIR, destPath).replace(/\\/g, '/'),
    preview,
  };
}

async function sendGeneratedMedia(chatId, generatedMedia) {
  if (!Array.isArray(generatedMedia)) return;

  for (const media of generatedMedia.slice(0, 3)) {
    if (!media || !media.filepath) continue;
    if (!fs.existsSync(media.filepath)) continue;

    try {
      if (media.type === 'image') {
        await bot.sendPhoto(chatId, media.filepath, {
          caption: media.prompt ? `Generated image: ${media.prompt}` : 'Generated image',
        });
      } else {
        await bot.sendDocument(chatId, media.filepath, {
          caption: 'Generated media',
        });
      }
    } catch (error) {
      console.error('[Telegram Bot] Failed to send generated media:', error.message || error);
    }
  }
}

function buildApprovalKeyboard(approvals) {
  const rows = [];
  for (const approval of approvals.slice(0, 4)) {
    rows.push([
      { text: `✅ Approve ${approval.toolName}`, callback_data: `approval_ap_${approval.id}` },
      { text: `❌ Deny`, callback_data: `approval_dn_${approval.id}` },
    ]);
  }
  return { reply_markup: { inline_keyboard: rows } };
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

// ─── Keyboard Menus ───────────────────────────────────────────────────────────
const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🛠 Settings', callback_data: 'cmd_settings' }, { text: '⚡️ Skills', callback_data: 'cmd_skills' }],
      [{ text: '📸 Screenshot', callback_data: 'cmd_screenshot' }, { text: '📋 Active Jobs', callback_data: 'cmd_jobs' }],
      [{ text: '✅ Approvals', callback_data: 'cmd_jobs' }],
      [{ text: '🔄 Restart Agent', callback_data: 'cmd_restart' }]
    ]
  }
};

// ─── Verification ─────────────────────────────────────────────────────────────
function verifyIdentity(chatId, userId, userName) {
  const normalizedChatId = String(chatId || '');
  const normalizedUserId = String(userId || '').trim();
  const configuredUserId = String(config.allowedUserId || '').trim();

  if (!configuredUserId) {
    sendSafeMessage(
      normalizedChatId,
      `Unauthorized. Configure Allowed User ID in Takeover settings first. Your Telegram User ID: ${normalizedUserId || 'unknown'}.`
    );
    return false;
  }

  if (normalizedUserId !== configuredUserId) {
    sendSafeMessage(
      normalizedChatId,
      `Unauthorized Telegram user. Allowed User ID is ${configuredUserId}. Your User ID is ${normalizedUserId || 'unknown'}.`
    );
    return false;
  }

  const resolvedName = userName || 'User';
  if (
    config.pairedChatId !== normalizedChatId ||
    config.pairedUserId !== normalizedUserId ||
    config.pairedUserName !== resolvedName
  ) {
    config.pairedChatId = normalizedChatId;
    config.pairedUserId = normalizedUserId;
    config.pairedUserName = resolvedName;
    saveConfig(config);
  }

  return true;
}

function verifyUser(msg) {
  return verifyIdentity(
    msg.chat?.id,
    msg.from?.id,
    msg.from?.username || msg.from?.first_name || 'User'
  );
}

function verifyCallbackUser(query) {
  if (!query?.message || !query?.from) return false;
  return verifyIdentity(
    query.message.chat.id,
    query.from.id,
    query.from.username || query.from.first_name || 'User'
  );
}

// ─── Command Handlers ─────────────────────────────────────────────────────────
bot.onText(/^\/start($| )/, (msg) => {
  const chatId = msg.chat.id;
  if (verifyUser(msg)) {
    sendSafeMessage(chatId, 'Active and connected to Takeover Desktop. What can I do for you today?', MAIN_MENU);
  } else {
    sendSafeMessage(chatId, `Welcome to Takeover AI. Your Telegram User ID is ${msg.from?.id || 'unknown'}. Add this ID in Desktop Settings -> Telegram -> Allowed User ID.`);
  }
});

bot.onText(/^\/whoami($| )/, (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id || 'unknown');
  const configuredUserId = String(config.allowedUserId || '').trim() || '(not set)';
  const pairedChatId = String(config.pairedChatId || '(none)');

  sendSafeMessage(
    chatId,
    `Telegram identity\n\nUser ID: ${userId}\nConfigured Allowed User ID: ${configuredUserId}\nPaired Chat ID: ${pairedChatId}`
  );
});

bot.onText(/^\/pair\s+(.+)$/, (msg, match) => {
  void match;
  sendSafeMessage(
    msg.chat.id,
    'Pairing code is removed. Use Allowed User ID in Takeover Settings to authorize this Telegram account.'
  );
});

bot.onText(/^\/approvals($| )/, async (msg) => {
  if (!verifyUser(msg)) return;
  const chatId = msg.chat.id.toString();

  try {
    const res = await fetch(`${API_BASE}/approvals?telegramChatId=${encodeURIComponent(chatId)}&status=pending`);
    const data = await res.json();

    if (!data.success || !Array.isArray(data.approvals) || data.approvals.length === 0) {
      sendSafeMessage(chatId, 'No pending approvals right now.');
      return;
    }

    sendSafeMessage(chatId, 'Pending approval requests:', buildApprovalKeyboard(data.approvals));
  } catch (error) {
    sendSafeMessage(chatId, `Failed to load approvals: ${error.message}`);
  }
});

bot.onText(/^\/sendfile\s+(.+)$/, async (msg, match) => {
  if (!verifyUser(msg)) return;
  const chatId = msg.chat.id;
  const requestedPath = String(match?.[1] || '').trim();
  if (!requestedPath) {
    sendSafeMessage(chatId, 'Usage: /sendfile <relative_workspace_path>');
    return;
  }

  try {
    const absPath = path.resolve(WORKSPACE_DIR, requestedPath);
    if (!absPath.startsWith(path.resolve(WORKSPACE_DIR))) {
      sendSafeMessage(chatId, 'Path escape blocked.');
      return;
    }
    if (!fs.existsSync(absPath)) {
      sendSafeMessage(chatId, 'File not found in workspace.');
      return;
    }

    await bot.sendDocument(chatId, absPath, {
      caption: `Workspace file: ${requestedPath}`,
    });
  } catch (error) {
    sendSafeMessage(chatId, `Failed to send file: ${error.message}`);
  }
});

bot.on('callback_query', async (query) => {
  if (!query.message) return;
  if (!verifyCallbackUser(query)) return;
  const data = query.data || '';
  const chatId = query.message.chat.id;

  if (data.startsWith('approval_ap_') || data.startsWith('approval_dn_')) {
    const action = data.startsWith('approval_ap_') ? 'approve' : 'deny';
    const approvalId = data.replace('approval_ap_', '').replace('approval_dn_', '');

    try {
      const res = await fetch(`${API_BASE}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: approvalId,
          decisionBy: query.from?.username || query.from?.first_name || 'telegram-user',
        }),
      });

      const payload = await res.json();
      if (payload.success) {
        await bot.answerCallbackQuery(query.id, { text: action === 'approve' ? 'Approved' : 'Denied' });
        sendSafeMessage(chatId, action === 'approve'
          ? 'Approval recorded. Re-run your request to continue with the approved tool.'
          : 'Approval denied. The tool will remain blocked.');
      } else {
        await bot.answerCallbackQuery(query.id, { text: `Error: ${payload.error || 'Failed'}` });
      }
    } catch (error) {
      await bot.answerCallbackQuery(query.id, { text: `Error: ${error.message}` });
    }

    return;
  }

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
  } else if (data === 'cmd_jobs') {
    try {
      const res = await fetch(`${API_BASE}/approvals?telegramChatId=${encodeURIComponent(String(chatId))}&status=pending`);
      const payload = await res.json();
      if (payload.success && Array.isArray(payload.approvals) && payload.approvals.length > 0) {
        sendSafeMessage(chatId, `Pending approvals: ${payload.approvals.length}`, buildApprovalKeyboard(payload.approvals));
      } else {
        sendSafeMessage(chatId, 'No pending approvals or active jobs.');
      }
    } catch (error) {
      sendSafeMessage(chatId, `Failed to fetch jobs: ${error.message}`);
    }
  } else {
    bot.answerCallbackQuery(query.id, { text: 'Not implemented yet' });
  }
});

// ─── Main Message Handler ─────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  // Ignore commands like /start
  if (msg.text && msg.text.startsWith('/')) return;
  
  if (!verifyUser(msg)) return;
  const chatId = msg.chat.id.toString();

  // Show typing indicator
  bot.sendChatAction(chatId, 'typing');

  try {
    let messageText = msg.text || '';
    let imageDataUri = undefined;
    let cameFromVoice = false;

    // Handle Photos
    if (msg.photo && msg.photo.length > 0) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      const photoBuffer = await downloadTelegramFileBuffer(largestPhoto.file_id);
      imageDataUri = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;
      messageText = msg.caption || 'Analyze this image';
    }

    // Handle Voice
    if (msg.voice) {
      cameFromVoice = true;
      sendSafeMessage(chatId, 'Transcribing your voice note...');
      const voiceBuffer = await downloadTelegramFileBuffer(msg.voice.file_id);
      const transcript = await transcribeVoiceNote(voiceBuffer);
      if (!transcript) {
        sendSafeMessage(chatId, 'I could not transcribe that voice note. Please try again.');
        return;
      }
      messageText = transcript;
      sendSafeMessage(chatId, `Transcribed: ${transcript.slice(0, 300)}`);
    }

    // Handle Documents
    if (msg.document) {
      const doc = await persistIncomingDocument(msg.document);
      const previewBlock = doc.preview
        ? `\n\nPreview:\n${doc.preview}`
        : '';
      messageText = `${msg.caption || 'Analyze this uploaded file.'}\n\nWorkspace file: ${doc.relativePath}${previewBlock}`;
      sendSafeMessage(chatId, `Saved file to workspace: ${doc.relativePath}`);
    }

    if (!messageText) return;

    sendSafeMessage(chatId, 'Agent is thinking...');

    const res = await fetch(`${API_BASE}/chat/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageText,
        imageDataUri,
        telegramChatId: chatId,
        telegramUserName: msg.from.username
      })
    });

    if (res.ok) {
        const data = await res.json();
        sendSafeMessage(chatId, data.response || 'Success');
        await sendGeneratedMedia(chatId, data.generatedMedia);

        if (Array.isArray(data.blockedTools) && data.blockedTools.length > 0) {
          const blockedSummary = data.blockedTools
            .slice(0, 4)
            .map((entry) => `- ${entry.name}: ${entry.reason}`)
            .join('\n');
          sendSafeMessage(chatId, `Some actions were blocked by policy:\n${blockedSummary}`);
        }

        if (Array.isArray(data.pendingApprovals) && data.pendingApprovals.length > 0) {
          sendSafeMessage(chatId, 'Action required: approve or deny these tool requests.', buildApprovalKeyboard(data.pendingApprovals));
        }

        if (typeof data.steps === 'number' || typeof data.totalToolCalls === 'number') {
          const steps = Number(data.steps || 0);
          const toolCalls = Number(data.totalToolCalls || 0);
          sendSafeMessage(chatId, `Run summary: ${steps} step(s), ${toolCalls} tool call(s).`);
        }

        if (cameFromVoice && data.response && config.voiceReplies !== false) {
          try {
            await bot.sendChatAction(chatId, 'record_voice');
            const voiceReply = await synthesizeVoiceReply(data.response);
            if (voiceReply) {
              await bot.sendVoice(chatId, voiceReply, { caption: 'Voice response' });
            }
          } catch (voiceErr) {
            console.error('[Telegram Bot] Voice reply failed:', voiceErr.message || voiceErr);
          }
        }
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

