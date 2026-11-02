$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $projectRoot '.runtime'
$statePath = Join-Path $runtimePath 'public-preview.json'
$record = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
if ($record.projectRoot -ne $projectRoot) { throw 'Preview record belongs to another workspace.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist-server/index.mjs'))) { throw 'Run npm run build first.' }
$serverProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $record.serverPid)
if ($serverProcess -and ($serverProcess.Name -ne 'node.exe' -or -not $serverProcess.CommandLine.Contains('dist-server/index.mjs'))) {
  throw 'PID no longer belongs to the preview server; refusing to stop it.'
}
$listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
if ($listener -and $listener.OwningProcess -ne $record.serverPid) { throw 'Port 3002 belongs to another process.' }
$tunnelProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $record.tunnelPid)
if (-not $tunnelProcess -or $tunnelProcess.Name -ne 'cloudflared.exe' -or -not $tunnelProcess.CommandLine.Contains('http://127.0.0.1:3002')) {
  throw 'The recorded tunnel is not running; use start-public-preview.ps1.'
}
if ($serverProcess) {
  Stop-Process -Id $record.serverPid
  Wait-Process -Id $record.serverPid -Timeout 10 -ErrorAction SilentlyContinue
}
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '3002'
$env:PUBLIC_ORIGIN = $record.origin
$env:ALLOWED_ORIGINS = ''
$serverProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist-server/index.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'server.out.log') -RedirectStandardError (Join-Path $runtimePath 'server.err.log')
$record.serverPid = $serverProcess.Id
$record | Add-Member -Force -NotePropertyName serverRestartedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o')
$record | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $statePath
Write-Output ($record | ConvertTo-Json -Compress)
