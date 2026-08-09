const { Client } = require('pg');
require('dotenv').config({ path: './.env' });
(async () => {
  const raw = process.env.DATABASE_URL;
  if (!raw) { console.error('DATABASE_URL not set in .env'); process.exit(2); }
  const connectionString = raw.replace(/\?.*$/, '');
  const client = new Client({ connectionString });
  await client.connect();
  try{
    const cols = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE (column_name ILIKE '%assigned%counselor%' OR column_name ILIKE '%assigned_counselor%') AND table_schema='public';"
    );
    console.log('discovered columns:', cols.rows);
    const counselorIdSet = new Set();
    for (const r of cols.rows) {
      const table = r.table_name;
      const col = r.column_name;
      const q = `SELECT "${col}" AS counselor_id, COUNT(*) AS student_count FROM "${table}" WHERE "${col}" IS NOT NULL GROUP BY "${col}" ORDER BY student_count DESC;`;
      try{
        const res = await client.query(q);
        console.log(`\nCounts for ${table}.${col}:`, res.rows);
        for (const row of res.rows) counselorIdSet.add(row.counselor_id);
      }catch(e){
        console.error(`query failed for ${table}.${col}:`, e.message);
      }
    }
    // Produce a joined report of counselors with counts
    try {
      const report = await client.query(`
        SELECT u.id AS counselor_id, u."firstName" AS first_name, u."lastName" AS last_name, u.email,
               COUNT(s.id) AS student_count
        FROM "Student" s
        JOIN "User" u ON s."assignedCounselorId" = u.id
        WHERE s."assignedCounselorId" IS NOT NULL
        GROUP BY u.id, u."firstName", u."lastName", u.email
        ORDER BY student_count DESC;
      `);
      console.log('\nJoined report:');
      for (const r of report.rows) {
        console.log(`${r.counselor_id}: ${r.first_name || ''} ${r.last_name || ''} <${r.email || ''}> — ${r.student_count}`);
        // breakdown by currentStage and status for this counselor
        try {
          const byStage = await client.query(`SELECT "currentStage", COUNT(*) FROM "Student" WHERE "assignedCounselorId" = $1 GROUP BY "currentStage";`, [r.counselor_id]);
          if (byStage.rows.length) console.log('  by currentStage:', byStage.rows);
        } catch (e) { /* ignore */ }
        try {
          const byStatus = await client.query(`SELECT status, COUNT(*) FROM "Student" WHERE "assignedCounselorId" = $1 GROUP BY status;`, [r.counselor_id]);
          if (byStatus.rows.length) console.log('  by status:', byStatus.rows);
        } catch (e) { /* ignore */ }
        try {
          const sample = await client.query(`SELECT id, firstName, lastName, email, status, "currentStage" FROM "Student" WHERE "assignedCounselorId" = $1 ORDER BY "createdAt" DESC LIMIT 10;`, [r.counselor_id]);
          console.log('  sample recent students:', sample.rows.map(s => ({ id: s.id, name: `${s.firstName||''} ${s.lastName||''}`, status: s.status, stage: s.currentStage })));
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      console.error('failed to produce joined report:', e.message);
    }
      // Resolve counselor user details for discovered IDs
      const counselorIds = Array.from(counselorIdSet).filter(Boolean);
      if (counselorIds.length > 0) {
        try {
          const colsUser = await client.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND table_schema='public';"
          );
          console.log('\nUser table columns:', colsUser.rows.map(r=>r.column_name));

          // show a full row for the first counselor id to inspect actual column names
          const sampleId = counselorIds[0];
          try {
            const full = await client.query(`SELECT * FROM "User" WHERE id = $1 LIMIT 1;`, [sampleId]);
            console.log('\nSample User row for', sampleId, full.rows[0]);
          } catch (e) {
            console.error('failed to select full user row:', e.message);
          }

          const usersQ = await client.query(`SELECT * FROM "User" WHERE id = ANY($1);`, [counselorIds]);
          console.log('\nCounselor user records (raw):');
          for (const u of usersQ.rows) {
            console.log('- id:', u.id, 'keys:', Object.keys(u));
          }
        } catch (e) {
          console.error('failed to fetch user records:', e.message);
        }
      }
    if(cols.rows.length===0){
      console.log('No obvious assigned counselor columns found; trying fallback on table "Student" with common column names...');
      const attempts = [ ['Student','assignedCounselorId'], ['student','assigned_counselor_id'], ['student','assignedCounselorId'] ];
      for(const [table,col] of attempts){
        const q = `SELECT "${col}" AS counselor_id, COUNT(*) AS student_count FROM "${table}" WHERE "${col}" IS NOT NULL GROUP BY "${col}" ORDER BY student_count DESC;`;
        try{ const res = await client.query(q); console.log(`\nFallback ${table}.${col}:`, res.rows); break; }catch(e){}
      }
    }
  }finally{ await client.end(); }
})();
