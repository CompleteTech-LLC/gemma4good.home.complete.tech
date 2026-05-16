[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Command
)

$ErrorActionPreference = 'Stop'

$sshOptions = @(
    '-F', 'NUL',
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=2',
    '-i', "$HOME\.ssh\completetrain_b550_ed25519"
)

$hostName = '192.168.1.146'
$userName = 'completetrain'
$root = '/srv/openclaw/deploy'
$remoteCommand = if ($Command.Count -gt 0) { $Command -join ' ' } else { 'pwd && ls -la' }

$remoteScript = @(
    'set -e',
    "cd '$root'",
    $remoteCommand
) -join "`n"

$encodedScript = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))
ssh @sshOptions "$userName@$hostName" "printf '%s' '$encodedScript' | base64 -d | bash"
