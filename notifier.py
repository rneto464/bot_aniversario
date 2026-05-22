import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
import os
import requests
from dotenv import load_dotenv

load_dotenv()

# URL base da API WPPConnect (microserviço Node.js)
WPP_API_URL = os.getenv("WPP_API_URL", "http://localhost:3000")


# ──────────────────────────────────────────────────────────────
# E-MAIL
# ──────────────────────────────────────────────────────────────
def enviar_email(to_email, subject, body, smtp_server, smtp_port, email_user, email_pass, caminho_imagem=None):
    """Envia um e-mail com texto e, opcionalmente, uma imagem em anexo."""
    try:
        msg = MIMEMultipart()
        msg['From'] = email_user
        msg['To'] = to_email
        msg['Subject'] = subject

        msg.attach(MIMEText(body, 'plain'))

        if caminho_imagem and os.path.exists(caminho_imagem):
            with open(caminho_imagem, 'rb') as fp:
                img_data = fp.read()
            image = MIMEImage(img_data, name=os.path.basename(caminho_imagem))
            msg.attach(image)

        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(email_user, email_pass)
        server.sendmail(email_user, to_email, msg.as_string())
        server.quit()
        return True, "E-mail enviado com sucesso"
    except Exception as e:
        return False, str(e)


# ──────────────────────────────────────────────────────────────
# WHATSAPP (via WPPConnect API)
# ──────────────────────────────────────────────────────────────
def _checar_status_wpp():
    """Verifica se o microserviço WPPConnect está online e conectado."""
    try:
        resp = requests.get(f"{WPP_API_URL}/status", timeout=5)
        data = resp.json()
        return data.get("status") == "connected"
    except requests.exceptions.ConnectionError:
        return False


def enviar_whatsapp(numero, mensagem, caminho_imagem=None):
    """
    Envia uma mensagem (e opcionalmente uma imagem) para um número via WhatsApp.
    Requer que o microserviço wpp-api/server.js esteja rodando.
    """
    try:
        if not _checar_status_wpp():
            return False, "WPPConnect não está conectado. Inicie o servidor wpp-api e escaneie o QR Code."

        endpoint = f"{WPP_API_URL}/send"

        if caminho_imagem and os.path.exists(caminho_imagem):
            # Envia como multipart/form-data com a imagem
            with open(caminho_imagem, 'rb') as img_file:
                files = {'imagem': (os.path.basename(caminho_imagem), img_file, 'image/jpeg')}
                data = {'numero': str(numero), 'mensagem': mensagem}
                resp = requests.post(endpoint, data=data, files=files, timeout=30)
        else:
            # Envia apenas texto como JSON
            payload = {'numero': str(numero), 'mensagem': mensagem}
            resp = requests.post(endpoint, json=payload, timeout=30)

        resultado = resp.json()
        if resultado.get("sucesso"):
            return True, resultado.get("mensagem", "WhatsApp enviado com sucesso")
        else:
            return False, resultado.get("erro", "Erro desconhecido na API WPP")

    except requests.exceptions.ConnectionError:
        return False, "Não foi possível conectar ao microserviço WPPConnect. Verifique se ele está rodando na porta 3000."
    except Exception as e:
        return False, str(e)


def enviar_whatsapp_grupo(group_id, mensagem, caminho_imagem=None):
    """
    Envia uma mensagem (e opcionalmente uma imagem) para um grupo do WhatsApp.
    O group_id deve ser o ID interno do grupo (ex: 5511999998888-1234567890@g.us)
    ou apenas a parte numérica.
    Requer que o microserviço wpp-api/server.js esteja rodando.
    """
    try:
        if not _checar_status_wpp():
            return False, "WPPConnect não está conectado. Inicie o servidor wpp-api e escaneie o QR Code."

        endpoint = f"{WPP_API_URL}/send-group"

        if caminho_imagem and os.path.exists(caminho_imagem):
            with open(caminho_imagem, 'rb') as img_file:
                files = {'imagem': (os.path.basename(caminho_imagem), img_file, 'image/jpeg')}
                data = {'group_id': str(group_id), 'mensagem': mensagem}
                resp = requests.post(endpoint, data=data, files=files, timeout=30)
        else:
            payload = {'group_id': str(group_id), 'mensagem': mensagem}
            resp = requests.post(endpoint, json=payload, timeout=30)

        resultado = resp.json()
        if resultado.get("sucesso"):
            return True, resultado.get("mensagem", "WhatsApp enviado para o grupo com sucesso")
        else:
            return False, resultado.get("erro", "Erro desconhecido na API WPP")

    except requests.exceptions.ConnectionError:
        return False, "Não foi possível conectar ao microserviço WPPConnect. Verifique se ele está rodando na porta 3000."
    except Exception as e:
        return False, str(e)
