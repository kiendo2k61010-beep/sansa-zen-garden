param([ValidateSet('dev', 'public', 'restart')][string]$Mode = 'dev', [switch]$Worker)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
if (-not $Worker) {
  # WMI owns this launcher so the preview survives closing the terminal/chat tool.
  # This creates no startup task, Windows service or firewall rule.
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}
  $command = '"{0}" -NoProfile -ExecutionPolicy Bypass -File "{1}" -Mode {2} -Worker' -f (Join-Path $PSHOME 'powershell.exe'), $PSCommandPath, $Mode
  $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$command;CurrentDirectory=$projectRoot;ProcessStartupInformation=$startup}
  if ($created.ReturnValue -ne 0) { throw ('Background launcher failed: ' + $created.ReturnValue) }
  Write-Output ('Started hidden ' + $Mode + ' launcher PID ' + $created.ProcessId)
  exit 0
}
try {
  if ($Mode -ne 'dev') {
    $scriptName = if ($Mode -eq 'restart') { 'restart-public-server.ps1' } else { 'start-public-preview.ps1' }
    & (Join-Path $PSScriptRoot $scriptName) *> (Join-Path $runtimePath 'public-launcher.log')
  } else {
    $nodePath = (Get-Command node).Source
    if (-not (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)) {
      Start-Process -FilePath $nodePath -ArgumentList 'node_modules/tsx/dist/cli.mjs watch server/index.ts' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimePath 'dev-server.out.log') -RedirectStandardError (Join-Path $runtimePath 'dev-server.err.log')
    }
    if (-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) {
      Start-Process -FilePath $nodePath -ArgumentList 'node_modules/vite/bin/vite.js --host 0.0.0.0' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimePath 'vite.out.log') -RedirectStandardError (Join-Path $runtimePath 'vite.err.log')
    }
    Write-Output 'Development frontend/backend are running.'
  }
} catch {
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $runtimePath ($Mode + '-launcher-error.log')) -Encoding UTF8
  throw
}
