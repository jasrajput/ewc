const pool = require("../config/db");

const getInvestmentHistory = async (req, res) => {
    try {
        // Change this only if your auth middleware uses a different property.
        const userId = req.user.id;

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
                txn_id,
                status,
                created_on
             FROM stake_txns
             WHERE user_id = ?
             ORDER BY id DESC`,
            [userId]
        );

        const investments = rows.map(row => ({
            id: row.id,
            amount: Number(row.amount || 0),
            ewcAllocation: Number(row.token_amount || 0),
            ewcPrice: Number(row.price || 0),
            txnId: row.txn_id,
            status: Number(row.status || 0),
            createdOn: row.created_on
        }));

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