@echo off
setlocal

echo Removing ChargeGuard automatic mode...

set "FOUND="

schtasks /Query /TN "ChargeGuard" >nul 2>nul && set "FOUND=1"
schtasks /Query /TN "ChargeGuardOff" >nul 2>nul && set "FOUND=1"
schtasks /Query /TN "ChargeGuardSleep" >nul 2>nul && set "FOUND=1"
schtasks /Query /TN "ChargeGuardResume" >nul 2>nul && set "FOUND=1"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ChargeGuard.cmd" set "FOUND=1"

if not defined FOUND (
  echo ChargeGuard automatic mode is not installed.
  echo You can close this window.
  pause
  exit /b 0
)

schtasks /Delete /TN "ChargeGuard" /F >nul 2>nul
schtasks /Delete /TN "ChargeGuardOff" /F >nul 2>nul
schtasks /Delete /TN "ChargeGuardSleep" /F >nul 2>nul
schtasks /Delete /TN "ChargeGuardResume" /F >nul 2>nul

del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ChargeGuard.cmd" >nul 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\ChargeGuard.lnk" >nul 2>nul
del "%USERPROFILE%\Desktop\ChargeGuard.lnk" >nul 2>nul

reg delete HKCU\Environment /v WIZ_PLUG_IP /f >nul 2>nul
reg delete HKCU\Environment /v WIZ_PLUG_PORT /f >nul 2>nul
reg delete HKCU\Environment /v WIZ_TIMEOUT_MS /f >nul 2>nul
reg delete HKCU\Environment /v WIZ_PLUG_TIMEOUT_MS /f >nul 2>nul
reg delete HKCU\Environment /v CHARGEGUARD_HIGH /f >nul 2>nul
reg delete HKCU\Environment /v CHARGEGUARD_LOW /f >nul 2>nul
reg delete HKCU\Environment /v CHARGEGUARD_POLL_SECONDS /f >nul 2>nul
reg delete HKCU\Environment /v CHARGEGUARD_START_CHARGING /f >nul 2>nul
reg delete HKCU\Environment /v CHARGEGUARD_FAILSAFE /f >nul 2>nul

echo Removed ChargeGuard automatic mode.
echo You can close this window.
