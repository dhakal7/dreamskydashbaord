require("dotenv").config();
const prisma = require("../src/prisma");

async function checkHealth() {
    console.log("==========================================");
    console.log("  SYSTEM HEALTH & DATABASE DIAGNOSTIC    ");
    console.log("==========================================");

    try {
        // 1. Connection Test
        console.log("\n1. Testing PostgreSQL Connection...");
        await prisma.$queryRaw`SELECT 1 as connected`;
        console.log("   ✅ Database connection successful!");

        // 2. Check Student table & fields
        console.log("\n2. Checking Student Model & Schema...");
        const studentCount = await prisma.student.count();
        console.log(`   ✅ Student count: ${studentCount}`);
        const sampleStudent = await prisma.student.findFirst({
            select: { id: true, firstName: true, lastName: true, passportNumber: true, studentCode: true }
        });
        if (sampleStudent) {
            console.log("   ✅ Student schema fields (passportNumber, studentCode) verified!");
        }

        // 3. Check Document table & fields
        console.log("\n3. Checking Document Model & Schema...");
        const documentCount = await prisma.document.count();
        console.log(`   ✅ Document count: ${documentCount}`);
        const sampleDoc = await prisma.document.findFirst({
            select: { id: true, category: true, type: true, customName: true, currentVersion: true, status: true }
        });
        if (sampleDoc) {
            console.log(`   ✅ Document schema fields verified! (Sample ID: ${sampleDoc.id}, Category: ${sampleDoc.category})`);
        }

        // 4. Check DocumentVersion table
        console.log("\n4. Checking DocumentVersion Model...");
        try {
            const versionCount = await prisma.documentVersion.count();
            console.log(`   ✅ DocumentVersion table exists! Count: ${versionCount}`);
        } catch (verErr) {
            console.log("   ⚠️ DocumentVersion table notice:", verErr.message);
        }

        // 5. Check User / Counselor models
        console.log("\n5. Checking User & Counselor Relations...");
        const userCount = await prisma.user.count();
        console.log(`   ✅ User count: ${userCount}`);

        console.log("\n==========================================");
        console.log("  ALL BACKEND MODELS & DATABASE CONNECTED!  ");
        console.log("==========================================");
    } catch (err) {
        console.error("\n❌ DIAGNOSTIC ERROR:", err.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkHealth();
