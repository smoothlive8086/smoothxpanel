@echo off
setlocal
title SMOOTH x HOST - VPS Deployer

echo ====================================================
echo    SMOOTH x HOST - Fast VPS Upload Tool
echo ====================================================
echo.
echo Make sure you have your VPS IP and root password ready.
echo.

set /p VPS_IP="Enter your VPS IP address (e.g. 142.250.190.46): "

if "%VPS_IP%"=="" (
    echo Error: VPS IP cannot be empty!
    pause
    exit /b
)

echo.
echo [1/2] Creating package (excluding node_modules)...
tar -czf panel-vps.tar.gz --exclude="node_modules" --exclude="panel-vps.tar.gz" *

echo.
echo [2/2] Uploading panel-vps.tar.gz to your VPS at %VPS_IP%...
echo (Enter your VPS root password when asked)
echo.
scp panel-vps.tar.gz root@%VPS_IP%:/root/

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Upload failed. Please check your VPS IP and password.
    pause
    exit /b
)

echo.
echo ====================================================
echo    SUCCESS! Package uploaded to your VPS!
echo ====================================================
echo.
echo Now open your VPS SSH terminal (ssh root@%VPS_IP%) and run:
echo.
echo   mkdir -p /var/www/smooth-panel ^&^& tar -xzf /root/panel-vps.tar.gz -C /var/www/smooth-panel
echo   cd /var/www/smooth-panel
echo   chmod +x install.sh
echo   sudo ./install.sh
echo.
echo ====================================================
pause
