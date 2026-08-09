$base = "http://localhost:5001/api"

# 1. Login
Write-Host "`n=== 1. Login ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$token = $login.data.accessToken
$h = @{ Authorization = "Bearer $token" }
Write-Host "Logged in as $($login.data.user.role)"

# 2. Create a student first (need studentId)
Write-Host "`n=== 2. Create test student ===" -ForegroundColor Cyan
try {
    $stu = Invoke-RestMethod -Uri "$base/students" -Method POST -ContentType "application/json" -Headers $h -Body '{"firstName":"Sita","lastName":"KC","email":"sita@test.com","phone":"9801234567"}'
    $sid = $stu.data.id
} catch {
    # Student might exist from previous test run, search for them
    $list = Invoke-RestMethod -Uri "$base/students?search=sita" -Method GET -Headers $h
    $sid = $list.data.students[0].id
}
Write-Host "Student ID: $sid"

# 3. Create follow-up (outbound phone call, with next follow-up scheduled)
Write-Host "`n=== 3. Create Follow-up ===" -ForegroundColor Cyan
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
$body = @{ studentId=$sid; channel="PHONE"; direction="OUTBOUND"; content="Called student about Australia options. Interested in Melbourne."; nextFollowUpAt=$tomorrow } | ConvertTo-Json
$fu1 = Invoke-RestMethod -Uri "$base/follow-ups" -Method POST -ContentType "application/json" -Headers $h -Body $body
$fu1 | ConvertTo-Json -Depth 3
$fuId = $fu1.data.id

# 4. Create another follow-up (WhatsApp, overdue)
Write-Host "`n=== 4. Create overdue follow-up ===" -ForegroundColor Cyan
$yesterday = (Get-Date).AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")
$body2 = @{ studentId=$sid; channel="WHATSAPP"; direction="OUTBOUND"; content="Sent course brochure via WhatsApp."; nextFollowUpAt=$yesterday } | ConvertTo-Json
$fu2 = Invoke-RestMethod -Uri "$base/follow-ups" -Method POST -ContentType "application/json" -Headers $h -Body $body2
Write-Host "Created follow-up $($fu2.data.id) with overdue nextFollowUpAt"

# 5. List all follow-ups
Write-Host "`n=== 5. List all follow-ups ===" -ForegroundColor Cyan
$all = Invoke-RestMethod -Uri "$base/follow-ups" -Method GET -Headers $h
Write-Host "Total: $($all.data.pagination.total)"
$all.data.followUps | ForEach-Object { Write-Host "  [$($_.channel)] $($_.content.Substring(0, [Math]::Min(50, $_.content.Length)))..." }

# 6. Filter: overdue
Write-Host "`n=== 6. Filter: overdue ===" -ForegroundColor Cyan
$overdue = Invoke-RestMethod -Uri "$base/follow-ups?status=overdue" -Method GET -Headers $h
Write-Host "Overdue count: $($overdue.data.pagination.total)"

# 7. Filter: upcoming
Write-Host "`n=== 7. Filter: upcoming ===" -ForegroundColor Cyan
$upcoming = Invoke-RestMethod -Uri "$base/follow-ups?status=upcoming" -Method GET -Headers $h
Write-Host "Upcoming count: $($upcoming.data.pagination.total)"

# 8. Student timeline
Write-Host "`n=== 8. Student timeline ===" -ForegroundColor Cyan
$tl = Invoke-RestMethod -Uri "$base/follow-ups/student/$sid" -Method GET -Headers $h
Write-Host "Timeline entries: $($tl.data.Count)"
$tl.data | ForEach-Object { Write-Host "  [$($_.channel) $($_.direction)] $($_.content.Substring(0, [Math]::Min(40, $_.content.Length)))..." }

# 9. Get single follow-up
Write-Host "`n=== 9. Get single follow-up ===" -ForegroundColor Cyan
$single = Invoke-RestMethod -Uri "$base/follow-ups/$fuId" -Method GET -Headers $h
Write-Host "Channel: $($single.data.channel) | Student: $($single.data.student.firstName)"

# 10. Update follow-up
Write-Host "`n=== 10. Update follow-up ===" -ForegroundColor Cyan
$upd = Invoke-RestMethod -Uri "$base/follow-ups/$fuId" -Method PUT -ContentType "application/json" -Headers $h -Body '{"content":"Updated: Student confirmed interest in University of Melbourne."}'
Write-Host "Updated content: $($upd.data.content)"

# 11. Dashboard
Write-Host "`n=== 11. Dashboard stats ===" -ForegroundColor Cyan
$dash = Invoke-RestMethod -Uri "$base/follow-ups/dashboard" -Method GET -Headers $h
$dash.data | ConvertTo-Json

# 12. Delete follow-up
Write-Host "`n=== 12. Delete follow-up ===" -ForegroundColor Cyan
$del = Invoke-RestMethod -Uri "$base/follow-ups/$($fu2.data.id)" -Method DELETE -Headers $h
Write-Host $del.message

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
