param(
  [switch]$WebOnly,
  [string]$Registry = "ghcr.io/siangweisolutiondetails"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Get-ImageTag {
  $sha = (git rev-parse --short HEAD).Trim()
  if (git status --porcelain --untracked-files=no) { return "$sha-dirty" }
  return $sha
}

function Invoke-Docker([string[]]$arguments) {
  & docker @arguments
  if ($LASTEXITCODE -ne 0) { throw "docker $($arguments[0]) failed (exit $LASTEXITCODE)." }
}

function Build-Image([string]$target, [string]$name, [string]$tag, [string[]]$extraArgs) {
  $buildArgs = @("build", "--platform", "linux/amd64", "--target", $target,
    "-t", "$Registry/${name}:$tag", "-t", "$Registry/${name}:staging") + $extraArgs + @(".")
  Invoke-Docker $buildArgs
}

function Assert-NoBearerInBundle([string]$image) {
  & docker run --rm --entrypoint sh $image -c "! grep -rqF 'Bearer ' /srv/admin"
  if ($LASTEXITCODE -ne 0) { throw "Built admin bundle contains a 'Bearer ' string; the admin SPA must authenticate with the session cookie only." }
}

function Push-Image([string]$name) {
  Invoke-Docker @("push", "--all-tags", "$Registry/$name")
}

$tag = Get-ImageTag
Write-Host "Releasing tag $tag (and :staging) to $Registry" -ForegroundColor Cyan

if (-not $WebOnly) { Build-Image "app" "bonlift-app" $tag @() }
Build-Image "web" "bonlift-web" $tag @()
Assert-NoBearerInBundle "$Registry/bonlift-web:$tag"

if (-not $WebOnly) { Push-Image "bonlift-app" }
Push-Image "bonlift-web"

$services = if ($WebOnly) { "web" } else { "" }
Write-Host ""
Write-Host "Pushed. On the VM run:" -ForegroundColor Green
Write-Host "  cd /opt/bonlift"
Write-Host "  docker compose -f docker-compose.staging.yml pull $services"
Write-Host "  docker compose -f docker-compose.staging.yml up -d --no-build"
