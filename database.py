import os
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def get_headers(prefer="return=representation"):
    return {
        "apikey": SUPABASE_KEY or "",
        "Authorization": f"Bearer {SUPABASE_KEY or ''}",
        "Content-Type": "application/json",
        "Prefer": prefer
    }

def init_db():
    # Ao usar a API REST, consideramos que as tabelas já foram
    # criadas manualmente via Painel do Supabase.
    pass

# --- Funções de Colaboradores ---

def add_colaborador(nome, data_nascimento, email, telefone):
    if not SUPABASE_URL: return None
    url = f"{SUPABASE_URL}/rest/v1/colaboradores"
    payload = {
        "nome": nome,
        "data_nascimento": data_nascimento,
        "email": email,
        "telefone": telefone
    }
    response = requests.post(url, headers=get_headers(), json=payload)
    if response.status_code in (200, 201) and response.json():
        return response.json()[0]['id']
    return None

def get_all_colaboradores():
    if not SUPABASE_URL: return []
    url = f"{SUPABASE_URL}/rest/v1/colaboradores"
    response = requests.get(url, headers=get_headers())
    if response.status_code == 200:
        data = response.json()
        return [(c['id'], c['nome'], c['data_nascimento'], c.get('email', ''), c.get('telefone', '')) for c in data]
    return []

def update_colaborador(id_colab, nome, data_nascimento, email, telefone):
    if not SUPABASE_URL: return
    url = f"{SUPABASE_URL}/rest/v1/colaboradores?id=eq.{id_colab}"
    payload = {
        "nome": nome,
        "data_nascimento": data_nascimento,
        "email": email,
        "telefone": telefone
    }
    requests.patch(url, headers=get_headers("return=minimal"), json=payload)

def delete_colaborador(id_colab):
    if not SUPABASE_URL: return
    url = f"{SUPABASE_URL}/rest/v1/colaboradores?id=eq.{id_colab}"
    requests.delete(url, headers=get_headers("return=minimal"))

def get_aniversariantes_hoje():
    hoje = datetime.now()
    dia = f"{hoje.day:02d}"
    mes = f"{hoje.month:02d}"

    if not SUPABASE_URL: return []
    url = f"{SUPABASE_URL}/rest/v1/colaboradores"
    response = requests.get(url, headers=get_headers())
    aniversariantes = []

    if response.status_code == 200:
        todos = response.json()
        for c in todos:
            try:
                partes = c['data_nascimento'].split('/')
                if len(partes) >= 2:
                    d = partes[0]
                    m = partes[1]
                    if d == dia and m == mes:
                        aniversariantes.append((c['id'], c['nome'], c['data_nascimento'], c.get('email', ''), c.get('telefone', '')))
            except Exception:
                pass
    return aniversariantes

# --- Funções de Configuração ---

def get_configuracoes():
    if not SUPABASE_URL: return None
    url = f"{SUPABASE_URL}/rest/v1/configuracoes?id=eq.1"
    response = requests.get(url, headers=get_headers())
    if response.status_code == 200 and response.json():
        c = response.json()[0]
        return (c.get('smtp_server'), c.get('smtp_port'), c.get('email_user'), c.get('email_pass'), c.get('mensagem_padrao'), c.get('whatsapp_group_id', ''))
    return None

def update_configuracoes(smtp_server, smtp_port, email_user, email_pass, mensagem_padrao, whatsapp_group_id=""):
    if not SUPABASE_URL: return
    url = f"{SUPABASE_URL}/rest/v1/configuracoes?on_conflict=id"
    payload = {
        "id": 1,
        "smtp_server": smtp_server,
        "smtp_port": smtp_port,
        "email_user": email_user,
        "email_pass": email_pass,
        "mensagem_padrao": mensagem_padrao,
        "whatsapp_group_id": whatsapp_group_id
    }
    headers = get_headers("resolution=merge-duplicates")
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code not in (200, 201, 204):
        print(f"ERRO AO SALVAR CONFIGURAÇÕES NO SUPABASE: {response.status_code} - {response.text}")

# --- Funções de Imagens ---

def upload_imagem_supabase(colab_id, imagem_base64):
    if not SUPABASE_URL: return
    url = f"{SUPABASE_URL}/rest/v1/imagens_colaboradores"
    payload = {
        "colab_id": colab_id,
        "imagem_base64": imagem_base64
    }
    headers = get_headers("resolution=merge-duplicates")
    requests.post(url, headers=headers, json=payload)

def get_imagem_supabase(colab_id):
    if not SUPABASE_URL: return None
    url = f"{SUPABASE_URL}/rest/v1/imagens_colaboradores?colab_id=eq.{colab_id}&select=imagem_base64"
    response = requests.get(url, headers=get_headers())
    if response.status_code == 200 and response.json():
        return response.json()[0]['imagem_base64']
    return None

def tem_imagem_supabase(colab_id):
    if not SUPABASE_URL: return False
    url = f"{SUPABASE_URL}/rest/v1/imagens_colaboradores?colab_id=eq.{colab_id}&select=colab_id"
    response = requests.get(url, headers=get_headers())
    if response.status_code == 200 and response.json():
        return True
    return False

# --- Funções de Limpeza ---

def delete_all_colaboradores():
    """Apaga todos os registros da tabela colaboradores."""
    if not SUPABASE_URL: return False
    url = f"{SUPABASE_URL}/rest/v1/colaboradores?id=gte.0"
    response = requests.delete(url, headers=get_headers("return=minimal"))
    return response.status_code in (200, 204)

def delete_all_imagens():
    """Apaga todas as imagens da tabela imagens_colaboradores."""
    if not SUPABASE_URL: return False
    url = f"{SUPABASE_URL}/rest/v1/imagens_colaboradores?colab_id=gte.0"
    response = requests.delete(url, headers=get_headers("return=minimal"))
    return response.status_code in (200, 204)

def delete_configuracoes():
    """Apaga o registro de configurações."""
    if not SUPABASE_URL: return False
    url = f"{SUPABASE_URL}/rest/v1/configuracoes?id=eq.1"
    response = requests.delete(url, headers=get_headers("return=minimal"))
    return response.status_code in (200, 204)

def delete_all_data():
    """Apaga todos os dados de todas as tabelas."""
    if not SUPABASE_URL: return False
    ok_imagens = delete_all_imagens()
    ok_colabs = delete_all_colaboradores()
    ok_config = delete_configuracoes()
    return ok_imagens and ok_colabs and ok_config
