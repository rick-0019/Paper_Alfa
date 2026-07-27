@echo off
title Paper Alfa - CAD Spec A4 (1:1)
cd /d "%~dp0"
echo ========================================================
echo   PAPER ALFA - CAD Spec A4 (1:1)
echo   Generador Parametrico de Papercraft Aeronautico
echo ========================================================
echo.
echo Abriendo Paper Alfa en http://localhost:8080 ...
start "" "http://localhost:8080"

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Iniciando servidor local con Node.js...
    node server.js
    goto :eof
)

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Iniciando servidor local con Python...
    echo (Deja esta ventana abierta mientras usas la app)
    python -m http.server 8080
    goto :eof
)

echo ERROR: No se detecto Node.js ni Python en tu sistema.
echo Abre directamente index.html en tu navegador web.
pause
