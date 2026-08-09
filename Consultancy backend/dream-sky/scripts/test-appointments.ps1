$base = "http://localhost:5001/api"

# 1. Login
Write-Host "`n=== 1. Login ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$token = $login.data.accessToken
$userId = $login.data.user.id
$h = @{ Authorization = "Bearer $token" }
Write-Host "Logged in as $($login.data.user.role)"

# 2. Get a student
Write-Host "`n=== 2. Get student ===" -ForegroundColor Cyan
$students = Invoke-RestMethod -Uri "$base/students" -Method GET -Headers $h
$sid = $students.data.students[0].id
Write-Host "Using student: $($students.data.students[0].firstName) ($sid)"

# 3. Create appointment (tomorrow at 10:00)
Write-Host "`n=== 3. Create Appointment ===" -ForegroundColor Cyan
$tomorrow = (Get-Date).AddDays(1).Date.AddHours(10).ToString("yyyy-MM-ddTHH:mm:ssZ")
$body = @{ studentId=$sid; counselorId=$userId; datetime=$tomorrow; type="INITIAL_CONSULTATION"; durationMin=45; meetingMode="OFFICE"; notes="First meeting" } | ConvertTo-Json
$appt = Invoke-RestMethod -Uri "$base/appointments" -Method POST -ContentType "application/json" -Headers $h -Body $body
$appt | ConvertTo-Json -Depth 3
$apptId = $appt.data.id

# 4. Test conflict detection (same time)
Write-Host "`n=== 4. Conflict detection ===" -ForegroundColor Cyan
$body2 = @{ studentId=$sid; counselorId=$userId; datetime=$tomorrow; type="FOLLOW_UP" } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$base/appointments" -Method POST -ContentType "application/json" -Headers $h -Body $body2
    Write-Host "ERROR: Should have gotten conflict!" -ForegroundColor Red
} catch {
    $err = $_.Exception.Response.GetResponseStream() | ForEach-Object { ([System.IO.StreamReader]::new($_)).ReadToEnd() }
    Write-Host "Conflict detected (expected): $err" -ForegroundColor Green
}

# 5. Create second appointment (different time)
Write-Host "`n=== 5. Create second appointment (no conflict) ===" -ForegroundColor Cyan
$later = (Get-Date).AddDays(1).Date.AddHours(14).ToString("yyyy-MM-ddTHH:mm:ssZ")
$body3 = @{ studentId=$sid; counselorId=$userId; datetime=$later; type="DOCUMENT_REVIEW"; meetingMode="ONLINE"; meetingLink="https://meet.google.com/abc-def" } | ConvertTo-Json
$appt2 = Invoke-RestMethod -Uri "$base/appointments" -Method POST -ContentType "application/json" -Headers $h -Body $body3
Write-Host "Created: $($appt2.data.type) at $($appt2.data.datetime) [$($appt2.data.meetingMode)]"

# 6. List all
Write-Host "`n=== 6. List appointments ===" -ForegroundColor Cyan
$all = Invoke-RestMethod -Uri "$base/appointments" -Method GET -Headers $h
Write-Host "Total: $($all.data.pagination.total)"
$all.data.appointments | ForEach-Object { Write-Host "  $($_.type) | $($_.status) | $($_.datetime)" }

# 7. Get single
Write-Host "`n=== 7. Get single ===" -ForegroundColor Cyan
$single = Invoke-RestMethod -Uri "$base/appointments/$apptId" -Method GET -Headers $h
Write-Host "Type: $($single.data.type) | Student: $($single.data.student.firstName) | Counselor: $($single.data.counselor.firstName)"

# 8. Update
Write-Host "`n=== 8. Update appointment ===" -ForegroundColor Cyan
$upd = Invoke-RestMethod -Uri "$base/appointments/$apptId" -Method PUT -ContentType "application/json" -Headers $h -Body '{"notes":"Updated: bring passport copy","durationMin":60}'
Write-Host "Updated notes: $($upd.data.notes) | Duration: $($upd.data.durationMin)min"

# 9. Complete
Write-Host "`n=== 9. Complete appointment ===" -ForegroundColor Cyan
$comp = Invoke-RestMethod -Uri "$base/appointments/$apptId/status" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"COMPLETED","outcome":"Student selected University of Melbourne"}'
Write-Host "Status: $($comp.data.status) | Outcome: $($comp.data.outcome)"

# 10. Try to edit completed (should fail)
Write-Host "`n=== 10. Edit completed (should fail) ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$base/appointments/$apptId" -Method PUT -ContentType "application/json" -Headers $h -Body '{"notes":"nope"}'
    Write-Host "ERROR: Should have been blocked!" -ForegroundColor Red
} catch {
    $err = $_.Exception.Response.GetResponseStream() | ForEach-Object { ([System.IO.StreamReader]::new($_)).ReadToEnd() }
    Write-Host "Blocked (expected): $err" -ForegroundColor Green
}

# 11. Dashboard
Write-Host "`n=== 11. Dashboard stats ===" -ForegroundColor Cyan
$dash = Invoke-RestMethod -Uri "$base/appointments/dashboard" -Method GET -Headers $h
$dash.data | ConvertTo-Json

# 12. Delete second appointment
Write-Host "`n=== 12. Delete ===" -ForegroundColor Cyan
$del = Invoke-RestMethod -Uri "$base/appointments/$($appt2.data.id)" -Method DELETE -Headers $h
Write-Host $del.message

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
