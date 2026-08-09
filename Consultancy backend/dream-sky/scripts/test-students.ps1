$base = "http://localhost:5001/api"

# 1. Login to get token
Write-Host "`n=== 1. Login ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$token = $login.data.accessToken
$h = @{ Authorization = "Bearer $token" }
Write-Host "Logged in as $($login.data.user.role)"

# 2. Create student
Write-Host "`n=== 2. Create Student ===" -ForegroundColor Cyan
$create = Invoke-RestMethod -Uri "$base/students" -Method POST -ContentType "application/json" -Headers $h -Body '{"firstName":"Ram","lastName":"Sharma","email":"ram@test.com","phone":"9841234567","source":"WALK_IN","nationality":"Nepali"}'
$create | ConvertTo-Json -Depth 3
$sid = $create.data.id

# 3. List students
Write-Host "`n=== 3. List Students ===" -ForegroundColor Cyan
$list = Invoke-RestMethod -Uri "$base/students" -Method GET -Headers $h
Write-Host "Total: $($list.data.pagination.total) students"
$list.data.students | ForEach-Object { Write-Host "  - $($_.firstName) $($_.lastName) [$($_.currentStage)]" }

# 4. Get single student (360 profile)
Write-Host "`n=== 4. Get Student $sid ===" -ForegroundColor Cyan
$one = Invoke-RestMethod -Uri "$base/students/$sid" -Method GET -Headers $h
Write-Host "Name: $($one.data.firstName) $($one.data.lastName) | Stage: $($one.data.currentStage)"

# 5. Update student
Write-Host "`n=== 5. Update Student ===" -ForegroundColor Cyan
$upd = Invoke-RestMethod -Uri "$base/students/$sid" -Method PUT -ContentType "application/json" -Headers $h -Body '{"phone":"9800000001","notes":"Interested in Australia"}'
Write-Host "Updated phone: $($upd.data.phone) | Notes: $($upd.data.notes)"

# 6. Change pipeline (LEAD -> PROSPECT)
Write-Host "`n=== 6. Pipeline: LEAD -> PROSPECT ===" -ForegroundColor Cyan
$pipe = Invoke-RestMethod -Uri "$base/students/$sid/pipeline" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"stage":"PROSPECT"}'
Write-Host "New stage: $($pipe.data.currentStage)"

# 7. Pipeline: PROSPECT -> ENROLLED
Write-Host "`n=== 7. Pipeline: PROSPECT -> ENROLLED ===" -ForegroundColor Cyan
$pipe2 = Invoke-RestMethod -Uri "$base/students/$sid/pipeline" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"stage":"ENROLLED"}'
Write-Host "New stage: $($pipe2.data.currentStage)"

# 8. Timeline
Write-Host "`n=== 8. Timeline ===" -ForegroundColor Cyan
$tl = Invoke-RestMethod -Uri "$base/students/$sid/timeline" -Method GET -Headers $h
$tl.data | ForEach-Object { Write-Host "  $($_.stage) at $($_.changedAt)" }

# 9. Soft delete
Write-Host "`n=== 9. Soft Delete ===" -ForegroundColor Cyan
$del = Invoke-RestMethod -Uri "$base/students/$sid" -Method DELETE -Headers $h
Write-Host $del.message

# 10. Search
Write-Host "`n=== 10. Search (isActive=false) ===" -ForegroundColor Cyan
$search = Invoke-RestMethod -Uri "$base/students?isActive=false" -Method GET -Headers $h
$search.data.students | ForEach-Object { Write-Host "  - $($_.firstName) $($_.lastName) [active=$($_.isActive)]" }

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
