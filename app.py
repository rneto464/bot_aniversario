import os
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from database import init_db, add_colaborador, get_all_colaboradores, delete_colaborador, get_configuracoes, update_configuracoes, get_aniversariantes_hoje, tem_imagem_supabase, upload_imagem_supabase
from bot import BotAniversario
import threading

app = Flask(__name__)

# Configurações de diretório para imagens
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), "imagens_aniversario")
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Inicializa o banco de dados
init_db()

# Inicializa o bot globalmente
bot = BotAniversario()
bot.iniciar()

@app.route('/')
def index():
    return render_template('index.html')

# --- API Colaboradores ---
@app.route('/api/colaboradores', methods=['GET'])
def listar_colaboradores():
    todos = get_all_colaboradores()
    
    # Vamos separar próximos 30 dias do restante
    # Pra simplificar, enviamos todos e o Frontend filtra, ou filtramos aqui.
    # Vamos enviar a lista formatada
    colab_list = []
    for c in todos:
        tem_imagem = tem_imagem_supabase(c[0])
            
        colab_list.append({
            'id': c[0],
            'nome': c[1],
            'data_nascimento': c[2],
            'email': c[3],
            'telefone': c[4],
            'tem_imagem': tem_imagem
        })
    return jsonify(colab_list)

@app.route('/api/colaboradores', methods=['POST'])
def adicionar_colaborador():
    data = request.json
    nome = data.get('nome')
    data_nascimento = data.get('data_nascimento')
    email = data.get('email', '')
    telefone = data.get('telefone', '')
    
    if not nome or not data_nascimento:
        return jsonify({'error': 'Nome e Data de Nascimento são obrigatórios'}), 400
        
    new_id = add_colaborador(nome, data_nascimento, email, telefone)
    return jsonify({'message': 'Colaborador adicionado com sucesso', 'id': new_id})

@app.route('/api/colaboradores/<int:id_colab>', methods=['DELETE'])
def remover_colaborador(id_colab):
    delete_colaborador(id_colab)
    # Opcional: deletar a imagem do Supabase também (pode ser feito depois ou via trigger no Supabase)
    return jsonify({'message': 'Colaborador removido'})

# --- API Imagens ---
@app.route('/api/upload_imagem/<int:id_colab>', methods=['POST'])
def upload_imagem(id_colab):
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nenhum arquivo selecionado'}), 400
        
    if file:
        import base64
        file_bytes = file.read()
        imagem_base64 = base64.b64encode(file_bytes).decode('utf-8')
        
        upload_imagem_supabase(id_colab, imagem_base64)
        return jsonify({'message': 'Imagem enviada com sucesso para o Supabase'})

# --- API Configurações ---
@app.route('/api/configuracoes', methods=['GET'])
def obter_configuracoes():
    config = get_configuracoes()
    if config:
        return jsonify({
            'smtp_server': config[0],
            'smtp_port': config[1],
            'email_user': config[2],
            'email_pass': config[3],
            'mensagem_padrao': config[4],
            'whatsapp_group_id': config[5] if len(config) > 5 else ''
        })
    return jsonify({})

@app.route('/api/configuracoes', methods=['POST'])
def salvar_configuracoes():
    data = request.json
    update_configuracoes(
        data.get('smtp_server', 'smtp.gmail.com'),
        int(data.get('smtp_port', 587)),
        data.get('email_user', ''),
        data.get('email_pass', ''),
        data.get('mensagem_padrao', ''),
        data.get('whatsapp_group_id', '')
    )
    return jsonify({'message': 'Configurações salvas'})

# --- API Bot ---
@app.route('/api/logs', methods=['GET'])
def obter_logs():
    return jsonify({'logs': bot.logs})

@app.route('/api/bot/rodar', methods=['POST'])
def forcar_bot():
    threading.Thread(target=bot.rotina_diaria, daemon=True).start()
    return jsonify({'message': 'Rotina iniciada!'})

if __name__ == '__main__':
    # Usar threaded=True permite múltiplas requisições simultâneas
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
