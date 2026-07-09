$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$node = (Get-Command node).Source
$startup = [Environment]::GetFolderPath("Startup")
$startupCmd = Join-Path $startup "ChargeGuard.cmd"
Remove-Item $startupCmd -Force -ErrorAction SilentlyContinue
"@echo off`r`ncd /d `"$root`"`r`n:loop`r`n`"$node`" `"$root\src\index.js`" --daemon`r`ntimeout /t 10 /nobreak >nul`r`ngoto loop`r`n" | Set-Content -Encoding ASCII $startupCmd
Write-Host "Installed auto connect/disconnect: $startupCmd"
schtasks /Create /TN "ChargeGuardOff" /TR "`"$node`" `"$root\scripts\chargeguard-off.js`"" /SC ONEVENT /EC System /MO "*[System[Provider[@Name='USER32'] and EventID=1074]]" /F
if ($LASTEXITCODE -ne 0) {
  schtasks /Query /TN "ChargeGuardOff" *> $null
  if ($LASTEXITCODE -eq 0) { Write-Host "Windows-exit charger disconnect already installed" }
  else { Write-Warning "Could not install Windows-exit charger disconnect. Auto connect/disconnect is still installed." }
}
else { Write-Host "Installed Windows-exit charger disconnect" }
$sleep = "`"$node`" `"$root\scripts\chargeguard-off.js`""
schtasks /Create /TN "ChargeGuardSleep" /TR $sleep /SC ONEVENT /EC System /MO "*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=42]]" /F
if ($LASTEXITCODE -eq 0) { Write-Host "Installed sleep charger disconnect" }
else { Write-Warning "Could not install sleep charger disconnect. Auto connect/disconnect is still installed." }
$resume = "`"$node`" `"$root\src\index.js`" --once"
schtasks /Create /TN "ChargeGuardResume" /TR $resume /SC ONEVENT /EC System /MO "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]" /F
if ($LASTEXITCODE -eq 0) { Write-Host "Installed wake battery check" }
else { Write-Warning "Could not install wake battery check. Auto connect/disconnect is still installed." }
exit 0
