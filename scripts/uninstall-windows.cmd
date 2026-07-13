@echo off
setlocal

echo Removing ChargeGuard automatic mode...

rem Stop running monitoring so disabling takes effect immediately, not at reboot.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $lock=Join-Path $env:LOCALAPPDATA 'ChargeGuard\chargeguard.lock'; $ids=@(); if(Test-Path $lock){$ids+=[int](Get-Content $lock)}; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'index\.js' -and $_.CommandLine -match '--daemon' } | ForEach-Object { $ids+=[int]$_.ProcessId }; Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -match 'Startup\\ChargeGuard\.cmd' } | ForEach-Object { $ids+=[int]$_.ProcessId }; foreach($id in ($ids | Sort-Object -Unique)){ $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id); if(-not $p){continue}; if($p.Name -eq 'node.exe' -and $p.CommandLine -match 'index\.js'){ Stop-Process -Id $id -Force } elseif($p.Name -eq 'cmd.exe' -and $p.CommandLine -match 'ChargeGuard\.cmd'){ Stop-Process -Id $id -Force } }; Remove-Item $lock -Force" >nul 2>nul

set "FOUND="

schtasks /Query /TN "ChargeGuard" >nul 2>nul && set "FOUND=1"
schtasks /Query /TN "ChargeGuardOff" >nul 2>nul && set "FOUND=1"
schtasks /Query /TN "ChargeGuardSleep" >nul 2>nul && set "FOUND=1"
schtasks /Query /TN "ChargeGuardResume" >nul 2>nul && set "FOUND=1"
schtasks /Query /TN "ChargeGuardWatchdog" >nul 2>nul && set "FOUND=1"
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
schtasks /Delete /TN "ChargeGuardSleepMS" /F >nul 2>nul
schtasks /Delete /TN "ChargeGuardResume" /F >nul 2>nul
schtasks /Delete /TN "ChargeGuardResumeMS" /F >nul 2>nul
schtasks /Delete /TN "ChargeGuardWatchdog" /F >nul 2>nul

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
