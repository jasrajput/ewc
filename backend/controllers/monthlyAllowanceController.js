
const db = require("../config/db");

const {
  ALLOWANCES,
  maxPayments,
} = require("../services/monthlyAllowanceService");

const getMonthlyAllowance = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const [members] = await db.execute(
      `SELECT id, level_achieved
       FROM member WHERE id = ? LIMIT 1`,
      [memberId]
    );

    if (!members.length) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    const rank = Number(members[0].level_achieved || 0);

    const [states] = await db.execute(
      `SELECT rank_level, rank_started_at,
              next_payment_at, payments_at_rank,
              total_earned
       FROM monthly_allowance_state
       WHERE member_id = ? LIMIT 1`,
      [memberId]
    );

    const [payments] = await db.execute(
      `SELECT id, rank_level, amount,
              scheduled_for, paid_at,
              payment_number_at_rank
       FROM monthly_allowance_payments
       WHERE member_id = ?
       ORDER BY paid_at DESC, id DESC
       LIMIT 50`,
      [memberId]
    );

    const state = states[0] || null;
    const synced = state && Number(state.rank_level) === rank;

    const paymentsAtRank = synced
      ? Number(state.payments_at_rank || 0)
      : 0;

    const limit = maxPayments(rank);
    const remaining = Math.max(0, limit - paymentsAtRank);

    const ranks = Object.entries(ALLOWANCES).map(
      ([level, amount]) => ({
        level: Number(level),
        name: `E-${String(level).padStart(2, "0")}`,
        monthlyAmount: amount,
        maxPayments: maxPayments(Number(level)),
      })
    );

    return res.json({
      success: true,
      data: {
        currentRank: rank,
        currentRankName:
          rank > 0
            ? `E-${String(rank).padStart(2, "0")}`
            : "Unranked",
        monthlyAmount: ALLOWANCES[rank] || 0,
        maxPayments: limit,
        paymentsAtRank,
        remainingPayments: remaining,
        totalEarned: Number(state?.total_earned || 0),
        nextPaymentAt:
          synced && remaining > 0
            ? state.next_payment_at
            : null,
        rankStartedAt: synced ? state.rank_started_at : null,
        status:
          rank < 2
            ? "not_qualified"
            : !synced
            ? "pending_activation"
            : remaining === 0
            ? "completed"
            : "active",
        ranks,
        payments,
      },
    });
  } catch (error) {
    console.error("Monthly allowance error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch monthly allowance",
    });
  }
};

module.exports = { getMonthlyAllowance };
