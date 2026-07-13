@echo off
setlocal

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE set "NODE=%%I"
if not defined NODE (
  echo Node.js 18+ is required. Install Node.js, then run this installer again.
  exit /b 1
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_CMD=%STARTUP%\ChargeGuard.cmd"
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\ChargeGuard.lnk"
set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\ChargeGuard.lnk"
set "ICON=%ROOT%\assets\chargeguard.ico"

rem Stop any running ChargeGuard monitoring, wherever it was installed from,
rem so the new install fully replaces old code and old settings.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $lock=Join-Path $env:LOCALAPPDATA 'ChargeGuard\chargeguard.lock'; $ids=@(); if(Test-Path $lock){$ids+=[int](Get-Content $lock)}; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'index\.js' -and $_.CommandLine -match '--daemon' } | ForEach-Object { $ids+=[int]$_.ProcessId }; Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -match 'Startup\\ChargeGuard\.cmd' } | ForEach-Object { $ids+=[int]$_.ProcessId }; foreach($id in ($ids | Sort-Object -Unique)){ $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id); if(-not $p){continue}; if($p.Name -eq 'node.exe' -and $p.CommandLine -match 'index\.js'){ Stop-Process -Id $id -Force } elseif($p.Name -eq 'cmd.exe' -and $p.CommandLine -match 'ChargeGuard\.cmd'){ Stop-Process -Id $id -Force } }; Remove-Item $lock -Force" >nul 2>nul

rem Always rewrite the startup script so upgrades and moved folders take effect.
(
  echo @echo off
  echo cd /d "%ROOT%"
  echo :loop
  echo "%NODE%" "%ROOT%\src\index.js" --daemon
  echo timeout /t 60 /nobreak ^>nul
  echo goto loop
) > "%STARTUP_CMD%"

echo Installed auto connect/disconnect: %STARTUP_CMD%

if exist "%ROOT%\ChargeGuard.cmd" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; foreach($p in @('%SHORTCUT%','%DESKTOP_SHORTCUT%')){$s=$ws.CreateShortcut($p);$s.TargetPath='%ROOT%\ChargeGuard.cmd';$s.WorkingDirectory='%ROOT%';$s.Description='ChargeGuard';if(Test-Path '%ICON%'){$s.IconLocation='%ICON%'};$s.Save()}" >nul 2>nul
  if not errorlevel 1 echo Installed Start Menu and Desktop shortcuts.
)

schtasks /Create /TN "ChargeGuardOff" /TR "\"%NODE%\" \"%ROOT%\scripts\chargeguard-off.js\"" /SC ONEVENT /EC System /MO "*[System[Provider[@Name='USER32'] and EventID=1074]]" /F >nul 2>nul
if %ERRORLEVEL% EQU 0 echo Installed Windows-exit charger disconnect

schtasks /Create /TN "ChargeGuardSleep" /TR "\"%NODE%\" \"%ROOT%\scripts\chargeguard-off.js\"" /SC ONEVENT /EC System /MO "*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=42]]" /F >nul 2>nul
if %ERRORLEVEL% EQU 0 echo Installed sleep charger disconnect

schtasks /Create /TN "ChargeGuardSleepMS" /TR "\"%NODE%\" \"%ROOT%\scripts\chargeguard-off.js\"" /SC ONEVENT /EC System /MO "*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=506]]" /F >nul 2>nul
if %ERRORLEVEL% EQU 0 echo Installed modern-standby sleep charger disconnect

schtasks /Create /TN "ChargeGuardResume" /TR "\"%NODE%\" \"%ROOT%\src\index.js\" --once" /SC ONEVENT /EC System /MO "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]" /F >nul 2>nul
if %ERRORLEVEL% EQU 0 echo Installed wake battery check

schtasks /Create /TN "ChargeGuardResumeMS" /TR "\"%NODE%\" \"%ROOT%\src\index.js\" --once" /SC ONEVENT /EC System /MO "*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=507]]" /F >nul 2>nul
if %ERRORLEVEL% EQU 0 echo Installed modern-standby wake battery check

echo Running immediate battery check...
"%NODE%" "%ROOT%\src\index.js" --once
if %ERRORLEVEL% EQU 0 (
  echo Immediate battery check completed.
) else (
  echo Immediate battery check could not complete. Open ChargeGuard status for details.
)

start "ChargeGuard" /min "%NODE%" "%ROOT%\src\index.js" --daemon
echo Background monitoring started.
echo Done.
