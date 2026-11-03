$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$runtimePath = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
$statePath = Join-Path $runtimePath 'public-preview.json'
if (Test-Path -LiteralPath $statePath) {
  $previous = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  $oldServer = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $previous.serverPid)
  $oldTunnel = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $previous.tunnelPid)
  if ($oldServer -and $oldTunnel -and $oldServer.Name -eq 'node.exe' -and $oldServer.CommandLine.Contains('dist-server/index.mjs') -and $oldTunnel.Name -eq 'cloudflared.exe' -and $oldTunnel.CommandLine.Contains('http://127.0.0.1:3002')) {
    Write-Output ('Preview already running: ' + $previous.url)
    exit 0
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist-server/index.mjs'))) { throw 'Run npm run build first.' }
$tunnelBinary = Join-Path $projectRoot '.tools/cloudflared.exe'
if (-not (Test-Path -LiteralPath $tunnelBinary)) { throw 'Run node scripts/download-tunnel.mjs first.' }
if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3002 is already in use; stop the existing service first.' }
$tunnelLog = Join-Path $runtimePath 'tunnel.err.log'
$tunnel = Start-Process -FilePath $tunnelBinary -ArgumentList @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:3002') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'tunnel.out.log') -RedirectStandardError $tunnelLog
$origin = $null
for ($attempt = 0; $attempt -lt 90; $attempt++) {
  Start-Sleep -Milliseconds 500
  $logText = Get-Content -Raw -LiteralPath $tunnelLog -ErrorAction SilentlyContinue
  # An error can contain https://api.trycloudflare.com; it is not a share URL.
  if ($logText -match 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com') { $origin = $Matches[0]; break }
  if ($tunnel.HasExited) { throw ('Tunnel exited; inspect ' + $tunnelLog) }
}
if (-not $origin) { Stop-Process -Id $tunnel.Id; throw 'Tunnel did not return a public URL.' }
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '3002'
$env:PUBLIC_ORIGIN = $origin
$env:ALLOWED_ORIGINS = ''
$server = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist-server/index.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'server.out.log') -RedirectStandardError (Join-Path $runtimePath 'server.err.log')
$record = [ordered]@{origin=$origin;url=($origin+'/?room=an-nhien&instance=0&region=apac');serverPid=$server.Id;tunnelPid=$tunnel.Id;projectRoot=$projectRoot;startedAt=(Get-Date).ToUniversalTime().ToString('o');temporary=$true}
$record | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $statePath
Write-Output ($record | ConvertTo-Json -Compress)
