/**
 * wpp-api/server.js
 * Microserviço para envio de mensagens WhatsApp via Baileys.
 *
 * Rotas disponíveis:
 *   GET  /status         → Retorna o status da sessão WhatsApp
 *   POST /send           → Envia texto (e opcionalmente imagem) para um número
 *   POST /send-group     → Envia texto (e opcionalmente imagem) para um grupo
 *
 * Primeira execução: exibe QR Code no terminal para escanear com o WhatsApp.
 * A sessão é salva em baileys-auth/ e reutilizada automaticamente nas próximas execuções.
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const qrcode  = require('qrcode-terminal');

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

let sock          = null;
let sessionStatus = 'initializing'; // initializing | qrcode | connected | disconnected

// ──────────────────────────────────────────────────────────────
// Conecta ao WhatsApp via Baileys (com reconexão automática)
// ──────────────────────────────────────────────────────────────
async function connectToWhatsApp() {
    // Baileys é ESM — usamos import() dinâmico para compatibilidade com CommonJS
    const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
    } = await import('@whiskeysockets/baileys');
    const { Boom } = await import('@hapi/boom');

    const { state, saveCreds } = await useMultiFileAuthState(
        path.join(__dirname, 'baileys-auth')
    );
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth:               state,
        printQRInTerminal:  false,          // exibimos manualmente abaixo
        logger:             require('pino')({ level: 'silent' }),
    });

    // Eventos de conexão
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            sessionStatus = 'qrcode';
            console.log('\n══════════════════════════════════════════════');
            console.log('📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
            console.log('   WhatsApp → Dispositivos conectados → Conectar dispositivo');
            console.log('══════════════════════════════════════════════\n');
            qrcode.generate(qr, { small: true });
            console.log('\n⏳ Aguardando leitura...\n');
        }

        if (connection === 'close') {
            sessionStatus = 'disconnected';
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`📡 Conexão encerrada (código: ${statusCode}). Reconectando: ${shouldReconnect}`);

            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                console.log('⚠️  Sessão encerrada (logout). Delete a pasta baileys-auth/ e reinicie para reconectar.');
            }
        } else if (connection === 'open') {
            sessionStatus = 'connected';
            console.log('✅ WhatsApp conectado com sucesso!');
        }
    });

    // Salva credenciais sempre que atualizadas
    sock.ev.on('creds.update', saveCreds);
}

// ──────────────────────────────────────────────────────────────
// GET /status
// ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({ status: sessionStatus });
});

// ──────────────────────────────────────────────────────────────
// POST /send
// Body JSON: { numero: "11999998888", mensagem: "Feliz aniversário!" }
// Form-data: numero, mensagem, imagem (arquivo, opcional)
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
    const jid = num + '@s.whatsapp.net'; // formato Baileys para contatos

    const caminhoImagem = req.file ? req.file.path : null;

    try {
        if (caminhoImagem) {
            await sock.sendMessage(jid, {
                image:   fs.readFileSync(caminhoImagem),
                caption: mensagem,
            });
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
// Body JSON: { group_id: "XXXX@g.us", mensagem: "Feliz aniversário!" }
// Form-data: group_id, mensagem, imagem (arquivo, opcional)
// group_id aceita:
//   - JID completo: "1234567890-1234567890@g.us"
//   - Apenas números: "1234567890-1234567890" (adiciona @g.us automaticamente)
//   - Invite code:   "EasoVkTTHC449sD7SJR4wo" (entra no grupo via link)
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
            // Parece um invite code — entra no grupo e obtém o JID real
            console.log(`Entrando no grupo via invite code: ${group_id}`);
            jid = await sock.groupAcceptInvite(group_id);
            console.log(`JID do grupo obtido: ${jid}`);
        } else {
            jid = group_id.includes('@g.us') ? group_id : `${group_id}@g.us`;
        }

        if (caminhoImagem) {
            await sock.sendMessage(jid, {
                image:   fs.readFileSync(caminhoImagem),
                caption: mensagem,
            });
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
// Inicia o servidor Express e depois conecta ao WhatsApp
// ──────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`\n🌐 API Baileys rodando em http://localhost:${PORT}`);
    console.log('────────────────────────────────────────────');
    try {
        await connectToWhatsApp();
    } catch (err) {
        sessionStatus = 'disconnected';
        console.error('❌ Falha ao iniciar Baileys:', err.message);
    }
});
