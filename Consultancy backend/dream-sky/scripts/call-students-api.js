require('dotenv').config();
const jwt = require('jsonwebtoken');
const fetch = global.fetch || require('node-fetch');

const {
  JWT_ACCESS_SECRET,
  PORT = 5001
} = process.env;

if (!JWT_ACCESS_SECRET) {
  console.error('JWT_ACCESS_SECRET not set in .env');
  process.exit(2);
}

const counselorId = process.argv[2];
if (!counselorId) {
  console.error('Usage: node call-students-api.js <counselorId>');
  process.exit(2);
}

const payload = {
  userId: counselorId,
  role: 'COUNSELOR',
  branchId: null,
  mustChangePassword: false,
};

const token = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '1h' });

(async () => {
  const url = `http://localhost:${PORT}/api/students?counselorId=${encodeURIComponent(counselorId)}`;
  console.log('Calling', url);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  console.log('status', res.status);
  const body = await res.text();
  try { console.log(JSON.parse(body)); } catch (e) { console.log(body); }
})();
