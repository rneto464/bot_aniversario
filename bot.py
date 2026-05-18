import time
import schedule
import threading
import traceback
import os
import glob
import base64
import tempfile
from database import get_aniversariantes_hoje, get_configuracoes, get_imagem_supabase
from notifier import enviar_email, enviar_whatsapp, enviar_whatsapp_grupo

class BotAniversario:
    def __init__(self, update_log_callback=None):
        self.running = False
        self.thread = None
        self.update_log_callback = update_log_callback
        self.logs = []
        
    def log(self, mensagem):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        msg_formatada = f"[{timestamp}] {mensagem}"
        self.logs.append(msg_formatada)
        # Manter apenas os últimos 100 logs
        if len(self.logs) > 100:
            self.logs.pop(0)
            
        if self.update_log_callback:
            self.update_log_callback(mensagem)
        else:
            print(msg_formatada)

    def rotina_diaria(self):
        self.log("[BOT] Iniciando verificação diária de aniversários...")
        try:
            aniversariantes = get_aniversariantes_hoje()
            if not aniversariantes:
                self.log("[BOT] Nenhum aniversariante hoje.")
                return

            config = get_configuracoes()
            if not config:
                self.log("[BOT] Erro: Configurações não encontradas no banco de dados.")
                return
                
            smtp_server = config[0]
            smtp_port = config[1]
            email_user = config[2]
            email_pass = config[3]
            mensagem_padrao = config[4]
            whatsapp_group_id = config[5] if len(config) > 5 else None

            img_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "imagens_aniversario"))
            self.log(f"[DEBUG] Procurando imagens em: {img_dir}")

            for colab in aniversariantes:
                colab_id, nome, data_nasc, email, telefone = colab
                mensagem = mensagem_padrao.format(nome=nome)
                
                # Buscar imagem no Supabase
                caminho_imagem = None
                imagem_base64 = get_imagem_supabase(colab_id)
                
                if imagem_base64:
                    try:
                        # Criar arquivo temporário para enviar
                        fd, temp_path = tempfile.mkstemp(suffix=".jpg")
                        with os.fdopen(fd, 'wb') as f:
                            f.write(base64.b64decode(imagem_base64))
                        caminho_imagem = temp_path
                    except Exception as e:
                        self.log(f"[BOT] Erro ao decodificar imagem para o colaborador {nome}: {e}")
                
                self.log(f"[BOT] Processando: {nome}")
                if caminho_imagem:
                    self.log(f"  -> Imagem personalizada encontrada: {caminho_imagem}")
                
                # Enviar Email se houver
                if email and email.strip() and email_pass:
                    self.log(f"  -> Enviando e-mail para {email}...")
                    sucesso, msg_retorno = enviar_email(email, "Feliz Aniversário!", mensagem, smtp_server, smtp_port, email_user, email_pass, caminho_imagem)
                    if sucesso:
                        self.log("  -> E-mail enviado com sucesso!")
                    else:
                        self.log(f"  -> Erro ao enviar e-mail: {msg_retorno}")
                
                # Enviar WhatsApp para o Grupo
                if whatsapp_group_id and whatsapp_group_id.strip():
                    self.log(f"  -> Enviando WhatsApp para o grupo ({whatsapp_group_id})...")
                    sucesso, msg_retorno = enviar_whatsapp_grupo(whatsapp_group_id, mensagem, caminho_imagem)
                    if sucesso:
                        self.log("  -> WhatsApp processado com sucesso!")
                    else:
                        self.log(f"  -> Erro ao enviar WhatsApp: {msg_retorno}")
                else:
                    self.log("  -> Pulo: Nenhum Grupo do WhatsApp configurado nas configurações.")
                    
                # Limpar imagem temporária do disco
                if caminho_imagem and os.path.exists(caminho_imagem):
                    try:
                        os.remove(caminho_imagem)
                    except Exception as e:
                        self.log(f"[DEBUG] Erro ao excluir imagem temporária: {e}")
                        
            self.log("[BOT] Verificação diária concluída.")
            
        except Exception as e:
            self.log(f"[BOT] Erro na rotina: {e}")
            traceback.print_exc()

    def _loop(self):
        # Configurar para rodar todo dia às 09:00
        schedule.every().day.at("09:00").do(self.rotina_diaria)
        
        self.log("[BOT] Bot iniciado. Agendado para rodar às 09:00 diariamente.")
        
        while self.running:
            schedule.run_pending()
            time.sleep(1)

    def iniciar(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()

    def parar(self):
        self.running = False
        schedule.clear()
        self.log("[BOT] Bot parado.")
