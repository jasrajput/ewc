const pool = require("../config/db");

const getInvestmentHistory = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        const [rows] = await pool.execute(
            `SELECT
                id,
                amount,
                token_amount,
                price,
                bonus_ewc,
                is_presale,
                txn_id,
                status,
                created_on
             FROM stake_txns
             WHERE user_id = ?
             ORDER BY id DESC`,
            [userId]
        );

        const investments = rows.map(row => {
            // Total EWC allocation already includes bonus
            const totalEwc = Number(row.token_amount || 0);

            // Bonus EWC from presale
            const bonusEwc = Number(row.bonus_ewc || 0);

            // Base EWC excluding bonus
            const baseEwc = totalEwc - bonusEwc;

            // Calculate bonus percentage
            const bonusPercentage =
                baseEwc > 0
                    ? (bonusEwc / baseEwc) * 100
                    : 0;

            return {
                id: row.id,

                // Investment details
                amount: Number(row.amount || 0),
                ewcAllocation: totalEwc,
                ewcPrice: Number(row.price || 0),

                // Private Sale details
                isPresale: Number(row.is_presale) === 1,
                baseEwc,
                bonusEwc,
                bonusPercentage,

                // Transaction details
                txnId: row.txn_id,
                status: Number(row.status || 0),
                createdOn: row.created_on
            };
        });

        return res.status(200).json({
            success: true,
            investments
        });

    } catch (error) {
        console.error("getInvestmentHistory error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load investment history"
        });
    }
};

module.exports = {
    getInvestmentHistory
};