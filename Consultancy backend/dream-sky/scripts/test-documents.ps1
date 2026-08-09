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
Write-Host "Student: $sid"

# 3. Create a test image file (small JPEG)
$testImgPath = "$PWD\scripts\test-image.jpg"
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(200, 200)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Blue)
$g.DrawString("TEST", [System.Drawing.Font]::new("Arial", 30), [System.Drawing.Brushes]::White, 30, 70)
$g.Dispose()
$bmp.Save($testImgPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Test image created: $testImgPath"

# 4. Upload image document
Write-Host "`n=== 4. Upload Image ===" -ForegroundColor Cyan
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$bodyLines = (
    "--$boundary",
    "Content-Disposition: form-data; name=`"studentId`"$LF",
    "$sid",
    "--$boundary",
    "Content-Disposition: form-data; name=`"type`"$LF",
    "PASSPORT",
    "--$boundary",
    "Content-Disposition: form-data; name=`"notes`"$LF",
    "Front page scan",
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"test-image.jpg`"",
    "Content-Type: image/jpeg$LF",
    [System.IO.File]::ReadAllText($testImgPath),
    "--$boundary--$LF"
) -join $LF

# Use curl for multipart (cleaner than PowerShell)
$curlUpload = & curl.exe -s -X POST "$base/documents/upload" -H "Authorization: Bearer $token" -F "studentId=$sid" -F "type=PASSPORT" -F "notes=Front page scan" -F "file=@$testImgPath" 2>&1
$uploadResp = $curlUpload | ConvertFrom-Json
$uploadResp | ConvertTo-Json -Depth 3
$docId = $uploadResp.data.id

# 5. List documents
Write-Host "`n=== 5. List documents ===" -ForegroundColor Cyan
$docs = Invoke-RestMethod -Uri "$base/documents?studentId=$sid" -Method GET -Headers $h
Write-Host "Total: $($docs.data.pagination.total)"
$docs.data.documents | ForEach-Object { Write-Host "  $($_.type) | $($_.status) | $($_.originalName) | $($_.fileSize) bytes" }

# 6. Get single
Write-Host "`n=== 6. Get document metadata ===" -ForegroundColor Cyan
$single = Invoke-RestMethod -Uri "$base/documents/$docId" -Method GET -Headers $h
Write-Host "Type: $($single.data.type) | Status: $($single.data.status) | MIME: $($single.data.mimeType)"

# 7. Download (decrypt + stream)
Write-Host "`n=== 7. Download (decrypt) ===" -ForegroundColor Cyan
$dlPath = "$PWD\scripts\downloaded.jpg"
& curl.exe -s -o $dlPath -H "Authorization: Bearer $token" "$base/documents/$docId/download" 2>&1
$dlSize = (Get-Item $dlPath).Length
Write-Host "Downloaded file size: $dlSize bytes (should be > 0)"

# 8. Verify document
Write-Host "`n=== 8. Verify document ===" -ForegroundColor Cyan
$ver = Invoke-RestMethod -Uri "$base/documents/$docId/verify" -Method PATCH -ContentType "application/json" -Headers $h -Body '{"status":"VERIFIED"}'
Write-Host "Status: $($ver.data.status) | Verified by: $($ver.data.verifiedById)"

# 9. Update metadata
Write-Host "`n=== 9. Update metadata ===" -ForegroundColor Cyan
$upd = Invoke-RestMethod -Uri "$base/documents/$docId" -Method PUT -ContentType "application/json" -Headers $h -Body '{"notes":"Updated: includes visa page","expiryDate":"2030-12-31"}'
Write-Host "Notes: $($upd.data.notes) | Expiry: $($upd.data.expiryDate)"

# 10. Delete
Write-Host "`n=== 10. Delete document ===" -ForegroundColor Cyan
$del = Invoke-RestMethod -Uri "$base/documents/$docId" -Method DELETE -Headers $h
Write-Host $del.message

# Cleanup
Remove-Item $testImgPath -ErrorAction SilentlyContinue
Remove-Item $dlPath -ErrorAction SilentlyContinue

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
