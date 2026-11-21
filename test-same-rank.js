'use strict';

// ============================================================
// EWC 20% SAME-RANK INCOME SIMULATION
// NO MYSQL CONNECTION - NO PRODUCTION CHANGES
// ============================================================

// Your actual same-rank income function
async function processSameRankIncome(
    connection,
    incomeReceiver,
    originalIncome,
    txHash
) {
    const sourceRank = Number(
        incomeReceiver.level_achieved || 0
    );

    if (sourceRank <= 0 || Number(originalIncome) <= 0) {
        return;
    }

    let parentUserId = incomeReceiver.real_sponsor_id;
    let previousIncome = Number(originalIncome);

    const visited = new Set();

    while (parentUserId) {
        const key = String(parentUserId).toLowerCase();

        if (visited.has(key)) {
            throw new Error(
                `Sponsor loop detected at ${parentUserId}`
            );
        }

        visited.add(key);

        const [rows] = await connection.execute(
            `
            SELECT
                id,
                user_id,
                real_sponsor_id,
                package_choose,
                level_achieved
            FROM member
            WHERE user_id = ?
            LIMIT 1
            `,
            [parentUserId]
        );

        if (!rows.length) break;

        const parent = rows[0];

        const eligible =
            Number(parent.package_choose) >= 2 &&
            Number(parent.level_achieved || 0) === sourceRank;

        if (eligible) {
            const income = Number(
                (previousIncome * 0.20).toFixed(5)
            );

            if (income <= 0) break;

            await connection.execute(
                `
                INSERT INTO trasections
                    (credit, direction, user_id, description)
                VALUES (?, 5, ?, ?)
                `,
                [
                    income,
                    parent.id,
                    `E-${String(sourceRank).padStart(2, "0")} ` +
                    `Same Rank Income 20% from ${incomeReceiver.user_id}`
                ]
            );

            await connection.execute(
                `
                UPDATE user_wallet
                SET balance = COALESCE(balance, 0) + ?
                WHERE user_id = ?
                `,
                [income, parent.id]
            );

            console.log(
                `Same Rank: ${income} USDT -> ${parent.user_id}`
            );

            previousIncome = income;
        }

        parentUserId = parent.real_sponsor_id;
    }
}

// ============================================================
// MOCK MEMBERS - SIMULATED EWC HIERARCHY
// ============================================================

const members = [
    {
        id: 85,
        user_id: "Mahesh001",
        real_sponsor_id: "Sudesh002",
        level_achieved: 3,
        package_choose: 2
    },
    {
        id: 84,
        user_id: "Sudesh002",
        real_sponsor_id: "Sudesh001",
        level_achieved: 0,
        package_choose: 1
    },
    {
        id: 83,
        user_id: "Sudesh001",
        real_sponsor_id: "shyamali",
        level_achieved: 3,
        package_choose: 2
    },
    {
        id: 82,
        user_id: "shyamali",
        real_sponsor_id: null,
        level_achieved: 3,
        package_choose: 2
    }
];

// Chain intentionally stops at shyamali for testing.

// ============================================================
// FAKE MYSQL DATABASE (MEMORY ONLY)
// ============================================================

const transactions = [];

const balances = new Map(
    members.map(member => [member.id, 0])
);

const connection = {
    async execute(sql, args) {

        const query = sql
            .trim()
            .replace(/\s+/g, " ")
            .toUpperCase();

        // Simulate SELECT member
        if (
            query.startsWith("SELECT") &&
            query.includes("FROM MEMBER")
        ) {
            const user = members.find(
                m =>
                    m.user_id.toLowerCase() ===
                    String(args[0]).toLowerCase()
            );

            return [user ? [{ ...user }] : []];
        }

        // Simulate INSERT INTO trasections
        if (query.startsWith("INSERT INTO TRASECTIONS")) {

            const [credit, userId, description] = args;

            const member = members.find(
                m => m.id === userId
            );

            transactions.push({
                user_id: member?.user_id,
                credit,
                direction: 5,
                description
            });

            return [{ affectedRows: 1 }];
        }

        // Simulate UPDATE user_wallet
        if (query.startsWith("UPDATE USER_WALLET")) {

            const [credit, userId] = args;

            if (!balances.has(userId)) {
                throw new Error(
                    `Unknown wallet: ${userId}`
                );
            }

            balances.set(
                userId,
                balances.get(userId) + credit
            );

            return [{ affectedRows: 1 }];
        }

        throw new Error(
            "Unexpected SQL query: " + sql
        );
    }
};

// ============================================================
// ASSERTION HELPER
// ============================================================

function assert(condition, message) {
    if (!condition) {
        throw new Error("TEST FAILED: " + message);
    }
}

// ============================================================
// RUN SIMULATION
// ============================================================

async function runSimulation() {

    console.log("\n=================================");
    console.log("EWC SAME-RANK INCOME SIMULATION");
    console.log("=================================\n");

    console.log("Original Team Income: $6");
    console.log("Income Receiver: Mahesh001");
    console.log("Rank: E-03\n");

    await processSameRankIncome(
        connection,
        members[0],
        6,
        "SIMULATION_ONLY"
    );

    console.log("\nSIMULATED TRASECTIONS TABLE:\n");

    console.table(transactions);

    console.log("\nSIMULATED WALLET BALANCES:\n");

    console.table(
        members.map(member => ({
            user_id: member.user_id,
            balance: Number(
                balances.get(member.id).toFixed(5)
            )
        }))
    );

    // Verify correct commissions
    assert(
        transactions.length === 2,
        "Expected exactly two same-rank payments"
    );

    assert(
        transactions[0].user_id === "Sudesh001" &&
        transactions[0].credit === 1.2,
        "Sudesh001 should receive $1.20"
    );

    assert(
        transactions[1].user_id === "shyamali" &&
        transactions[1].credit === 0.24,
        "shyamali should receive $0.24"
    );

    assert(
        balances.get(84) === 0,
        "Sudesh002 must be skipped"
    );

    assert(
        balances.get(83) === 1.2 &&
        balances.get(82) === 0.24,
        "Wallet balances do not match commissions"
    );

    console.log("\n=================================");
    console.log("ALL TESTS PASSED");
    console.log("=================================");

    console.log(
        "No real database or wallet was modified."
    );
}

runSimulation().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
