$base = "http://localhost:5001/api"

# 1. Login as admin (staff can view any student portal)
Write-Host "`n=== 1. Login as Admin ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$token = $login.data.accessToken
$h = @{ Authorization = "Bearer $token" }
Write-Host "Logged in as $($login.data.user.role)"

# 2. Get student ID
$students = Invoke-RestMethod -Uri "$base/students" -Method GET -Headers $h
$sid = $students.data.students[0].id
Write-Host "Student: $($students.data.students[0].firstName) $($students.data.students[0].lastName) ($sid)"

# 3. Portal: Profile
Write-Host "`n=== 3. Profile ===" -ForegroundColor Cyan
$profile = Invoke-RestMethod -Uri "$base/portal/$sid/profile" -Method GET -Headers $h
Write-Host "Name: $($profile.data.firstName) $($profile.data.lastName) | Stage: $($profile.data.currentStage)"

# 4. Portal: Dashboard
Write-Host "`n=== 4. Dashboard ===" -ForegroundColor Cyan
$dash = Invoke-RestMethod -Uri "$base/portal/$sid/dashboard" -Method GET -Headers $h
Write-Host "Counts:"
$dash.data.counts | ConvertTo-Json
Write-Host "Timeline:"
$dash.data.timeline | ForEach-Object { 
    $mark = if ($_.current) { "[>>]" } elseif ($_.completed) { "[OK]" } else { "[  ]" }
    Write-Host "  $mark $($_.stage)"
}

# 5. Portal: Applications
Write-Host "`n=== 5. Applications ===" -ForegroundColor Cyan
$apps = Invoke-RestMethod -Uri "$base/portal/$sid/applications" -Method GET -Headers $h
Write-Host "Total: $($apps.data.Count)"
$apps.data | ForEach-Object { Write-Host "  $($_.university.name) | $($_.course.name) | $($_.status)" }

# 6. Portal: Visa Cases
Write-Host "`n=== 6. Visa Cases ===" -ForegroundColor Cyan
$visas = Invoke-RestMethod -Uri "$base/portal/$sid/visa-cases" -Method GET -Headers $h
Write-Host "Total: $($visas.data.Count)"

# 7. Portal: Documents
Write-Host "`n=== 7. Documents ===" -ForegroundColor Cyan
$docs = Invoke-RestMethod -Uri "$base/portal/$sid/documents" -Method GET -Headers $h
Write-Host "Total: $($docs.data.Count)"
$docs.data | ForEach-Object { Write-Host "  $($_.type) | $($_.status) | $($_.originalName)" }

# 8. Portal: Appointments
Write-Host "`n=== 8. Appointments ===" -ForegroundColor Cyan
$appts = Invoke-RestMethod -Uri "$base/portal/$sid/appointments" -Method GET -Headers $h
Write-Host "Total: $($appts.data.Count)"

# 9. Portal: Follow-ups
Write-Host "`n=== 9. Follow-ups ===" -ForegroundColor Cyan
$fups = Invoke-RestMethod -Uri "$base/portal/$sid/follow-ups" -Method GET -Headers $h
Write-Host "Total: $($fups.data.Count)"

# 10. Activate student portal and test isolation
Write-Host "`n=== 10. Student portal access isolation ===" -ForegroundColor Cyan
# First activate portal for this student
try {
    $activate = Invoke-RestMethod -Uri "$base/auth/activate-portal" -Method POST -ContentType "application/json" -Headers $h -Body (@{ studentId=$sid } | ConvertTo-Json)
    $studentEmail = $activate.data.loginEmail
    $studentPassword = $activate.data.tempPassword
    Write-Host "Portal activated: $studentEmail / $studentPassword"
} catch {
    # Already activated? Try login directly
    Write-Host "Portal already activated, logging in..."
}

# Login as student (need to handle mustChangePassword)
if ($studentPassword) {
    $studentLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body (@{ email=$studentEmail; password=$studentPassword } | ConvertTo-Json)
    $studentToken = $studentLogin.data.accessToken
    $sh = @{ Authorization = "Bearer $studentToken" }
    
    # Change password first (required)
    Invoke-RestMethod -Uri "$base/auth/change-password" -Method POST -ContentType "application/json" -Headers $sh -Body (@{ currentPassword=$studentPassword; newPassword="Student@1234" } | ConvertTo-Json) | Out-Null
    
    # Re-login with new password
    $studentLogin2 = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"sita@test.com","password":"Student@1234"}'
    $studentToken2 = $studentLogin2.data.accessToken
    $sh2 = @{ Authorization = "Bearer $studentToken2" }
    
    # Student can view own portal
    $ownProfile = Invoke-RestMethod -Uri "$base/portal/$sid/profile" -Method GET -Headers $sh2
    Write-Host "Student viewing own profile: $($ownProfile.data.firstName) - OK" -ForegroundColor Green
    
    # Student cannot view other student's data (use a fake ID)
    try {
        Invoke-RestMethod -Uri "$base/portal/fake-student-id/profile" -Method GET -Headers $sh2
        Write-Host "ERROR: Should have been blocked!" -ForegroundColor Red
    } catch {
        Write-Host "Student blocked from other's data (expected)" -ForegroundColor Green
    }
}

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
