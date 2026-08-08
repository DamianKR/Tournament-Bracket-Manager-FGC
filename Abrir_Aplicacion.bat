@echo off
REM Script para abrir la aplicacion de torneos
REM Abre un servidor local para evitar errores de CORS al abrir el archivo HTML directamente

cd /d "%~dp0"
echo Iniciando servidor local para Bracket Tournament Manager...
echo.
echo Espera unos segundos mientras carga la aplicacion...

REM Iniciar servidor Vite preview en segundo plano usando node directamente
start "Servidor Bracket Tournament Manager" node "node_modules\vite\bin\vite.js" preview --port 5173

REM Esperar a que el servidor inicie
timeout /t 5 /nobreak >nul

REM Abrir el navegador en la URL local
start http://localhost:5173

echo.
echo Puedes cerrar esta ventana cuando termines. El servidor se cerrara al cerrar la ventana negra.
pause
