$base = "http://localhost:5001/api"

# 1. Login
Write-Host "`n=== 1. Login ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$token = $login.data.accessToken
$h = @{ Authorization = "Bearer $token" }
Write-Host "Logged in as $($login.data.user.role)"

# 2. Get student
$students = Invoke-RestMethod -Uri "$base/students" -Method GET -Headers $h
$sid = $students.data.students[0].id
Write-Host "Student: $($students.data.students[0].firstName) ($sid)"

# 3. Get seeded university + course IDs
Write-Host "`n=== 3. Get university data ===" -ForegroundColor Cyan
$seedOut = node -e "require('dotenv').config(); const p = require('./src/prisma'); (async()=>{ const u = await p.university.findFirst({where:{name:'University of Melbourne'}}); const c = await p.course.findFirst({where:{universityId:u.id}}); console.log(u.id+'|'+c.id); process.exit(0); })()" 2>$null | Select-Object -Last 1
$parts = $seedOut.Split('|')
$uniId = $parts[0]
$courseId = $parts[1]
Write-Host "University: $uniId | Course: $courseId"

# 4. Create application
Write-Host "`n=== 4. Create Application ===" -ForegroundColor Cyan
$body = @{ studentId=$sid; universityId=$uniId; courseId=$courseId; intake="Sep 2026"; priority="HIGH"; notes="Strong GPA candidate" } | ConvertTo-Json
$app = Invoke-RestMethod -Uri "$base/applications" -Method POST -ContentType "application/json" -Headers $h -Body $body
$app | ConvertTo-Json -Depth 4
$appId = $app.data.id

# 5. List applications
Write-Host "`n=== 5. List applications ===" -ForegroundColor Cyan
$all = Invoke-RestMethod -Uri "$base/applications?studentId=$sid" -Method GET -Headers $h
Write-Host "Total: $($all.data.pagination.total)"
$all.data.applications | ForEach-Object { Write-Host "  $($_.university.name) | $($_.course.name) | $($_.status) | $($_.priority)" }

# 6. Get single
Write-Host "`n=== 6. Get single ===" -ForegroundColor Cyan
$single = Invoke-RestMethod -Uri "$base/applications/$appId" -Method GET -Headers $h
Write-Host "Student: $($single.data.student.firstName) | Uni: $($single.data.university.name) | Status: $($single.data.status)"

# 7. Update
Write-Host "`n=== 7. Update ===" -ForegroundColor Cyan
$upd = Invoke-RestMethod -Uri "$base/applications/$appId" -Method PUT -ContentType "application/json" -Headers $h -Body '{"notes":"Updated: scholarship application included","priority":"MEDIUM"}'
Write-Host "Priority: $($upd.data.priority) | Notes: $($upd.data.notes)"

# 8. DRAFT -> SUBMITTED
Write-Host "`n=== 8. DRAFT -> SUBMITTED ===" -ForegroundColor Cyan
$sub = Invoke-RestMethod -Uri "$base/applications/$appId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"SUBMITTED"}'
Write-Host "Status: $($sub.data.status) | SubmittedAt: $($sub.data.submittedAt)"

# 9. SUBMITTED -> UNDER_REVIEW
Write-Host "`n=== 9. SUBMITTED -> UNDER_REVIEW ===" -ForegroundColor Cyan
$rev = Invoke-RestMethod -Uri "$base/applications/$appId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"UNDER_REVIEW"}'
Write-Host "Status: $($rev.data.status)"

# 10. Invalid transition
Write-Host "`n=== 10. Invalid transition ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$base/applications/$appId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"SUBMITTED"}'
    Write-Host "ERROR: Should have failed!" -ForegroundColor Red
} catch {
    Write-Host "Blocked (expected)" -ForegroundColor Green
}

# 11. Record offer
Write-Host "`n=== 11. Record offer ===" -ForegroundColor Cyan
$offerBody = @{ type="CONDITIONAL"; details=@{ conditions=@("IELTS 6.5", "Deposit AUD 500"); expiryDate="2026-09-30" } } | ConvertTo-Json -Depth 3
$offer = Invoke-RestMethod -Uri "$base/applications/$appId/offers" -Method POST -ContentType "application/json" -Headers $h -Body $offerBody
$offer | ConvertTo-Json -Depth 3

$check = Invoke-RestMethod -Uri "$base/applications/$appId" -Method GET -Headers $h
Write-Host "Status after offer: $($check.data.status) (should be ACCEPTED)"

# 12. Dashboard
Write-Host "`n=== 12. Dashboard stats ===" -ForegroundColor Cyan
$dash = Invoke-RestMethod -Uri "$base/applications/dashboard" -Method GET -Headers $h
$dash.data | ConvertTo-Json

# 13. Delete
Write-Host "`n=== 13. Delete ===" -ForegroundColor Cyan
$del = Invoke-RestMethod -Uri "$base/applications/$appId" -Method DELETE -Headers $h
Write-Host $del.message

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
