$base = "http://localhost:5001/api/auth"

Write-Host "`n=== 1. Login (valid) ===" -ForegroundColor Cyan
$loginResp = Invoke-RestMethod -Uri "$base/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$loginResp | ConvertTo-Json
$access  = $loginResp.data.accessToken
$refresh = $loginResp.data.refreshToken

Write-Host "`n=== 2. GET /me (valid token) ===" -ForegroundColor Cyan
$headers = @{ Authorization = "Bearer $access" }
Invoke-RestMethod -Uri "$base/me" -Method GET -Headers $headers | ConvertTo-Json

Write-Host "`n=== 3. Refresh token ===" -ForegroundColor Cyan
$newTokens = Invoke-RestMethod -Uri "$base/refresh" -Method POST -ContentType "application/json" -Body "{`"refreshToken`":`"$refresh`"}"
$newTokens | ConvertTo-Json
$newAccess  = $newTokens.data.accessToken
$newRefresh = $newTokens.data.refreshToken

Write-Host "`n=== 4. Logout ===" -ForegroundColor Cyan
$headers2 = @{ Authorization = "Bearer $newAccess" }
Invoke-RestMethod -Uri "$base/logout" -Method POST -ContentType "application/json" -Headers $headers2 -Body "{`"refreshToken`":`"$newRefresh`"}" | ConvertTo-Json

Write-Host "`n=== 5. Activate portal (as STUDENT role - should 403) ===" -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$base/activate-student-portal" -Method POST -ContentType "application/json" -Headers $headers2 -Body '{"studentId":"fake-id"}'
} catch {
  $_.Exception.Response.GetResponseStream() | ForEach-Object {
    ([System.IO.StreamReader]::new($_)).ReadToEnd()
  }
}
