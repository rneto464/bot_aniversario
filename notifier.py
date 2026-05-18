import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from datetime import datetime
import os

def enviar_email(to_email, subject, body, smtp_server, smtp_port, email_user, email_pass, caminho_imagem=None):
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
        text = msg.as_string()
        server.sendmail(email_user, to_email, text)
        server.quit()
        return True, "E-mail enviado com sucesso"
    except Exception as e:
        return False, str(e)

import time
import webbrowser
import pyautogui
import pyperclip

def copy_image_to_clipboard(filepath):
    import win32clipboard
    from PIL import Image
    from io import BytesIO
    image = Image.open(filepath)
    output = BytesIO()
    image.convert("RGB").save(output, "BMP")
    data = output.getvalue()[14:]
    output.close()
    win32clipboard.OpenClipboard()
    win32clipboard.EmptyClipboard()
    win32clipboard.SetClipboardData(win32clipboard.CF_DIB, data)
    win32clipboard.CloseClipboard()

def _enviar_mensagem_robusta(url, mensagem, caminho_imagem=None):
    webbrowser.open(url)
    time.sleep(25) # Espera o WhatsApp Web carregar completamente
    
    # Clica no centro da tela para focar (ajuda no Windows)
    width, height = pyautogui.size()
    pyautogui.click(width / 2, height / 2)
    time.sleep(1)
    
    if caminho_imagem and os.path.exists(caminho_imagem):
        # Envia a imagem copiando para a área de transferência
        copy_image_to_clipboard(caminho_imagem)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(3) # Espera a pré-visualização da imagem carregar
        
    # Copia o texto para a área de transferência (resolve 100% o problema dos acentos)
    pyperclip.copy(mensagem)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(1)
    
    # Envia a mensagem
    pyautogui.press('enter')
    time.sleep(2) # Espera enviar antes de retornar

def enviar_whatsapp(numero, mensagem, caminho_imagem=None):
    try:
        numero = str(numero).replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        if not numero.startswith("+"):
            numero = "+55" + numero
            
        url = f"https://web.whatsapp.com/send?phone={numero}"
        _enviar_mensagem_robusta(url, mensagem, caminho_imagem)
        return True, "WhatsApp enviado com sucesso"
    except Exception as e:
        return False, str(e)

def enviar_whatsapp_grupo(group_id, mensagem, caminho_imagem=None):
    try:
        url = f"https://web.whatsapp.com/accept?code={group_id}"
        _enviar_mensagem_robusta(url, mensagem, caminho_imagem)
        return True, "WhatsApp enviado para o grupo com sucesso"
    except Exception as e:
        return False, str(e)
