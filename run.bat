@echo off
echo ============================================
echo   Bot de Aniversarios - Iniciando...
echo ============================================

echo.
echo [1/3] Instalando dependencias Python...
pip install -r requirements.txt

echo.
echo [2/3] Instalando dependencias Node.js (Baileys)...
cd wpp-api
npm install
cd ..

echo.
echo [3/3] Iniciando servidores...
echo.
echo - Servidor WhatsApp (Baileys) sera aberto em nova janela
echo   Na primeira execucao: escaneie o QR Code que aparecera la.
echo   Nas proximas vezes a sessao ja estara salva automaticamente.
echo.
echo - Servidor Python (Flask) sera iniciado aqui
echo   Acesse: http://localhost:5000
echo.

start "WhatsApp Baileys" cmd /k "cd /d %~dp0wpp-api && node server.js"

timeout /t 5 /nobreak > nul

python app.py
pause
