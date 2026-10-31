
const ALLOWANCES = {
  1: 0,
  2: 30,
  3: 50,
  4: 100,
  5: 200,
  6: 400,
  7: 1000,
  8: 2500,
  9: 5000,
  10: 10000,
  11: 25000,
  12: 50000,
};

function maxPayments(rank) {
  if (rank < 2) return 0;
  return rank <= 6 ? 3 : 6;
}

function addMonth(date) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function toSqlDate(date) {
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Call inside the same DB transaction that changes
 * member.level_achieved.
 *
 * If the member is newly eligible, start a one-month countdown.
 * If promoted, preserve next_payment_at.
 *
 * `achievedAt` should be the actual achievement time.
 */
async function syncAllowanceRank(
  connection,
  memberId,
  newRank,
  achievedAt = new Date()
) {
  const rank = Number(newRank);
  if (!Number.isInteger(rank) || rank < 0 || rank > 12) {
    throw new Error("Invalid allowance rank");
  }

  const [rows] = await connection.execute(
    `SELECT * FROM monthly_allowance_state
     WHERE member_id = ? FOR UPDATE`,
    [memberId]
  );

  const existing = rows[0];

  if (!existing) {
    await connection.execute(
      `INSERT INTO monthly_allowance_state
       (member_id, rank_level, rank_started_at,
        next_payment_at, payments_at_rank)
       VALUES (?, ?, ?, ?, 0)`,
      [
        memberId,
        rank,
        rank >= 2 ? toSqlDate(achievedAt) : null,
        rank >= 2 ? toSqlDate(addMonth(achievedAt)) : null,
      ]
    );
    return;
  }

  if (rank <= Number(existing.rank_level)) return;

  const nextPayment =
    existing.next_payment_at ||
    (rank >= 2 ? toSqlDate(addMonth(achievedAt)) : null);

  await connection.execute(
    `UPDATE monthly_allowance_state
     SET rank_level = ?,
         rank_started_at = ?,
         next_payment_at = ?,
         payments_at_rank = 0
     WHERE member_id = ?`,
    [
      rank,
      rank >= 2 ? toSqlDate(achievedAt) : null,
      nextPayment,
      memberId,
    ]
  );
}

/**
 * Process one member's due allowance.
 * Must be invoked inside a transaction.
 */
async function processMemberAllowance(connection, memberId) {
  const [members] = await connection.execute(
    `SELECT id, level_achieved
     FROM member WHERE id = ? FOR UPDATE`,
    [memberId]
  );

  if (!members.length) return false;

  const [states] = await connection.execute(
    `SELECT * FROM monthly_allowance_state
     WHERE member_id = ? FOR UPDATE`,
    [memberId]
  );

  if (!states.length) return false;

  const state = states[0];
  const rank = Number(state.rank_level);
  const actualRank = Number(members[0].level_achieved || 0);

  // Do not pay if the recorded rank is out of sync.
  if (actualRank !== rank) return false;
  if (rank < 2 || rank > 12) return false;

  const paidCount = Number(state.payments_at_rank || 0);
  const limit = maxPayments(rank);

  if (paidCount >= limit) return false;
  if (!state.next_payment_at) return false;

  const now = new Date();
  const due = new Date(state.next_payment_at);

  if (due > now) return false;

  const amount = ALLOWANCES[rank];
  const dueSql = toSqlDate(due);

  // Unique key prevents duplicate payments for this due date.
  await connection.execute(
    `INSERT INTO monthly_allowance_payments
     (member_id, rank_level, amount, scheduled_for,
      payment_number_at_rank)
     VALUES (?, ?, ?, ?, ?)`,
    [memberId, rank, amount, dueSql, paidCount + 1]
  );

  const [walletResult] = await connection.execute(
    `UPDATE user_wallet
     SET balance = COALESCE(balance, 0) + ?
     WHERE user_id = ?`,
    [amount, memberId]
  );

  if (walletResult.affectedRows !== 1) {
    throw new Error(
      `Wallet not found or not unique for member ${memberId}`
    );
  }

  const nextCount = paidCount + 1;
  const nextPayment =
    nextCount >= limit ? null : toSqlDate(addMonth(due));

  await connection.execute(
    `UPDATE monthly_allowance_state
     SET payments_at_rank = ?,
         total_earned = total_earned + ?,
         next_payment_at = ?
     WHERE member_id = ?`,
    [nextCount, amount, nextPayment, memberId]
  );

  return true;
}

module.exports = {
  ALLOWANCES,
  maxPayments,
  addMonth,
  syncAllowanceRank,
  processMemberAllowance,
};
