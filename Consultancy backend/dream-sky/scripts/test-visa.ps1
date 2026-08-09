$base = "http://localhost:5001/api"

# 1. Login
Write-Host "`n=== 1. Login ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$token = $login.data.accessToken
$h = @{ Authorization = "Bearer $token" }
Write-Host "Logged in as $($login.data.user.role)"

# 2. Get student + university + course
$students = Invoke-RestMethod -Uri "$base/students" -Method GET -Headers $h
$sid = $students.data.students[0].id
Write-Host "Student: $sid"

$seedOut = node -e "require('dotenv').config(); const p = require('./src/prisma'); (async()=>{ const u = await p.university.findFirst(); const c = await p.course.findFirst({where:{universityId:u.id}}); console.log(u.id+'|'+c.id); process.exit(0); })()" 2>$null | Select-Object -Last 1
$parts = $seedOut.Split('|')
$uniId = $parts[0]; $courseId = $parts[1]

# 3. Create application + accept it (need an ACCEPTED app for visa)
Write-Host "`n=== 3. Create ACCEPTED application ===" -ForegroundColor Cyan
$appBody = @{ studentId=$sid; universityId=$uniId; courseId=$courseId; intake="Sep 2026" } | ConvertTo-Json
$app = Invoke-RestMethod -Uri "$base/applications" -Method POST -ContentType "application/json" -Headers $h -Body $appBody
$appId = $app.data.id
# DRAFT -> SUBMITTED -> UNDER_REVIEW, then record offer (auto-ACCEPTED)
Invoke-RestMethod -Uri "$base/applications/$appId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"SUBMITTED"}' | Out-Null
Invoke-RestMethod -Uri "$base/applications/$appId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"UNDER_REVIEW"}' | Out-Null
$offerBody = @{ type="UNCONDITIONAL" } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/applications/$appId/offers" -Method POST -ContentType "application/json" -Headers $h -Body $offerBody | Out-Null
$checkApp = Invoke-RestMethod -Uri "$base/applications/$appId" -Method GET -Headers $h
Write-Host "Application $appId is $($checkApp.data.status)"

# 4. Try creating visa for DRAFT app (should fail)
Write-Host "`n=== 4. Visa from non-ACCEPTED app (should fail) ===" -ForegroundColor Cyan
$draftApp = Invoke-RestMethod -Uri "$base/applications" -Method POST -ContentType "application/json" -Headers $h -Body (@{ studentId=$sid; universityId=$uniId; courseId=$courseId } | ConvertTo-Json)
$draftAppId = $draftApp.data.id
try {
    Invoke-RestMethod -Uri "$base/visa-cases" -Method POST -ContentType "application/json" -Headers $h -Body (@{ applicationId=$draftAppId } | ConvertTo-Json)
    Write-Host "ERROR: Should have failed!" -ForegroundColor Red
} catch { Write-Host "Blocked (expected): application not ACCEPTED" -ForegroundColor Green }
# Cleanup draft app
Invoke-RestMethod -Uri "$base/applications/$draftAppId" -Method DELETE -Headers $h | Out-Null

# 5. Create visa case
Write-Host "`n=== 5. Create Visa Case ===" -ForegroundColor Cyan
$vcBody = @{ applicationId=$appId; visaType="Student Visa Subclass 500"; embassy="VFS Kathmandu"; notes="Priority processing" } | ConvertTo-Json
$vc = Invoke-RestMethod -Uri "$base/visa-cases" -Method POST -ContentType "application/json" -Headers $h -Body $vcBody
$vc | ConvertTo-Json -Depth 5
$vcId = $vc.data.id

# 6. Duplicate visa case (should fail)
Write-Host "`n=== 6. Duplicate visa (should fail) ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$base/visa-cases" -Method POST -ContentType "application/json" -Headers $h -Body (@{ applicationId=$appId } | ConvertTo-Json)
    Write-Host "ERROR: Should have failed!" -ForegroundColor Red
} catch { Write-Host "Blocked (expected): duplicate" -ForegroundColor Green }

# 7. List
Write-Host "`n=== 7. List visa cases ===" -ForegroundColor Cyan
$all = Invoke-RestMethod -Uri "$base/visa-cases" -Method GET -Headers $h
Write-Host "Total: $($all.data.pagination.total)"
$all.data.visaCases | ForEach-Object { Write-Host "  $($_.status) | $($_.visaType) | $($_.embassy)" }

# 8. Get single
Write-Host "`n=== 8. Get single ===" -ForegroundColor Cyan
$single = Invoke-RestMethod -Uri "$base/visa-cases/$vcId" -Method GET -Headers $h
Write-Host "Status: $($single.data.status) | Student: $($single.data.application.student.firstName) | Uni: $($single.data.application.university.name)"

# 9. Update
Write-Host "`n=== 9. Update ===" -ForegroundColor Cyan
$upd = Invoke-RestMethod -Uri "$base/visa-cases/$vcId" -Method PUT -ContentType "application/json" -Headers $h -Body '{"notes":"Updated: medical report submitted"}'
Write-Host "Notes: $($upd.data.notes)"

# 10. Status transitions: NOT_APPLIED -> PREPARING -> SUBMITTED
Write-Host "`n=== 10. Status: NOT_APPLIED -> PREPARING ===" -ForegroundColor Cyan
$s1 = Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"PREPARING"}'
Write-Host "Status: $($s1.data.status)"

Write-Host "`n=== 11. Status: PREPARING -> SUBMITTED ===" -ForegroundColor Cyan
$s2 = Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"SUBMITTED"}'
Write-Host "Status: $($s2.data.status) | SubmittedAt: $($s2.data.submittedAt)"

# 12. Invalid transition
Write-Host "`n=== 12. Invalid: SUBMITTED -> PREPARING ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"PREPARING"}'
    Write-Host "ERROR!" -ForegroundColor Red
} catch { Write-Host "Blocked (expected)" -ForegroundColor Green }

# 13. SUBMITTED -> REFUSED (with reason)
Write-Host "`n=== 13. SUBMITTED -> REFUSED ===" -ForegroundColor Cyan
$s3 = Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"REFUSED","refusalReason":"Insufficient financial documents"}'
Write-Host "Status: $($s3.data.status) | Reason: $($s3.data.refusalReason) | DecisionAt: $($s3.data.decisionAt)"

# 14. REFUSED -> RESUBMITTING -> SUBMITTED -> APPROVED
Write-Host "`n=== 14. Resubmit -> Approve ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"RESUBMITTING"}' | Out-Null
Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"SUBMITTED"}' | Out-Null
$s4 = Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"APPROVED"}'
Write-Host "Status: $($s4.data.status) | DecisionAt: $($s4.data.decisionAt)"

# 15. APPROVED is terminal
Write-Host "`n=== 15. APPROVED is terminal ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$base/visa-cases/$vcId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"PREPARING"}'
    Write-Host "ERROR!" -ForegroundColor Red
} catch { Write-Host "Blocked (expected): terminal" -ForegroundColor Green }

# 16. Dashboard
Write-Host "`n=== 16. Dashboard ===" -ForegroundColor Cyan
$dash = Invoke-RestMethod -Uri "$base/visa-cases/dashboard" -Method GET -Headers $h
$dash.data | ConvertTo-Json

# 17. Delete
Write-Host "`n=== 17. Delete ===" -ForegroundColor Cyan
$del = Invoke-RestMethod -Uri "$base/visa-cases/$vcId" -Method DELETE -Headers $h
Write-Host $del.message

# Cleanup application
Invoke-RestMethod -Uri "$base/applications/$appId" -Method DELETE -Headers $h | Out-Null

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
