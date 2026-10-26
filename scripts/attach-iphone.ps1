# Run on Windows. Bind once from an elevated PowerShell; attach needs no elevation.
# Example: .\scripts\attach-iphone.ps1 -BusId 1-4 -Bind
# Reconnect: .\scripts\attach-iphone.ps1 -BusId 1-4
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+-[0-9]+$')]
    [string]$BusId,
    [switch]$Bind
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command usbipd -ErrorAction SilentlyContinue)) {
    throw 'Install usbipd-win first: winget install --interactive --exact dorssel.usbipd-win'
}
if ($Bind) {
    & usbipd bind --busid $BusId
    if ($LASTEXITCODE -ne 0) { throw 'Bind failed. Run -Bind once in an elevated PowerShell.' }
}
& usbipd attach --wsl --busid $BusId
if ($LASTEXITCODE -ne 0) {
    throw 'Attach failed. Keep a WSL2 terminal open, confirm usbipd list, and check that this device is bound.'
}
Write-Host 'Attached. Unlock the iPhone and accept Trust if prompted. Verify with ios list inside WSL.'
