/**
 * wpp-api/server.js
 * Microserviço headless para envio de mensagens WhatsApp via WPPConnect.
 *
 * Rotas disponíveis:
 *   GET  /status         → Retorna o status da sessão WhatsApp
 *   POST /send           → Envia texto (e opcionalmente imagem) para um número
 *   POST /send-group     → Envia texto (e opcionalmente imagem) para um grupo
 */

const express = require('express');
const wppconnect = require('@wppconnect-team/wppconnect');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.WPP_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração do multer para receber imagens em memória
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

// Estado global do cliente WPP
let wppClient = null;
let sessionStatus = 'initializing'; // initializing | qrcode | connected | disconnected

// ──────────────────────────────────────────────
// Inicializa o WPPConnect e cria o cliente
// ──────────────────────────────────────────────
async function initWPP() {
    console.log('🚀 Iniciando WPPConnect...');

    wppClient = await wppconnect.create({
        session: 'birthday-bot',          // Nome da sessão (salva tokens localmente)
        folderNameToken: 'wpp-tokens',    // Pasta onde a sessão é salva
        catchQR: (base64Qr, asciiQR, attempts) => {
            sessionStatus = 'qrcode';
            console.log('\n══════════════════════════════════════════════');
            console.log('📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
            console.log('══════════════════════════════════════════════\n');
            console.log(asciiQR);
            console.log(`\n⏳ Tentativa ${attempts}/5 — Aguardando leitura...\n`);
        },
        statusFind: (statusSession, session) => {
            console.log(`📡 Status da sessão [${session}]: ${statusSession}`);
            if (statusSession === 'inChat' || statusSession === 'isLogged') {
                sessionStatus = 'connected';
            } else if (statusSession === 'notLogged' || statusSession === 'browserClose') {
                sessionStatus = 'disconnected';
            }
        },
        headless: true,          // Sem interface gráfica
        useChrome: false,        // Usa Chromium embutido
        autoClose: 0,            // Não fecha automaticamente
        disableWelcome: true,    // Sem mensagem de boas-vindas no terminal
        logQR: false,            // Já exibimos manualmente no catchQR
    });

    sessionStatus = 'connected';
    console.log('✅ WhatsApp conectado com sucesso!');
}

// ──────────────────────────────────────────────
// Helper: formata número para padrão internacional
// ──────────────────────────────────────────────
function formatarNumero(numero) {
    let num = String(numero).replace(/\D/g, ''); // Remove tudo que não é dígito
    if (!num.startsWith('55')) {
        num = '55' + num; // Adiciona DDI Brasil
    }
    return num + '@c.us'; // Formato exigido pelo WPPConnect
}

// ──────────────────────────────────────────────
// Rota: GET /status
// ──────────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({ status: sessionStatus });
});

// ──────────────────────────────────────────────
// Rota: POST /send
// Body: { numero: "11999998888", mensagem: "Feliz aniversário!" }
// Form-data: numero, mensagem, imagem (arquivo, opcional)
// ──────────────────────────────────────────────
app.post('/send', upload.single('imagem'), async (req, res) => {
    if (sessionStatus !== 'connected') {
        return res.status(503).json({ sucesso: false, erro: `WhatsApp não conectado. Status: ${sessionStatus}` });
    }

    const { numero, mensagem } = req.body;
    if (!numero || !mensagem) {
        return res.status(400).json({ sucesso: false, erro: 'Parâmetros "numero" e "mensagem" são obrigatórios.' });
    }

    const chatId = formatarNumero(numero);
    const caminhoImagem = req.file ? req.file.path : null;

    try {
        if (caminhoImagem) {
            // Envia imagem com legenda (caption)
            await wppClient.sendImage(chatId, caminhoImagem, 'aniversario', mensagem);
            fs.unlinkSync(caminhoImagem); // Remove arquivo temporário após envio
        } else {
            // Envia apenas texto
            await wppClient.sendText(chatId, mensagem);
        }

        console.log(`✅ Mensagem enviada para ${numero}`);
        res.json({ sucesso: true, mensagem: `Mensagem enviada para ${numero}` });
    } catch (err) {
        console.error(`❌ Erro ao enviar para ${numero}:`, err.message);
        if (caminhoImagem && fs.existsSync(caminhoImagem)) fs.unlinkSync(caminhoImagem);
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// ──────────────────────────────────────────────
// Rota: POST /send-group
// Body: { group_id: "ABC123", mensagem: "Feliz aniversário!" }
// Form-data: group_id, mensagem, imagem (arquivo, opcional)
// ──────────────────────────────────────────────
app.post('/send-group', upload.single('imagem'), async (req, res) => {
    if (sessionStatus !== 'connected') {
        return res.status(503).json({ sucesso: false, erro: `WhatsApp não conectado. Status: ${sessionStatus}` });
    }

    const { group_id, mensagem } = req.body;
    if (!group_id || !mensagem) {
        return res.status(400).json({ sucesso: false, erro: 'Parâmetros "group_id" e "mensagem" são obrigatórios.' });
    }

    let chatId = group_id;
    let caminhoImagem = req.file ? req.file.path : null;

    try {
        // Se o group_id não contiver '-' nem '@', assumimos que é um invite code (ex: EasoVkTTHC449sD7SJR4wo)
        if (!group_id.includes('-') && !group_id.includes('@')) {
            console.log(`Tentando entrar no grupo via invite code: ${group_id}`);
            const joinResult = await wppClient.joinGroup(group_id);
            console.log("Resultado ao entrar no grupo:", joinResult);
            
            if (typeof joinResult === 'string') {
                chatId = joinResult;
            } else if (joinResult && joinResult.id) {
                chatId = typeof joinResult.id === 'string' ? joinResult.id : (joinResult.id._serialized || joinResult.id);
            } else if (joinResult && joinResult.groupId) {
                chatId = joinResult.groupId;
            } else if (joinResult && joinResult.wid) {
                chatId = joinResult.wid;
            } else {
                // Caso o formato do retorno seja diferente, tenta parsear ou continua assumindo que deu certo
                chatId = `${group_id}@g.us`; 
            }
        } else {
            // Se já tem o formato de WID, apenas garante o @g.us
            chatId = group_id.includes('@g.us') ? group_id : `${group_id}@g.us`;
        }

        if (caminhoImagem) {
            await wppClient.sendImage(chatId, caminhoImagem, 'aniversario', mensagem);
            fs.unlinkSync(caminhoImagem);
        } else {
            await wppClient.sendText(chatId, mensagem);
        }

        console.log(`✅ Mensagem enviada para o grupo ${group_id} (chatId: ${chatId})`);
        res.json({ sucesso: true, mensagem: `Mensagem enviada para o grupo ${group_id}` });
    } catch (err) {
        console.error(`❌ Erro ao enviar para o grupo ${group_id}:`, err.message);
        if (caminhoImagem && fs.existsSync(caminhoImagem)) fs.unlinkSync(caminhoImagem);
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// ──────────────────────────────────────────────
// Inicia o servidor e depois conecta o WPP
// ──────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`\n🌐 API WPPConnect rodando em http://localhost:${PORT}`);
    console.log('────────────────────────────────────────────');
    try {
        await initWPP();
    } catch (err) {
        sessionStatus = 'disconnected';
        console.error('❌ Falha ao iniciar WPPConnect:', err.message);
    }
});
