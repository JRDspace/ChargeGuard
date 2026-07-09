Unregister-ScheduledTask -TaskName "ChargeGuard" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "ChargeGuardOff" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "ChargeGuardSleep" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "ChargeGuardResume" -Confirm:$false -ErrorAction SilentlyContinue
$startupCmd = Join-Path ([Environment]::GetFolderPath("Startup")) "ChargeGuard.cmd"
Remove-Item $startupCmd -Force -ErrorAction SilentlyContinue
@(
  "WIZ_PLUG_IP",
  "WIZ_PLUG_PORT",
  "WIZ_TIMEOUT_MS",
  "WIZ_PLUG_TIMEOUT_MS",
  "CHARGEGUARD_HIGH",
  "CHARGEGUARD_LOW",
  "CHARGEGUARD_POLL_SECONDS",
  "CHARGEGUARD_START_CHARGING",
  "CHARGEGUARD_FAILSAFE"
) | ForEach-Object { [Environment]::SetEnvironmentVariable($_, $null, "User") }
Write-Host "Removed startup task: ChargeGuard"
