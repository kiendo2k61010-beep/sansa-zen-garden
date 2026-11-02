$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $projectRoot '.runtime/public-preview.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No preview record.'; exit 0 }
$record = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
foreach ($item in @(@{id=$record.tunnelPid;exe='cloudflared.exe';argument='http://127.0.0.1:3002'},@{id=$record.serverPid;exe='node.exe';argument='dist-server/index.mjs'})) {
  $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $item.id)
  if ($process -and $process.Name -eq $item.exe -and $process.CommandLine.Contains($item.argument)) {
    Stop-Process -Id $item.id
    Write-Output ('Stopped ' + $item.exe + ' PID ' + $item.id)
  } elseif ($process) { throw ('PID has changed; refusing to stop unrelated process ' + $item.id) }
}
Write-Output 'Public preview stopped. The old temporary link is no longer active.'
