param(
  [string]$LanIp
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $projectRoot "client\.cert"
$pfxPath = Join-Path $certificateDirectory "autoship-local.pfx"
$caPath = Join-Path $certificateDirectory "autoship-local-ca.cer"
$rootSubject = "CN=AutoShip Local Development CA"
$certificatePasswordText = "autoship-local-dev"

if (-not $LanIp) {
  $LanIp = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.InterfaceAlias -notmatch "vEthernet|Virtual|Loopback"
    } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress
}

if (-not $LanIp -or $LanIp -notmatch "^\d{1,3}(\.\d{1,3}){3}$") {
  throw "No LAN IPv4 address was found. Run again with -LanIp, for example: .\scripts\setup-local-https.ps1 -LanIp 192.168.1.20"
}

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

$rootCertificate = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq $rootSubject -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $rootCertificate) {
  $rootCertificate = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $rootSubject `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -NotAfter (Get-Date).AddYears(5) `
    -TextExtension @("2.5.29.19={critical}{text}ca=true")
}

$trustedRootStore = [System.Security.Cryptography.X509Certificates.X509Store]::new("Root", "CurrentUser")
$trustedRootStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
  $trusted = $trustedRootStore.Certificates.Find(
    [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
    $rootCertificate.Thumbprint,
    $false
  )
  if ($trusted.Count -eq 0) { $trustedRootStore.Add($rootCertificate) }
} finally {
  $trustedRootStore.Close()
}

$leafCertificate = New-SelfSignedCertificate `
  -Type Custom `
  -Subject "CN=AutoShip Local HTTPS" `
  -Signer $rootCertificate `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -NotAfter (Get-Date).AddYears(2) `
  -TextExtension @(
    "2.5.29.17={text}DNS=localhost&IPAddress=$LanIp",
    "2.5.29.37={text}1.3.6.1.5.5.7.3.1"
  )

$certificatePassword = ConvertTo-SecureString $certificatePasswordText -AsPlainText -Force
Export-PfxCertificate -Cert $leafCertificate -FilePath $pfxPath -Password $certificatePassword -Force | Out-Null
Export-Certificate -Cert $rootCertificate -FilePath $caPath -Force | Out-Null

Write-Host ""
Write-Host "Local HTTPS is ready." -ForegroundColor Green
Write-Host "Restart AutoShip, then open: https://${LanIp}:5173"
Write-Host "For a phone, copy and install this CA certificate first: $caPath"
Write-Host "Only install this certificate on devices you control."
