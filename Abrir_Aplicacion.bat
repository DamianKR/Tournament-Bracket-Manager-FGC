@echo off
REM Script para abrir la aplicacion de torneos
REM Arranca el servidor Express (puerto 3001) y el preview de Vite (puerto 5173)

cd /d "%~dp0"
echo ============================================
echo  Bracket Tournament Manager
echo ============================================
echo.

REM Crear carpeta de datos si no existe
if not exist "data" mkdir data
if not exist "data\tournaments.json" echo [] > data\tournaments.json
if not exist "data\participants.json" echo [] > data\participants.json

REM Matar procesos viejos en los puertos 3001 y 5173 si existen
echo Limpiando puertos anteriores...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 "') do (
  taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 "') do (
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM Construir la app si dist no existe
echo Verificando build...
if not exist "dist\index.html" (
  echo Generando build por primera vez...
  call node "node_modules\vite\bin\vite.js" build
  if errorlevel 1 (
    echo ERROR: El build fallo. Revisa los errores arriba.
    pause
    exit /b 1
  )
  echo [OK] Build generado
) else (
  echo [OK] Build existente encontrado
)

echo.
echo Abriendo ventanas de servidores...

REM Servidor Express — cmd /k mantiene la ventana abierta aunque falle
start "API Storage :3001" cmd /k "echo [Storage Server] Puerto 3001 && echo Cierra esta ventana para detener el servidor de datos && echo. && node server.js"

REM Esperar a que Express inicie
timeout /t 2 /nobreak >nul

REM Servidor Vite preview — idem
start "App Server :5173" cmd /k "echo [App Server] Puerto 5173 && echo Cierra esta ventana para detener la aplicacion && echo. && node node_modules\vite\bin\vite.js preview --port 5173"

REM Esperar a que Vite inicie
timeout /t 3 /nobreak >nul

REM Abrir el navegador
start http://localhost:5173

echo.
echo ============================================
echo  2 ventanas negras abiertas:
echo   [API Storage :3001]  - servidor de datos
echo   [App Server  :5173]  - aplicacion web
echo.
echo  Cierra cada ventana para detener su servidor.
echo  Para reflejar cambios: npm run build y reabrir.
echo ============================================
echo.
pause
