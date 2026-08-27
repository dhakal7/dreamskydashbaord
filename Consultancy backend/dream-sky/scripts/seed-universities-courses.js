const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const prisma = require("../src/prisma");

const targetCountries = [
  { name: "Australia", code: "AU" },
  { name: "United Kingdom", code: "UK" },
  { name: "Canada", code: "CA" },
  { name: "United States", code: "US" },
  { name: "New Zealand", code: "NZ" },
];

const targetUniversities = [
  // Australia
  { name: "University of Melbourne", countryCode: "AU", city: "Melbourne", ranking: 14, website: "https://unimelb.edu.au" },
  { name: "Monash University", countryCode: "AU", city: "Melbourne", ranking: 42, website: "https://monash.edu" },
  { name: "University of Sydney", countryCode: "AU", city: "Sydney", ranking: 19, website: "https://sydney.edu.au" },
  { name: "RMIT University", countryCode: "AU", city: "Melbourne", ranking: 140, website: "https://rmit.edu.au" },
  { name: "Deakin University", countryCode: "AU", city: "Geelong", ranking: 251, website: "https://deakin.edu.au" },
  { name: "Griffith University", countryCode: "AU", city: "Brisbane", ranking: 301, website: "https://griffith.edu.au" },

  // UK
  { name: "University of Manchester", countryCode: "UK", city: "Manchester", ranking: 32, website: "https://manchester.ac.uk" },
  { name: "University of Leeds", countryCode: "UK", city: "Leeds", ranking: 75, website: "https://leeds.ac.uk" },
  { name: "Coventry University", countryCode: "UK", city: "Coventry", ranking: 501, website: "https://coventry.ac.uk" },
  { name: "University of Greenwich", countryCode: "UK", city: "London", ranking: 601, website: "https://gre.ac.uk" },
  { name: "Cardiff Metropolitan University", countryCode: "UK", city: "Cardiff", ranking: 701, website: "https://cardiffmet.ac.uk" },

  // Canada
  { name: "University of Toronto", countryCode: "CA", city: "Toronto", ranking: 21, website: "https://utoronto.ca" },
  { name: "Conestoga College", countryCode: "CA", city: "Kitchener", ranking: 851, website: "https://conestogac.on.ca" },
  { name: "Centennial College", countryCode: "CA", city: "Toronto", ranking: 901, website: "https://centennialcollege.ca" },
  { name: "Douglas College", countryCode: "CA", city: "New Westminster", ranking: 1001, website: "https://douglascollege.ca" },

  // USA
  { name: "Arizona State University", countryCode: "US", city: "Tempe", ranking: 121, website: "https://asu.edu" },
  { name: "University of Illinois Chicago", countryCode: "US", city: "Chicago", ranking: 251, website: "https://uic.edu" },
  { name: "Northeastern University", countryCode: "US", city: "Boston", ranking: 176, website: "https://northeastern.edu" },

  // NZ
  { name: "University of Auckland", countryCode: "NZ", city: "Auckland", ranking: 68, website: "https://auckland.ac.nz" },
  { name: "Auckland University of Technology", countryCode: "NZ", city: "Auckland", ranking: 401, website: "https://aut.ac.nz" },
];

const sampleCourses = [
  { name: "Bachelor of Business Administration", level: "BACHELOR", durationMonths: 36, tuitionFee: 24000 },
  { name: "Master of Business Administration (MBA)", level: "MASTER", durationMonths: 24, tuitionFee: 28000 },
  { name: "Diploma in Business Management", level: "DIPLOMA", durationMonths: 12, tuitionFee: 15000 },
  { name: "Bachelor of Computer Science", level: "BACHELOR", durationMonths: 36, tuitionFee: 26000 },
  { name: "Master of Data Analytics", level: "MASTER", durationMonths: 24, tuitionFee: 30000 },
  { name: "Diploma in Early Childhood Education", level: "DIPLOMA", durationMonths: 12, tuitionFee: 16000 },
];

async function seedCatalog() {
  console.log("==========================================");
  console.log("  SEEDING UNIVERSITIES & COURSES CATALOG  ");
  console.log("==========================================");

  // 1. Remove any outdated Japan/Germany/Malta records from DB
  const removedCountries = await prisma.country.deleteMany({
    where: { code: { in: ["JP", "DE", "MT"] } },
  }).catch(() => ({ count: 0 }));
  console.log(`   🧹 Removed ${removedCountries.count} legacy countries (Japan/Germany/Malta)`);

  const countryIdMap = {};

  // 2. Upsert Countries
  for (const c of targetCountries) {
    const record = await prisma.country.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: { name: c.name, code: c.code },
    });
    countryIdMap[c.code] = record.id;
    console.log(`   ✅ Country: ${c.name} (${c.code})`);
  }

  // 3. Upsert Universities & Courses
  for (const u of targetUniversities) {
    const countryId = countryIdMap[u.countryCode];
    if (!countryId) continue;

    let uni = await prisma.university.findFirst({
      where: { name: u.name, countryId },
    });

    if (!uni) {
      uni = await prisma.university.create({
        data: {
          name: u.name,
          countryId,
          city: u.city,
          ranking: u.ranking,
          website: u.website,
          isActive: true,
        },
      });
    }

    console.log(`   🏛️  University: ${u.name} [${u.city}]`);

    // Add 3 sample courses per university if missing
    for (const course of sampleCourses.slice(0, 3)) {
      const existingCourse = await prisma.course.findFirst({
        where: { universityId: uni.id, name: course.name },
      });

      if (!existingCourse) {
        await prisma.course.create({
          data: {
            universityId: uni.id,
            name: course.name,
            level: course.level,
            durationMonths: course.durationMonths,
            tuitionFee: course.tuitionFee,
            isActive: true,
          },
        });
      }
    }
  }

  console.log("\n==========================================");
  console.log("  CATALOG SEED COMPLETED SUCCESSFULLY!    ");
  console.log("==========================================");
  process.exit(0);
}

seedCatalog().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
