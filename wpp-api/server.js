/**
 * wpp-api/server.js
 * Microserviço para envio de mensagens WhatsApp via Baileys.
 *
 * Rotas disponíveis:
 *   GET  /status         → Retorna o status da sessão WhatsApp
 *   GET  /qrcode         → Página HTML com QR Code para escanear no browser
 *   POST /send           → Envia texto (e opcionalmente imagem) para um número
 *   POST /send-group     → Envia texto (e opcionalmente imagem) para um grupo
 *
 * A sessão é salva no Supabase Storage (bucket: baileys-auth) e restaurada
 * automaticamente a cada reinício do servidor.
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const qrcode  = require('qrcode-terminal');
const QRCode  = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.WPP_PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer — salva uploads temporários em wpp-api/tmp/
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tmpDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
        cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Supabase Storage para persistência da sessão
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;
const STORAGE_BUCKET = 'baileys-auth';
const AUTH_DIR = path.join(__dirname, 'baileys-auth');

let sock          = null;
let sessionStatus = 'initializing';
let currentQR     = null;

// ──────────────────────────────────────────────────────────────
// Supabase Storage — restaura sessão salva
// ──────────────────────────────────────────────────────────────
async function downloadAuthFromSupabase() {
    if (!supabase) return;
    try {
        const { data: files, error } = await supabase.storage.from(STORAGE_BUCKET).list('');
        if (error || !files?.length) {
            console.log('📦 Nenhuma sessão salva encontrada. Aguardando QR Code...');
            return;
        }
        if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
        for (const file of files) {
            const { data } = await supabase.storage.from(STORAGE_BUCKET).download(file.name);
            if (data) {
                const buffer = Buffer.from(await data.arrayBuffer());
                fs.writeFileSync(path.join(AUTH_DIR, file.name), buffer);
            }
        }
        console.log(`✅ Sessão restaurada do Supabase (${files.length} arquivos)`);
    } catch (err) {
        console.error('⚠️  Erro ao restaurar sessão:', err.message);
    }
}

// ──────────────────────────────────────────────────────────────
// Supabase Storage — salva sessão atualizada
// ──────────────────────────────────────────────────────────────
async function uploadAuthToSupabase() {
    if (!supabase || !fs.existsSync(AUTH_DIR)) return;
    try {
        const files = fs.readdirSync(AUTH_DIR);
        for (const filename of files) {
            const filePath = path.join(AUTH_DIR, filename);
            if (fs.statSync(filePath).isFile()) {
                const content = fs.readFileSync(filePath);
                await supabase.storage.from(STORAGE_BUCKET).upload(filename, content, { upsert: true });
            }
        }
    } catch (err) {
        console.error('⚠️  Erro ao salvar sessão no Supabase:', err.message);
    }
}

// ──────────────────────────────────────────────────────────────
// Conecta ao WhatsApp via Baileys (com reconexão automática)
// ──────────────────────────────────────────────────────────────
async function connectToWhatsApp() {
    const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
    } = await import('@whiskeysockets/baileys');
    const { Boom } = await import('@hapi/boom');

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth:              state,
        printQRInTerminal: false,
        logger:            require('pino')({ level: 'silent' }),
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            sessionStatus = 'qrcode';
            currentQR     = qr;
            console.log('\n══════════════════════════════════════════════');
            console.log('📱 ESCANEIE O QR CODE NO SEU WHATSAPP:');
            console.log('   WhatsApp → Dispositivos conectados → Conectar dispositivo');
            console.log(`   Ou acesse no browser: /qrcode`);
            console.log('══════════════════════════════════════════════\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            sessionStatus = 'disconnected';
            currentQR     = null;
            const statusCode    = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`📡 Conexão encerrada (código: ${statusCode}). Reconectando: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                console.log('⚠️  Sessão encerrada (logout). Delete o bucket baileys-auth no Supabase e reinicie.');
            }
        } else if (connection === 'open') {
            sessionStatus = 'connected';
            currentQR     = null;
            console.log('✅ WhatsApp conectado com sucesso!');
        }
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        await uploadAuthToSupabase();
    });
}

// ──────────────────────────────────────────────────────────────
// GET /status
// ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({ status: sessionStatus });
});

// ──────────────────────────────────────────────────────────────
// GET /qrcode  — página HTML para escanear no browser
// ──────────────────────────────────────────────────────────────
app.get('/qrcode', async (req, res) => {
    if (sessionStatus === 'connected') {
        return res.send(`
            <!DOCTYPE html><html><head><title>WhatsApp</title></head>
            <body style="text-align:center;font-family:sans-serif;padding:60px">
                <h2>✅ WhatsApp já está conectado!</h2>
                <p>Nenhuma ação necessária.</p>
            </body></html>
        `);
    }
    if (!currentQR) {
        return res.send(`
            <!DOCTYPE html>
            <html><head><title>QR Code</title>
            <meta http-equiv="refresh" content="5">
            </head>
            <body style="text-align:center;font-family:sans-serif;padding:60px">
                <h2>⏳ Gerando QR Code...</h2>
                <p>Esta página atualiza automaticamente. Aguarde.</p>
            </body></html>
        `);
    }
    const qrImage = await QRCode.toDataURL(currentQR);
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR Code WhatsApp</title>
            <meta http-equiv="refresh" content="30">
            <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="text-align:center;font-family:sans-serif;padding:40px;background:#f0f0f0">
            <h2>📱 Escaneie o QR Code no WhatsApp</h2>
            <p>WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
            <div style="background:white;display:inline-block;padding:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
                <img src="${qrImage}" style="width:280px;height:280px">
            </div>
            <p style="color:#888"><small>Página atualiza automaticamente a cada 30 segundos</small></p>
        </body>
        </html>
    `);
});

// ──────────────────────────────────────────────────────────────
// POST /send
// ──────────────────────────────────────────────────────────────
app.post('/send', upload.single('imagem'), async (req, res) => {
    if (sessionStatus !== 'connected') {
        return res.status(503).json({ sucesso: false, erro: `WhatsApp não conectado. Status: ${sessionStatus}` });
    }

    const { numero, mensagem } = req.body;
    if (!numero || !mensagem) {
        return res.status(400).json({ sucesso: false, erro: 'Parâmetros "numero" e "mensagem" são obrigatórios.' });
    }

    let num = String(numero).replace(/\D/g, '');
    if (!num.startsWith('55')) num = '55' + num;
    const jid = num + '@s.whatsapp.net';
    const caminhoImagem = req.file ? req.file.path : null;

    try {
        if (caminhoImagem) {
            await sock.sendMessage(jid, { image: fs.readFileSync(caminhoImagem), caption: mensagem });
            fs.unlinkSync(caminhoImagem);
        } else {
            await sock.sendMessage(jid, { text: mensagem });
        }
        console.log(`✅ Mensagem enviada para ${numero}`);
        res.json({ sucesso: true, mensagem: `Mensagem enviada para ${numero}` });
    } catch (err) {
        console.error(`❌ Erro ao enviar para ${numero}:`, err.message);
        if (caminhoImagem && fs.existsSync(caminhoImagem)) fs.unlinkSync(caminhoImagem);
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /send-group
// ──────────────────────────────────────────────────────────────
app.post('/send-group', upload.single('imagem'), async (req, res) => {
    if (sessionStatus !== 'connected') {
        return res.status(503).json({ sucesso: false, erro: `WhatsApp não conectado. Status: ${sessionStatus}` });
    }

    const { group_id, mensagem } = req.body;
    if (!group_id || !mensagem) {
        return res.status(400).json({ sucesso: false, erro: 'Parâmetros "group_id" e "mensagem" são obrigatórios.' });
    }

    let jid;
    const caminhoImagem = req.file ? req.file.path : null;

    try {
        if (!group_id.includes('-') && !group_id.includes('@')) {
            console.log(`Entrando no grupo via invite code: ${group_id}`);
            jid = await sock.groupAcceptInvite(group_id);
            console.log(`JID do grupo obtido: ${jid}`);
        } else {
            jid = group_id.includes('@g.us') ? group_id : `${group_id}@g.us`;
        }

        if (caminhoImagem) {
            await sock.sendMessage(jid, { image: fs.readFileSync(caminhoImagem), caption: mensagem });
            fs.unlinkSync(caminhoImagem);
        } else {
            await sock.sendMessage(jid, { text: mensagem });
        }

        console.log(`✅ Mensagem enviada para o grupo ${group_id} (${jid})`);
        res.json({ sucesso: true, mensagem: `Mensagem enviada para o grupo ${group_id}` });
    } catch (err) {
        console.error(`❌ Erro ao enviar para o grupo ${group_id}:`, err.message);
        if (caminhoImagem && fs.existsSync(caminhoImagem)) fs.unlinkSync(caminhoImagem);
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// Inicia o servidor e conecta ao WhatsApp
// ──────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`\n🌐 API Baileys rodando na porta ${PORT}`);
    console.log(`📱 Para escanear QR Code acesse: <URL_DO_KOYEB>/qrcode`);
    console.log('────────────────────────────────────────────');
    try {
        await downloadAuthFromSupabase();
        await connectToWhatsApp();
    } catch (err) {
        sessionStatus = 'disconnected';
        console.error('❌ Falha ao iniciar Baileys:', err.message);
    }
});
