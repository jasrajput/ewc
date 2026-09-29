// verify-signature-server.js
// Lives alongside claim-history.js in the "closing-node" project.
// Separate PM2 entry, separate port — does NOT import or touch
// claim-history.js, does NOT open its own MySQL connection, does NOT
// call any blockchain RPC. Pure signature verification only.

require('dotenv').config();
const express = require('express');
const { verifyMessage } = require('ethers');

const app = express();
app.use(express.json());

const PORT = process.env.VERIFY_PORT;
const INTERNAL_SECRET = process.env.REG_VERIFY_SECRET;

if (!INTERNAL_SECRET) {
  console.error('REG_VERIFY_SECRET is not set in .env. Exiting.');
  process.exit(1);
}

app.post('/internal/verify-wallet-signature', (req, res) => {
  const { secret, wallet_address, message, signature } = req.body;

  if (secret !== INTERNAL_SECRET) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  if (!wallet_address || !message || !signature) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }

  try {
    const recovered = verifyMessage(message, signature);
    const matches = recovered.toLowerCase() === wallet_address.toLowerCase();
    return res.json({ ok: true, matches, recovered });
  } catch (err) {
    return res.json({ ok: true, matches: false, error: err.message });
  }
});

app.get('/internal/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`wallet-verify listening on 127.0.0.1:${PORT}`);
});