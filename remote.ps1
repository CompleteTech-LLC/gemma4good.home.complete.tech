[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Command
)

$ErrorActionPreference = 'Stop'

$sshOptions = @(
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=2'
)

$hostName = 'train.home.complete.tech'
$root = '/srv/openclaw/deploy'
$remoteCommand = if ($Command.Count -gt 0) { $Command -join ' ' } else { 'pwd && ls -la' }

$remoteScript = @(
    'set -e',
    "cd '$root'",
    $remoteCommand
) -join "`n"

$encodedScript = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))
ssh @sshOptions $hostName "printf '%s' '$encodedScript' | base64 -d | bash"
