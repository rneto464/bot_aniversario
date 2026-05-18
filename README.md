# 🎂 Bot de Aniversário

Sistema web para gerenciamento e envio automático de mensagens de aniversário para colaboradores via WhatsApp e Email.

## ✨ Funcionalidades

- 📋 Cadastro de colaboradores com nome, data de nascimento e contatos
- 🖼️ Upload de foto dos colaboradores
- 📅 Calendário mensal de aniversários
- 🤖 Bot automático que envia mensagens no dia do aniversário
- 📧 Notificação via Email
- 💬 Notificação via WhatsApp
- ☁️ Banco de dados na nuvem (Supabase/PostgreSQL)

## 🛠️ Tecnologias

- **Backend:** Python + Flask
- **Banco de dados:** Supabase (PostgreSQL)
- **Frontend:** HTML, CSS, JavaScript

## 🚀 Como executar

### 1. Clone o repositório
```bash
git clone https://github.com/rneto464/bot_aniversario.git
cd bot_aniversario
```

### 2. Crie o ambiente virtual e instale as dependências
```bash
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 3. Configure as variáveis de ambiente
```bash
cp .env.example .env
# Edite o .env com suas credenciais do Supabase
```

### 4. Execute a aplicação
```bash
python app.py
```

Acesse em: `http://localhost:5000`

## ⚙️ Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL do Supabase |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | Chave pública do Supabase |

## 📁 Estrutura do Projeto

```
birthday_bot/
├── app.py              # Servidor Flask (rotas da API e frontend)
├── bot.py              # Lógica do bot de aniversário (agendamento)
├── database.py         # Camada de acesso ao banco de dados
├── notifier.py         # Envio de mensagens (Email/WhatsApp)
├── requirements.txt    # Dependências Python
├── static/             # Arquivos estáticos (CSS, JS, imagens)
├── templates/          # Templates HTML (Jinja2)
├── imagens_aniversario/ # Fotos dos colaboradores
└── .env.example        # Exemplo de configuração
```
