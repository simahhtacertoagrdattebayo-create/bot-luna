// index.js - Discord bot "Demônio" (personalidade fria, respostas via OpenRouter)

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- Config ---
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // usa a chave do OpenRouter
const IMPERADOR_USER_ID = process.env.IMPERADOR_USER_ID || null; 
const CANAL_AUTO_RESPOSTA = process.env.CANAL_AUTO_RESPOSTA || null; 
const PORT = process.env.PORT || 3000;
const COOLDOWN_MS_DEFAULT = 5000;
const COOLDOWN_MS_IMPERADOR = 2000;

if (!DISCORD_BOT_TOKEN) {
    console.error("ERRO: Defina DISCORD_BOT_TOKEN nas variáveis de ambiente.");
    process.exit(1);
}
if (!OPENAI_API_KEY) {
    console.error("ERRO: Defina OPENAI_API_KEY (sua chave do OpenRouter) nas variáveis de ambiente.");
    process.exit(1);
}

// System prompt
const SYSTEM_PROMPT = `
Você é "Demônio", uma assistente de Discord. Sua personalidade é fria, concisa e direta.
Responda com objetividade, frases curtas, sem emojis, sem desculpas desnecessárias.
Se a mensagem for claramente uma saudação simples, responda de forma curta e neutra.
Se a entrada for comando técnico ou pergunta, responda de forma útil porém seca.
Não use falas programadas, não finja servidão, não invente afeto.
Limite as respostas a ~1-5 sentenças. Seja cortês apenas quando necessário.
`;

// --- Cliente Discord ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const userCooldowns = new Map();

// 🔧 Função para chamar OpenRouter
async function askOpenAI(userMessage, userId) {
    try {
        const payload = {
            model: "meta-llama/llama-3-8b-instruct", 
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage }
            ],
            max_tokens: 250,
            temperature: 0.2,
            user: userId
        };

        const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            timeout: 30000
        });

        if (resp.data && resp.data.choices && resp.data.choices[0]) {
            return resp.data.choices[0].message.content.trim();
        } else {
            return null;
        }
    } catch (err) {
        if (err.response) {
            console.error("Erro OpenRouter:", err.response.status, err.response.data);
        } else {
            console.error("Erro OpenRouter:", err.message);
        }
        return null;
    }
}

// --- Eventos Discord ---
client.on('ready', () => {
    console.log(`Demônio (frio) online como ${client.user.tag}`);
    client.user.setActivity('quietamente observando', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.content || message.content.trim().length < 2) return;

        const isImperador = IMPERADOR_USER_ID && message.author.id === IMPERADOR_USER_ID;
        const isCanalEspecifico = CANAL_AUTO_RESPOSTA ? (message.channel.id === CANAL_AUTO_RESPOSTA) : true;

        const foiMencionada = message.mentions && message.mentions.has(client.user);
        const deveResponder = isCanalEspecifico && (foiMencionada || (CANAL_AUTO_RESPOSTA ? true : foiMencionada));

        if (!deveResponder) return;

        const userId = message.author.id;
        const cooldownMs = isImperador ? COOLDOWN_MS_IMPERADOR : COOLDOWN_MS_DEFAULT;
        const last = userCooldowns.get(userId) || 0;
        const now = Date.now();
        if (now < last + cooldownMs) return;
        userCooldowns.set(userId, now);

        let conteudo = message.content.replace(/<@!?\d+>/g, '').trim();
        if (!conteudo) conteudo = isImperador ? "Mensagem do Imperador." : "Usuário chamou o bot.";

        await message.channel.sendTyping();

        const respostaIA = await askOpenAI(conteudo, userId);

        let resposta = respostaIA || "Erro ao processar a requisição.";
        if (resposta.length > 2000) {
            resposta = resposta.substring(0, 1997) + "...";
        }

        await message.reply(resposta);

    } catch (error) {
        console.error("Erro ao processar mensagem:", error);
        try {
            await message.reply("Erro interno.");
        } catch (_) {}
    }
});

client.on('presenceUpdate', (oldPresence, newPresence) => {});

// Tratamento de erros não capturados
process.on('unhandledRejection', (err) => console.error('UnhandledRejection:', err));
process.on('uncaughtException', (err) => {
    console.error('UncaughtException:', err);
});

// --- HTTP server (para Railway / healthcheck) ---
const app = express();
app.get('/', (req, res) => {
    res.json({ status: 'Demônio (frio) online', uptime_s: process.uptime() });
});
app.listen(PORT, () => console.log(`HTTP server rodando na porta ${PORT}`));

client.login(DISCORD_BOT_TOKEN).catch(err => {
    console.error('Erro login Discord:', err);
    process.exit(1);
});
