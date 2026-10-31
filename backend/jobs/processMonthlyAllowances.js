
const db = require("../config/db");

const {
  processMemberAllowance,
} = require("../services/monthlyAllowanceService");

async function processMonthlyAllowances() {
  const [rows] = await db.execute(
    `SELECT member_id
     FROM monthly_allowance_state
     WHERE next_payment_at IS NOT NULL
       AND next_payment_at <= UTC_TIMESTAMP()
       AND rank_level >= 2
       AND payments_at_rank <
         CASE
           WHEN rank_level BETWEEN 2 AND 6 THEN 3
           WHEN rank_level BETWEEN 7 AND 12 THEN 6
           ELSE 0
         END
     ORDER BY next_payment_at ASC
     LIMIT 500`
  );

  let paid = 0;
  let failed = 0;

  for (const row of rows) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const success = await processMemberAllowance(
        connection,
        row.member_id
      );

      await connection.commit();

      if (success) paid++;
    } catch (error) {
      await connection.rollback();
      failed++;

      console.error(
        `MPA failed for member ${row.member_id}:`,
        error.message
      );
    } finally {
      connection.release();
    }
  }

  console.log(
    `[MPA] Checked ${rows.length}, paid ${paid}, failed ${failed}`
  );

  return { checked: rows.length, paid, failed };
}

module.exports = { processMonthlyAllowances };

if (require.main === module) {
  processMonthlyAllowances()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("MPA worker error:", error);
      process.exit(1);
    });
}
