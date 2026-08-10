@echo off
REM Script para abrir la aplicacion de torneos
REM Arranca el servidor de almacenamiento local (puerto 3001) y el preview de Vite (puerto 5173)

cd /d "%~dp0"
echo ============================================
echo  Bracket Tournament Manager
echo ============================================
echo.
echo Iniciando servidor de almacenamiento local...

REM Crear tournaments.json si no existe
if not exist "tournaments.json" (
  echo [] > tournaments.json
  echo [OK] tournaments.json creado
)

REM Iniciar servidor Express (almacenamiento en tournaments.json)
start "Storage Server - Bracket" node server.js

REM Esperar a que el servidor de almacenamiento inicie
timeout /t 2 /nobreak >nul

echo Iniciando servidor de la aplicacion...

REM Iniciar servidor Vite preview
start "App Server - Bracket" node "node_modules\vite\bin\vite.js" preview --port 5173

REM Esperar a que el servidor de la app inicie
timeout /t 4 /nobreak >nul

REM Abrir el navegador
start http://localhost:5173

echo.
echo ============================================
echo  Servidores activos:
echo   App:          http://localhost:5173
echo   Almacenamiento: http://localhost:3001
echo   Datos en:     tournaments.json
echo ============================================
echo.
echo Puedes cerrar esta ventana. Los servidores
echo se cerraran al cerrar sus ventanas negras.
pause
