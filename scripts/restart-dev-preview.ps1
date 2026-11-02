$ErrorActionPreference = 'Stop'
$listeners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)
$processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($processId in $processIds) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
  if ($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'node_modules[/\\]vite[/\\]bin[/\\]vite\.js') {
    throw "Port 5173 belongs to an unexpected process: $processId"
  }
  Stop-Process -Id $processId
}
& (Join-Path $PSScriptRoot 'launch-services.ps1') -Mode dev
