# Pre-commit hook (PowerShell): triple-check on staged .md files
#
# Windows equivalent of pre-commit-triple-check.sh (full parity).
# Implements 3-pillar discipline (triple-pillar shard / governance protocol).
#
# ENCODING: this file MUST be saved as UTF-8 WITH BOM. Windows PowerShell
# 5.1 reads a UTF-8 file without BOM as ANSI, which corrupts the Cyrillic
# claim units in $UnitRe and breaks the parser. When editing this file,
# always preserve the BOM (UTF8Encoding with BOM / "UTF-8 with BOM").
#
# Invocation:
#   pre-commit-triple-check.ps1                          - check staged .md
#   pre-commit-triple-check.ps1 --advisory-single FILE   - single file, advisory,
#       always exit 0 (for Claude Code PostToolUse hook)
#
# Install:
#   see README.md in this directory, or hooks.json (git_hooks section).
# Run manually: powershell -File <plugin>/hooks/pre-commit-triple-check.ps1
#
# NB: claim detection is a heuristic (advisory tool). Two-stage: a line is a
# claim if it contains a digit AND a marker (%, currency, unit, ratio, decimal).

$ErrorActionPreference = 'Stop'
$Mode = $env:TRIPLE_CHECK_MODE
if (-not $Mode) { $Mode = 'advisory' }
$Threshold = $env:TRIPLE_CHECK_MISSING_THRESHOLD
if (-not $Threshold) { $Threshold = 3 }
$Threshold = [int]$Threshold

# --- Arguments ----------------------------------------------------------
$SingleFile = ''
if ($args.Count -ge 2 -and $args[0] -eq '--advisory-single') {
    $SingleFile = $args[1]
    $Mode = 'advisory'
    if ($SingleFile -notmatch '\.md$') { exit 0 }
    if (-not (Test-Path $SingleFile)) { exit 0 }
}

# source = inline markdown link to a pillar path or external URL
$SourceRe = '\[.+\]\((https?://|\.\./adrs/|\.\./methodologies/|\.\./researches/|adrs/|methodologies/|researches/)'

# Cyrillic claim units, literal UTF-8 (file has BOM - see ENCODING note above).
# Decoded: ms / sek / min / chas / GB / TB / mlrd / mln / tys / rub / god / let
$UnitRe = '[0-9]\s*(ms|мс|сек|мин|час|GB|ГБ|TB|ТБ|млрд|млн|тыс|руб|год|лет)'
# Currency: dollar / EUR / RUB
$CurrencyRe = '[$€₽]'
# Ratio: digit + Latin x or Cyrillic x
$RatioRe = '[0-9]\s*[xх]([\s.,)]|$)'

# --- File list ----------------------------------------------------------
if ($SingleFile) {
    $Files = @($SingleFile)
} else {
    $Files = git diff --cached --name-only --diff-filter=ACM |
        Where-Object { $_ -match '\.md$' } |
        Where-Object { $_ -notmatch 'wiki-backlinks\.md$' } |
        Where-Object { $_ -notmatch '^wiki/concepts/' } |
        Where-Object { $_ -notmatch '^\.claude/' }
}

if (-not $Files -or @($Files).Count -eq 0) {
    exit 0
}

$TotalMissing = 0
$FilesWithIssues = 0
$singleLabel = ''
if ($SingleFile) { $singleLabel = ', single-file' }

Write-Host ""
Write-Host "================================================================"
Write-Host "[*] TRIPLE-CHECK hook (mode=$Mode$singleLabel)"
Write-Host "================================================================"

foreach ($file in $Files) {
    if (-not (Test-Path $file)) { continue }

    if ($SingleFile) {
        $content = Get-Content $file -Raw -Encoding UTF8
    } else {
        $content = git show ":${file}" 2>$null
        if (-not $content) { $content = Get-Content $file -Raw -Encoding UTF8 }
    }

    $lines = $content -split "`n"
    $inCode = $false
    $inYaml = $false
    $yamlSeen = $false
    $inWiki = $false
    $claimLines = @()

    foreach ($line in $lines) {
        if ($line -match '^---\s*$') {
            if (-not $yamlSeen) { $inYaml = $true; $yamlSeen = $true; continue }
            elseif ($inYaml) { $inYaml = $false; continue }
        }
        if ($line -match '^```') { $inCode = -not $inCode; continue }
        if ($line -match 'wiki:see-also-start') { $inWiki = $true; continue }
        if ($line -match 'wiki:see-also-end') { $inWiki = $false; continue }
        if ($inCode -or $inYaml -or $inWiki) { continue }
        if ($line -match '^\s*#') { continue }

        # Two-stage: digit AND marker
        if ($line -match '[0-9]') {
            if (($line -match '[0-9]\s*%') -or
                ($line -match $CurrencyRe) -or
                ($line -match $UnitRe) -or
                ($line -match $RatioRe) -or
                ($line -match '[0-9]\.[0-9]')) {
                $claimLines += $line
            }
        }
    }

    $claimCount = $claimLines.Count
    $missing = $claimLines | Where-Object { $_ -notmatch $SourceRe -and $_.Trim() -ne '' }
    $missingCount = @($missing).Count

    if ($missingCount -gt 0) {
        $FilesWithIssues++
        $TotalMissing += $missingCount
        Write-Host ""
        Write-Host "  [file] $file"
        Write-Host "     claims: $claimCount, MISSING source: $missingCount"
        Write-Host "     first 3 lines without source:"
        $missing | Select-Object -First 3 | ForEach-Object {
            Write-Host "        > $($_.Trim())"
        }
    }
}

Write-Host ""
Write-Host "----------------------------------------------------------------"

if ($TotalMissing -eq 0) {
    Write-Host "[OK] TRIPLE_CHECK_PASSED - every fact has an inline source"
    Write-Host "================================================================"
    exit 0
}

Write-Host "[!] Files with potential issues: $FilesWithIssues"
Write-Host "[!] Total claims without inline source: $TotalMissing"
Write-Host "    (threshold for strict mode: $Threshold)"
Write-Host ""

if ($Mode -eq 'strict' -and $TotalMissing -gt $Threshold) {
    Write-Host "[FAIL] TRIPLE_CHECK_FAILED (strict mode - MISSING $TotalMissing over threshold $Threshold)"
    Write-Host "   Add inline links to ADR / methodology / research / external URL"
    Write-Host "   or set TRIPLE_CHECK_MODE=advisory to skip (not recommended)"
    Write-Host "   See: /triple-check command documentation"
    Write-Host "================================================================"
    exit 1
}

if ($Mode -eq 'strict') {
    Write-Host "[i] TRIPLE_CHECK_WARN (strict mode - MISSING $TotalMissing within threshold $Threshold, commit allowed)"
} else {
    Write-Host "[i] TRIPLE_CHECK_WARN (advisory mode - commit allowed)"
    Write-Host "   For strict mode: set TRIPLE_CHECK_MODE=strict before git commit"
}
Write-Host "================================================================"
exit 0
