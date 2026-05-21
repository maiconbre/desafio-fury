# ============================================================
# FURY · Click Hero — Script de Teste E2E da API
# Uso: .\scripts\test-api.ps1 [-BaseUrl "http://localhost:3000"]
# ============================================================

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$pass = 0
$fail = 0

function Write-Header([string]$text) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor DarkCyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor DarkCyan
}

function Assert-Equal($label, $got, $expected) {
    if ($got -eq $expected) {
        Write-Host "  [PASS] $label" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $label" -ForegroundColor Red
        Write-Host "         esperado : $expected" -ForegroundColor Yellow
        Write-Host "         recebido : $got" -ForegroundColor Yellow
        $script:fail++
    }
}

function Assert-Contains($label, $haystack, $needle) {
    if ($haystack -match [regex]::Escape($needle)) {
        Write-Host "  [PASS] $label" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $label" -ForegroundColor Red
        Write-Host "         esperado conter : $needle" -ForegroundColor Yellow
        Write-Host "         recebido        : $haystack" -ForegroundColor Yellow
        $script:fail++
    }
}

function Assert-NotNull($label, $value) {
    if ($null -ne $value -and "$value" -ne "") {
        Write-Host "  [PASS] $label" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $label (valor nulo ou vazio)" -ForegroundColor Red
        $script:fail++
    }
}

function Invoke-API($method, $path, $body = $null) {
    $url = "$BaseUrl$path"
    $headers = @{ "Content-Type" = "application/json" }
    try {
        if ($body) {
            $json = $body | ConvertTo-Json -Depth 5
            $response = Invoke-WebRequest -Uri $url -Method $method -Headers $headers -Body $json -ErrorAction Stop
        } else {
            $response = Invoke-WebRequest -Uri $url -Method $method -Headers $headers -ErrorAction Stop
        }
        return @{
            Status = [int]$response.StatusCode
            Body   = $response.Content | ConvertFrom-Json
        }
    } catch {
        $statusCode = 0
        $parsedBody = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $raw = $reader.ReadToEnd()
                $parsedBody = $raw | ConvertFrom-Json
            } catch { }
        }
        return @{
            Status = $statusCode
            Body   = $parsedBody
        }
    }
}

# ============================================================
# 0. Verificar se o servidor esta rodando
# ============================================================
Write-Header "0. Verificando conectividade com o servidor"

$serverUp = $false
for ($i = 1; $i -le 5; $i++) {
    try {
        Invoke-WebRequest -Uri "$BaseUrl/health" -ErrorAction Stop | Out-Null
        $serverUp = $true
        break
    } catch {
        Write-Host "  [WAIT] Tentativa $i/5 - aguardando servidor..." -ForegroundColor DarkYellow
        Start-Sleep -Seconds 1
    }
}

if (-not $serverUp) {
    Write-Host ""
    Write-Host "  [ERROR] Servidor nao esta rodando em $BaseUrl" -ForegroundColor Red
    Write-Host "  Execute primeiro: npm run dev" -ForegroundColor Yellow
    exit 1
}

Write-Host "  [OK] Servidor acessivel em $BaseUrl" -ForegroundColor Green

# ============================================================
# 1. GET /health
# ============================================================
Write-Header "1. GET /health"

$r = Invoke-API "GET" "/health"
Assert-Equal   "status HTTP deve ser 200"      $r.Status 200
Assert-Equal   "campo status deve ser 'ok'"    $r.Body.status "ok"
Assert-NotNull "campo timestamp presente"      $r.Body.timestamp
Assert-Equal   "redis deve ser 'connected'"    $r.Body.redis "connected"

# ============================================================
# 2. POST /webhook/violation — payload valido (201)
# ============================================================
Write-Header "2. POST /webhook/violation — payload valido (201)"

$uniqueAd = "ad-e2e-$(Get-Date -Format 'HHmmssfff')"

$validPayload = @{
    adId          = $uniqueAd
    tenantId      = "tenant-e2e"
    violationType = "PROHIBITED_TERM"
    severity      = "HIGH"
    detectedAt    = "2026-05-21T10:00:00.000Z"
}

$r = Invoke-API "POST" "/webhook/violation" $validPayload
Assert-Equal   "status HTTP deve ser 201"      $r.Status 201
Assert-NotNull "jobId deve estar presente"     $r.Body.jobId
Assert-Contains "jobId deve conter o adId"     $r.Body.jobId $uniqueAd

$createdJobId = $r.Body.jobId
Write-Host "  [INFO] jobId criado: $createdJobId" -ForegroundColor DarkGray

# ============================================================
# 3. POST /webhook/violation — todos os violationTypes (201)
# ============================================================
Write-Header "3. POST /webhook/violation — todos os violationTypes"

foreach ($vtype in @("PROHIBITED_TERM", "BRAND_VIOLATION", "COMPLIANCE_FAIL")) {
    $p = @{
        adId          = "ad-type-$vtype-$(Get-Random)"
        tenantId      = "tenant-types"
        violationType = $vtype
        severity      = "LOW"
        detectedAt    = "2026-05-21T10:00:00.000Z"
    }
    $r = Invoke-API "POST" "/webhook/violation" $p
    Assert-Equal "violationType=$vtype deve retornar 201" $r.Status 201
}

# ============================================================
# 4. POST /webhook/violation — todos os severities (201)
# ============================================================
Write-Header "4. POST /webhook/violation — todos os severities"

foreach ($sev in @("LOW", "MEDIUM", "HIGH", "CRITICAL")) {
    $p = @{
        adId          = "ad-sev-$sev-$(Get-Random)"
        tenantId      = "tenant-sev"
        violationType = "COMPLIANCE_FAIL"
        severity      = $sev
        detectedAt    = "2026-05-21T10:00:00.000Z"
    }
    $r = Invoke-API "POST" "/webhook/violation" $p
    Assert-Equal "severity=$sev deve retornar 201" $r.Status 201
}

# ============================================================
# 5. POST /webhook/violation — payload invalido (400)
# ============================================================
Write-Header "5. POST /webhook/violation — validacao Zod (400)"

# 5a. Payload vazio
$r = Invoke-API "POST" "/webhook/violation" @{}
Assert-Equal   "payload vazio retorna 400"          $r.Status 400
Assert-Equal   "error deve ser 'Bad request'"       $r.Body.error "Bad request"
Assert-NotNull "details deve estar presente"        $r.Body.details

# 5b. violationType invalido
$r = Invoke-API "POST" "/webhook/violation" @{
    adId = "x"; tenantId = "y"; violationType = "INVALID"; severity = "HIGH"; detectedAt = "2026-05-21T10:00:00.000Z"
}
Assert-Equal "violationType invalido retorna 400" $r.Status 400

# 5c. severity invalido
$r = Invoke-API "POST" "/webhook/violation" @{
    adId = "x"; tenantId = "y"; violationType = "PROHIBITED_TERM"; severity = "URGENT"; detectedAt = "2026-05-21T10:00:00.000Z"
}
Assert-Equal "severity invalido retorna 400" $r.Status 400

# 5d. detectedAt invalido
$r = Invoke-API "POST" "/webhook/violation" @{
    adId = "x"; tenantId = "y"; violationType = "PROHIBITED_TERM"; severity = "HIGH"; detectedAt = "nao-e-uma-data"
}
Assert-Equal "detectedAt invalido retorna 400" $r.Status 400

# 5e. adId vazio
$r = Invoke-API "POST" "/webhook/violation" @{
    adId = ""; tenantId = "y"; violationType = "PROHIBITED_TERM"; severity = "HIGH"; detectedAt = "2026-05-21T10:00:00.000Z"
}
Assert-Equal "adId vazio retorna 400" $r.Status 400

# 5f. Campo ausente (sem tenantId)
$r = Invoke-API "POST" "/webhook/violation" @{
    adId = "ok"; violationType = "PROHIBITED_TERM"; severity = "HIGH"; detectedAt = "2026-05-21T10:00:00.000Z"
}
Assert-Equal "tenantId ausente retorna 400" $r.Status 400

# ============================================================
# 6. POST /webhook/violation — idempotencia (409)
# ============================================================
Write-Header "6. POST /webhook/violation — idempotencia (409)"

$idempAd = "ad-idemp-$(Get-Date -Format 'HHmmssfff')"

$idempPayload = @{
    adId          = $idempAd
    tenantId      = "tenant-idemp"
    violationType = "BRAND_VIOLATION"
    severity      = "CRITICAL"
    detectedAt    = "2026-05-21T10:00:00.000Z"
}

$r1 = Invoke-API "POST" "/webhook/violation" $idempPayload
Assert-Equal "1 request deve retornar 201"        $r1.Status 201

$r2 = Invoke-API "POST" "/webhook/violation" $idempPayload
Assert-Equal  "2 request (duplicado) deve ser 409"  $r2.Status 409
Assert-Equal  "error deve ser 'Conflict'"            $r2.Body.error "Conflict"
Assert-Contains "mensagem deve mencionar o adId"     $r2.Body.message $idempAd

# ============================================================
# 7. GET /jobs/:id — job existente (200)
# ============================================================
Write-Header "7. GET /jobs/:id — job existente (200)"

Write-Host "  [WAIT] Aguardando worker processar o job (4s)..." -ForegroundColor DarkYellow
Start-Sleep -Seconds 4

$r = Invoke-API "GET" "/jobs/$createdJobId"
Assert-Equal   "status HTTP deve ser 200"          $r.Status 200
Assert-Equal   "jobId deve bater com o criado"     $r.Body.jobId $createdJobId
Assert-NotNull "campo status presente"             $r.Body.status
Assert-NotNull "campo attempts presente"           "$($r.Body.attempts)"

Write-Host "  [INFO] status=$($r.Body.status) | attempts=$($r.Body.attempts) | result=$($r.Body.result | ConvertTo-Json -Compress)" -ForegroundColor DarkGray

# ============================================================
# 8. GET /jobs/:id — job inexistente (404)
# ============================================================
Write-Header "8. GET /jobs/:id — job inexistente (404)"

$r = Invoke-API "GET" "/jobs/job-que-nao-existe-xyz"
Assert-Equal  "status HTTP deve ser 404"          $r.Status 404
Assert-Equal  "error deve ser 'Not found'"        $r.Body.error "Not found"
Assert-Contains "mensagem deve citar o id"        $r.Body.message "job-que-nao-existe-xyz"

# ============================================================
# Resultado Final
# ============================================================
$total = $pass + $fail
Write-Host ""
Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host "  RESULTADO FINAL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host "  Total  : $total" -ForegroundColor White
Write-Host "  PASS   : $pass" -ForegroundColor Green

if ($fail -gt 0) {
    Write-Host "  FAIL   : $fail" -ForegroundColor Red
    Write-Host ""
    exit 1
} else {
    Write-Host "  Todos os testes passaram." -ForegroundColor Green
    Write-Host ""
    exit 0
}
