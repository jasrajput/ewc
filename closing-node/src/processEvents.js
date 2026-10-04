const { ethers } = require("ethers");
const pool = require("./db");
const config = require("./config");

const RPC_URL = config.rpcUrl;
const PAYOUT_CONTRACT_ADDRESS = config.merkleContract;

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 10000;
const BLOCK_BATCH_SIZE = 500;
const HEALTHCHECK_INTERVAL_MS =
    Number(process.env.HEALTHCHECK_INTERVAL_MS) || 60000;
const MAX_CONSECUTIVE_RPC_FAILURES = 5;

/*
|--------------------------------------------------------------------------
| EWC CONFIG
|--------------------------------------------------------------------------
|
| Direct income remains USDT.
| Rank income is calculated on deposit using differential Team Income Ratio.
| Salary income is handled separately.
| ROI EWC is handled by daily closing / Merkle.
|
*/

const DIRECT_INCOME_PERCENT = 10;
const RANKS = [
    { rank: 1, directBusiness: 100, teamBusiness: 1000, requiredRank: 0, requiredCount: 0, percent: 1 },
    { rank: 2, directBusiness: 200, teamBusiness: 3000, requiredRank: 1, requiredCount: 2, percent: 3 },
    { rank: 3, directBusiness: 300, teamBusiness: 10000, requiredRank: 2, requiredCount: 2, percent: 6 },
    { rank: 4, directBusiness: 500, teamBusiness: 30000, requiredRank: 3, requiredCount: 2, percent: 9 },
    { rank: 5, directBusiness: 700, teamBusiness: 100000, requiredRank: 4, requiredCount: 2, percent: 12 },
    { rank: 6, directBusiness: 1000, teamBusiness: 300000, requiredRank: 5, requiredCount: 2, percent: 15 },
    { rank: 7, directBusiness: 2000, teamBusiness: 1000000, requiredRank: 6, requiredCount: 2, percent: 18 },
    { rank: 8, directBusiness: 3000, teamBusiness: 3000000, requiredRank: 7, requiredCount: 2, percent: 21 },
    { rank: 9, directBusiness: 5000, teamBusiness: 10000000, requiredRank: 8, requiredCount: 2, percent: 24 },
    { rank: 10, directBusiness: 10000, teamBusiness: 30000000, requiredRank: 9, requiredCount: 2, percent: 26 },
    { rank: 11, directBusiness: 15000, teamBusiness: 100000000, requiredRank: 10, requiredCount: 2, percent: 28 },
    { rank: 12, directBusiness: 25000, teamBusiness: 500000000, requiredRank: 11, requiredCount: 2, percent: 30 }
];

/*
|--------------------------------------------------------------------------
| PROVIDER
|--------------------------------------------------------------------------
*/

const provider = new ethers.JsonRpcProvider(RPC_URL);

/*
|--------------------------------------------------------------------------
| EWC INVESTMENT / PAYOUT ABI
|--------------------------------------------------------------------------
|
| These signatures match the current combined Investment + Payout contract.
|
*/

const PAYOUT_ABI = [
    "event Deposited(address indexed payer, address indexed beneficiary, uint256 usdtAmount, uint256 allocationPrice, uint256 allocatedEWC, uint256 marketBuyUSDT, uint256 marketBoughtEWC, uint256 commissionUSDT, uint256 treasuryUSDT, uint256 timestamp)",
    "event Claimed(address indexed user, uint256 usdtAmount, uint256 roiEwcAmount, uint256 cumulativeUsdtIncome, uint256 cumulativeRoiEwc, uint256 ewcPriceAtClaim, uint256 timestamp)"
];

const contract = new ethers.Contract(
    PAYOUT_CONTRACT_ADDRESS,
    PAYOUT_ABI,
    provider
);

/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

let isPolling = false;
let consecutiveFailures = 0;
let lastSuccessfulPollAt = Date.now();

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function toHuman(value, decimals = 18) {
    return Number(ethers.formatUnits(value, decimals));
}

function getTransactionHash(event) {
    return event?.transactionHash || event?.hash || null;
}

function getBlockNumber(event) {
    return event?.blockNumber ?? null;
}

/*
|--------------------------------------------------------------------------
| GET LAST PROCESSED BLOCK
|--------------------------------------------------------------------------
*/

async function getLastProcessedBlock() {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS blockchain_sync (
            id INT PRIMARY KEY,
            contract_name VARCHAR(100) NOT NULL,
            last_block BIGINT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL
                DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    const [rows] = await pool.execute(`
        SELECT last_block
        FROM blockchain_sync
        WHERE id = 1
        LIMIT 1
    `);

    if (!rows.length) {
        /*
         * Starting at zero is safe but can be very slow on an established
         * chain. If this service is being deployed after the contract,
         * you can manually set last_block to deploymentBlock - 1.
         */

        await pool.execute(`
            INSERT INTO blockchain_sync
            (id, contract_name, last_block)
            VALUES (1, 'ewc_investment', 0)
        `);

        return 0;
    }

    return Number(rows[0].last_block);
}

/*
|--------------------------------------------------------------------------
| SAVE LAST PROCESSED BLOCK
|--------------------------------------------------------------------------
*/

async function saveLastProcessedBlock(blockNumber) {
    await pool.execute(
        `
        UPDATE blockchain_sync
        SET last_block = ?
        WHERE id = 1
        `,
        [blockNumber]
    );
}

/*
|--------------------------------------------------------------------------
| FIND MEMBER BY WALLET
|--------------------------------------------------------------------------
*/

async function findMemberByWallet(connection, wallet) {
    const [rows] = await connection.execute(
        `
        SELECT
            id,
            user_id,
            real_sponsor_id,
            package_choose,
            package_amount,
            current_package,
            date_of_activation
        FROM member
        WHERE LOWER(trx) = ?
        LIMIT 1
        `,
        [wallet.toLowerCase()]
    );

    return rows.length ? rows[0] : null;
}

/*
|--------------------------------------------------------------------------
| FIND SPONSOR
|--------------------------------------------------------------------------
*/

async function findSponsor(connection, sponsorUserId) {
    if (!sponsorUserId) {
        return null;
    }

    const [rows] = await connection.execute(
        `
        SELECT
            id,
            user_id,
            package_choose,
            package_amount
        FROM member
        WHERE user_id = ?
        LIMIT 1
        `,
        [sponsorUserId]
    );

    return rows.length ? rows[0] : null;
}

/*
|--------------------------------------------------------------------------
| PROCESS CLAIM EVENT
|--------------------------------------------------------------------------
|
| USDT claim:
|   Direct + Rank + Salary
|
| EWC claim:
|   ROI only
|
| The blockchain contract already performs cumulative accounting.
| Therefore withdrawals.amount stores the ACTUAL USDT received in this
| transaction, while roi_ewc_amount stores actual ROI EWC received.
|
|--------------------------------------------------------------------------
*/

async function processClaimEvent(event) {
    const connection = await pool.getConnection();

    try {
        console.log("");
        console.log("==========================================");
        console.log("PROCESSING EWC CLAIM");
        console.log("==========================================");

        let args;

        if (event?.args) {
            args = event.args;
        } else {
            const decoded = contract.interface.parseLog({
                topics: event.topics,
                data: event.data
            });

            args = decoded.args;
        }

        const user = args.user ?? args[0];
        const usdtAmount = args.usdtAmount ?? args[1];
        const roiEwcAmount = args.roiEwcAmount ?? args[2];
        const cumulativeUsdtIncome =
            args.cumulativeUsdtIncome ?? args[3];
        const cumulativeRoiEwc =
            args.cumulativeRoiEwc ?? args[4];
        const ewcPriceAtClaim =
            args.ewcPriceAtClaim ?? args[5];
        const timestamp =
            args.timestamp ?? args[6];

        const txHash = getTransactionHash(event);
        const blockNumber = getBlockNumber(event);

        if (!user) {
            throw new Error("Claimed event has no user");
        }

        const usdtHuman = toHuman(usdtAmount);
        const roiEwcHuman = toHuman(roiEwcAmount);
        const cumulativeUsdtHuman =
            toHuman(cumulativeUsdtIncome);
        const cumulativeRoiEwcHuman =
            toHuman(cumulativeRoiEwc);
        const priceHuman =
            toHuman(ewcPriceAtClaim);

        console.log("Wallet:", user);
        console.log("USDT received:", usdtHuman);
        console.log("ROI EWC received:", roiEwcHuman);
        console.log("Cumulative USDT:", cumulativeUsdtHuman);
        console.log("Cumulative ROI EWC:", cumulativeRoiEwcHuman);
        console.log("EWC price:", priceHuman);
        console.log("TX:", txHash);
        console.log("Block:", blockNumber);

        const member =
            await findMemberByWallet(connection, user);

        if (!member) {
            throw new Error(
                `No member found for wallet ${user}`
            );
        }

        /*
        |--------------------------------------------------------------------------
        | IDEMPOTENCY
        |--------------------------------------------------------------------------
        */

        if (txHash) {
            const [existing] = await connection.execute(
                `
                SELECT id
                FROM withdrawals
                WHERE txn_id = ?
                LIMIT 1
                `,
                [txHash]
            );

            if (existing.length) {
                console.log(
                    "Claim already recorded:",
                    txHash
                );

                return;
            }
        }

        await connection.beginTransaction();

        /*
        |--------------------------------------------------------------------------
        | WITHDRAWALS
        |--------------------------------------------------------------------------
        |
        | amount               = actual USDT received
        | roi_ewc_amount       = actual EWC ROI received
        | cumulative_usdt      = cumulative USDT entitlement
        | cumulative_roi_ewc   = cumulative ROI EWC entitlement
        | price                = EWC price recorded by contract
        | pending_balance      = 0 after successful cumulative claim
        |
        */

        await connection.execute(
            `
            INSERT INTO withdrawals
            (
                user_id,
                amount,
                roi_ewc_amount,
                cumulative_usdt,
                cumulative_roi_ewc,
                price,
                pending_balance,
                status,
                txn_id,
                block_number,
                remarks,
                date_of_withdrawal,
                date_of_approved
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, NOW(), NOW())
            `,
            [
                member.id,
                usdtHuman,
                roiEwcHuman,
                cumulativeUsdtHuman,
                cumulativeRoiEwcHuman,
                priceHuman,
                txHash,
                blockNumber,
                "Merkle claim"
            ]
        );

        await connection.commit();

        console.log("");
        console.log("==========================================");
        console.log("CLAIM SAVED");
        console.log("==========================================");
        console.log("User:", member.user_id);
        console.log("USDT received:", usdtHuman);
        console.log("ROI EWC received:", roiEwcHuman);
        console.log("TX:", txHash);
        console.log("==========================================");
    } catch (error) {
        try {
            await connection.rollback();
        } catch (_) { }

        console.error(
            "processClaimEvent failed:",
            error
        );

        throw error;
    } finally {
        connection.release();
    }
}

/*
|--------------------------------------------------------------------------
| PROCESS DIRECT INCOME
|--------------------------------------------------------------------------
|
| Direct Income:
|
| 10% of actual USDT investment.
|
| Stored in trasections as USDT.
|
| direction = 1
|
| No EWC conversion happens here.
|
|--------------------------------------------------------------------------
*/

async function processDirectIncome(
    connection,
    member,
    sponsor,
    usdtAmount,
    txHash
) {
    if (!sponsor) {
        console.log(
            "No sponsor found. Direct income skipped."
        );

        return;
    }

    /*
     * Sponsor must be activated.
     *
     * Existing project convention:
     * package_choose >= 2 = activated.
     */

    if (Number(sponsor.package_choose) < 2) {
        console.log(
            "Sponsor is not active. Direct income skipped:",
            sponsor.user_id
        );

        return;
    }

    const directIncome =
        (usdtAmount * DIRECT_INCOME_PERCENT) / 100;

    if (directIncome <= 0) {
        return;
    }

    /*
     * direction = 1
     * Existing EWC convention for Direct Income.
     */

    await connection.execute(
        `
        INSERT INTO trasections
        (
            credit,
            direction,
            user_id,
            description
        )
        VALUES (?, 1, ?, ?)
        `,
        [
            directIncome,
            sponsor.id,
            `Direct Income from ${member.user_id}`
        ]
    );

    /*
     * Existing wallet accounting.
     *
     * Direct income remains USDT.
     */

    await connection.execute(
        `
        UPDATE user_wallet
        SET
            balance =
                COALESCE(balance, 0) + ?
        WHERE user_id = ?
        `,
        [
            directIncome,
            sponsor.id
        ]
    );

    console.log(
        "Direct Income:",
        directIncome,
        "USDT ->",
        sponsor.user_id
    );
}

/*
|--------------------------------------------------------------------------
| PROCESS DEPOSIT EVENT
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| beneficiary is the member receiving the investment.
| payer may be a completely different wallet.
|
| Member/database activation therefore uses BENEFICIARY,
| not payer.
|
| Member-visible EWC allocation:
|
| allocatedEWC
|
| This is calculated from the FULL investment amount.
|
| Protocol-side market purchase/routing fields are deliberately not stored
| as the member's token allocation.
|
|--------------------------------------------------------------------------
*/

async function processDepositEvent(event) {
    const connection = await pool.getConnection();

    try {
        console.log("");
        console.log("==========================================");
        console.log("PROCESSING EWC DEPOSIT");
        console.log("==========================================");

        let args;

        if (event?.args) {
            args = event.args;
        } else {
            const decoded = contract.interface.parseLog({
                topics: event.topics,
                data: event.data
            });

            args = decoded.args;
        }

        const payer =
            args.payer ?? args[0];

        const beneficiary =
            args.beneficiary ?? args[1];

        const usdtAmount =
            args.usdtAmount ?? args[2];

        const allocationPrice =
            args.allocationPrice ?? args[3];

        const allocatedEWC =
            args.allocatedEWC ?? args[4];

        const marketBuyUSDT =
            args.marketBuyUSDT ?? args[5];

        const marketBoughtEWC =
            args.marketBoughtEWC ?? args[6];

        const commissionUSDT =
            args.commissionUSDT ?? args[7];

        const treasuryUSDT =
            args.treasuryUSDT ?? args[8];

        const timestamp =
            args.timestamp ?? args[9];

        const txHash =
            getTransactionHash(event);

        const blockNumber =
            getBlockNumber(event);

        if (!beneficiary) {
            throw new Error(
                "Deposited event has no beneficiary"
            );
        }

        const usdtHuman =
            toHuman(usdtAmount);

        const allocationPriceHuman =
            toHuman(allocationPrice);

        const allocatedEwcHuman =
            toHuman(allocatedEWC);

        console.log("Payer:", payer);
        console.log("Beneficiary:", beneficiary);
        console.log("Investment:", usdtHuman, "USDT");
        console.log(
            "Allocation price:",
            allocationPriceHuman
        );
        console.log(
            "EWC allocation:",
            allocatedEwcHuman
        );
        console.log("TX:", txHash);
        console.log("Block:", blockNumber);

        /*
        |--------------------------------------------------------------------------
        | FIND MEMBER USING BENEFICIARY
        |--------------------------------------------------------------------------
        */

        const member =
            await findMemberByWallet(
                connection,
                beneficiary
            );

        if (!member) {
            throw new Error(
                `No member found for beneficiary wallet ${beneficiary}`
            );
        }

        const id = member.id;
        const loginId = member.user_id;
        const refId = member.real_sponsor_id;
        const wasActivated =
            Number(member.package_choose) >= 2;

        /*
        |--------------------------------------------------------------------------
        | IDEMPOTENCY
        |--------------------------------------------------------------------------
        */

        if (txHash) {
            const [existing] =
                await connection.execute(
                    `
                    SELECT id
                    FROM stake_txns
                    WHERE txn_id = ?
                    LIMIT 1
                    `,
                    [txHash]
                );

            if (existing.length) {
                console.log(
                    "Deposit already processed:",
                    txHash
                );

                return;
            }
        }

        /*
        |--------------------------------------------------------------------------
        | SPONSOR
        |--------------------------------------------------------------------------
        */

        const sponsor =
            await findSponsor(
                connection,
                refId
            );

        await connection.beginTransaction();

        /*
        |--------------------------------------------------------------------------
        | 1. BLOCKCHAIN DEPOSIT LEDGER
        |--------------------------------------------------------------------------
        |
        | amount / actual_amount = full USDT investment
        |
        | token_amount = FULL member EWC allocation
        |
        | price = allocation price before protocol's own market operation
        |
        */

        await connection.execute(
            `
            INSERT INTO stake_txns
            (
                amount,
                actual_amount,
                user_id,
                txn_id,
                account,
                token_amount,
                price,
                status,
                created_on
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())
            `,
            [
                usdtHuman,
                usdtHuman,
                id,
                txHash,
                beneficiary,
                allocatedEwcHuman,
                allocationPriceHuman
            ]
        );

        /*
        |--------------------------------------------------------------------------
        | 2. UPDATE MEMBER
        |--------------------------------------------------------------------------
        |
        | package_amount = lifetime/current aggregate investment according
        | to the existing member model.
        |
        | current_package = latest investment amount.
        |
        | No:
        | - MMT mint
        | - MMT stake
        | - burn
        | - roi_per
        | - booster
        | - limit_pending
        | - 2x/4x cap
        |
        */

        if (!wasActivated) {
            const [result] =
                await connection.execute(
                    `
                    UPDATE member
                    SET
                        package_choose = 2,
                        package_amount =
                            COALESCE(package_amount, 0) + ?,
                        current_package = ?,
                        date_of_activation = NOW()
                    WHERE id = ?
                    `,
                    [
                        usdtHuman,
                        usdtHuman,
                        id
                    ]
                );

            if (result.affectedRows <= 0) {
                throw new Error(
                    `Member activation failed for ${loginId}`
                );
            }
        } else {
            const [result] =
                await connection.execute(
                    `
                    UPDATE member
                    SET
                        package_choose = 2,
                        package_amount =
                            COALESCE(package_amount, 0) + ?,
                        current_package = ?,
                        re_top_up_status = 0,
                        re_top_up_times =
                            COALESCE(re_top_up_times, 0) + 1,
                        date_of_re_top = NOW()
                    WHERE id = ?
                    `,
                    [
                        usdtHuman,
                        usdtHuman,
                        id
                    ]
                );

            if (result.affectedRows <= 0) {
                throw new Error(
                    `Member re-investment update failed for ${loginId}`
                );
            }
        }

        /*
        |--------------------------------------------------------------------------
        | 3. SELECT_PACKAGES
        |--------------------------------------------------------------------------
        |
        | Every blockchain investment gets its own package row.
        |
        | pack_amount:
        |     actual USDT investment
        |
        | token_amount:
        |     user's full EWC allocation
        |
        | current_price:
        |     allocation price at investment
        |
        | ROI calculation is NOT performed here.
        |
        */

        await connection.execute(
            `
            INSERT INTO select_packages
            (
                u_id,
                pack_amount,
                token_amount,
                current_price,
                status,
                created_on
            )
            VALUES (?, ?, ?, ?, 0, NOW())
            `,
            [
                id,
                usdtHuman,
                allocatedEwcHuman,
                allocationPriceHuman
            ]
        );

        /*
        |--------------------------------------------------------------------------
        | 4. FUND TRANSACTION
        |--------------------------------------------------------------------------
        */

        await connection.execute(
            `
            INSERT INTO fund_transactions
            (
                debit,
                particular,
                user_id
            )
            VALUES (?, ?, ?)
            `,
            [
                usdtHuman,
                `Account Activated of ${loginId}`,
                id
            ]
        );

        /*
        |--------------------------------------------------------------------------
        | 5. TOP-UP HISTORY
        |--------------------------------------------------------------------------
        |
        | The beneficiary is being activated/re-invested.
        |
        | payer wallet is available on-chain, but this existing table uses
        | numeric member IDs. Keep the current member-based structure.
        |
        */

        await connection.execute(
            `
            INSERT INTO user_top_up_by
            (
                top_up_user,
                user_top_up_by,
                amount
            )
            VALUES (?, ?, ?)
            `,
            [
                id,
                id,
                usdtHuman
            ]
        );

        /*
        |--------------------------------------------------------------------------
        | 6. UPDATE NETWORK / LEVEL VOLUME
        |--------------------------------------------------------------------------
        */

        await connection.execute(
            `
            UPDATE levels
            SET
                status = 1,
                package_amount =
                    COALESCE(package_amount, 0) + ?
            WHERE from_id = ?
            `,
            [
                usdtHuman,
                id
            ]
        );


        // Recalculate ranks first.
        // This deposit has already been added to select_packages and levels,
        // so qualification sees the new business.
        await updateUplineRanks(
            connection,
            member
        );



        /*
        |--------------------------------------------------------------------------
        | 7. DIRECT INCOME
        |--------------------------------------------------------------------------
        |
        | Direct income = 10% USDT.
        |
        | Rank income is intentionally NOT calculated here.
        | Salary is intentionally NOT calculated here.
        | ROI is intentionally NOT calculated here.
        |
        */

        await processDirectIncome(
            connection,
            member,
            sponsor,
            usdtHuman,
            txHash
        );

        // Team/Rank Income using differential percentage.
        await processRankIncome(
            connection,
            member,
            usdtHuman,
            txHash
        );

        await connection.commit();

        console.log("");
        console.log("==========================================");
        console.log("DEPOSIT FULLY PROCESSED");
        console.log("==========================================");
        console.log("User:", loginId);
        console.log("Investment:", usdtHuman, "USDT");
        console.log(
            "EWC allocation:",
            allocatedEwcHuman,
            "EWC"
        );
        console.log(
            "Allocation price:",
            allocationPriceHuman
        );
        console.log("TX:", txHash);
        console.log("==========================================");
    } catch (error) {
        try {
            await connection.rollback();
        } catch (_) { }

        console.error(
            "processDepositEvent failed:",
            error
        );

        /*
         * Do NOT swallow this.
         *
         * The cursor must not advance beyond an event which failed
         * to save to MySQL.
         */

        throw error;
    } finally {
        connection.release();
    }
}



async function getDirectBusiness(connection, memberId) {
    const [rows] = await connection.execute(
        `SELECT COALESCE(SUM(sp.pack_amount), 0) AS total
         FROM member m
         INNER JOIN select_packages sp ON sp.u_id = m.id
         WHERE m.real_sponsor_id = (
             SELECT user_id FROM member WHERE id = ? LIMIT 1
         )
         AND m.package_choose >= 2`,
        [memberId]
    );

    return Number(rows[0]?.total || 0);
}

async function getTeamBusiness(connection, memberId) {
    const [rows] = await connection.execute(
        `SELECT COALESCE(SUM(sp.pack_amount), 0) AS total
         FROM levels l
         INNER JOIN select_packages sp ON sp.u_id = l.from_id
         WHERE l.to_id = ?
         AND l.from_id <> ?`,
        [memberId, memberId]
    );

    return Number(rows[0]?.total || 0);
}

async function getRankedDownlineCount(connection, memberId, requiredRank) {
    if (requiredRank <= 0) {
        return 0;
    }

    const [rows] = await connection.execute(
        `SELECT COUNT(DISTINCT m.id) AS total
         FROM levels l
         INNER JOIN member m ON m.id = l.from_id
         WHERE l.to_id = ?
         AND l.from_id <> ?
         AND COALESCE(m.level_achieved, 0) >= ?`,
        [memberId, memberId, requiredRank]
    );

    return Number(rows[0]?.total || 0);
}

async function calculateQualifiedRank(connection, memberId) {
    const directBusiness = await getDirectBusiness(connection, memberId);
    const teamBusiness = await getTeamBusiness(connection, memberId);

    let qualifiedRank = 0;

    for (const rank of RANKS) {
        if (directBusiness < rank.directBusiness) {
            break;
        }

        if (teamBusiness < rank.teamBusiness) {
            break;
        }

        if (rank.requiredCount > 0) {
            const rankedCount = await getRankedDownlineCount(
                connection,
                memberId,
                rank.requiredRank
            );

            if (rankedCount < rank.requiredCount) {
                break;
            }
        }

        qualifiedRank = rank.rank;
    }

    return {
        rank: qualifiedRank,
        directBusiness,
        teamBusiness
    };
}

async function updateUplineRanks(connection, member) {
    let parentUserId = member.real_sponsor_id;
    const visited = new Set();

    while (parentUserId) {
        if (visited.has(parentUserId)) {
            throw new Error(`Sponsor loop detected at ${parentUserId}`);
        }

        visited.add(parentUserId);

        const [rows] = await connection.execute(
            `SELECT id, user_id, real_sponsor_id, level_achieved
             FROM member
             WHERE user_id = ?
             LIMIT 1`,
            [parentUserId]
        );

        if (!rows.length) {
            break;
        }

        const parent = rows[0];

        const result = await calculateQualifiedRank(
            connection,
            parent.id
        );

        const oldRank = Number(parent.level_achieved || 0);

        // Rank never goes backwards.
        if (result.rank > oldRank) {
            await connection.execute(
                `UPDATE member
                 SET level_achieved = ?
                 WHERE id = ?`,
                [result.rank, parent.id]
            );

            console.log(
                `Rank upgraded: ${parent.user_id} E-${String(oldRank).padStart(2, "0")} -> E-${String(result.rank).padStart(2, "0")}`
            );

            console.log(
                `Direct Business: ${result.directBusiness} USDT | Team Business: ${result.teamBusiness} USDT`
            );
        }

        parentUserId = parent.real_sponsor_id;
    }
}

function getRankPercent(rank) {
    const config = RANKS.find(item => item.rank === Number(rank));
    return config ? config.percent : 0;
}

async function processRankIncome(connection, member, usdtAmount, txHash) {
    let parentUserId = member.real_sponsor_id;
    let distributedPercent = 0;
    let generation = 1;
    const visited = new Set();

    while (parentUserId && distributedPercent < 30) {
        if (visited.has(parentUserId)) {
            throw new Error(`Sponsor loop detected at ${parentUserId}`);
        }

        visited.add(parentUserId);

        const [rows] = await connection.execute(
            `SELECT
                id,
                user_id,
                real_sponsor_id,
                package_choose,
                level_achieved
             FROM member
             WHERE user_id = ?
             LIMIT 1`,
            [parentUserId]
        );

        if (!rows.length) {
            break;
        }

        const parent = rows[0];
        const rank = Number(parent.level_achieved || 0);
        const rankPercent = getRankPercent(rank);

        if (
            Number(parent.package_choose) >= 2 &&
            rankPercent > distributedPercent
        ) {
            const differencePercent =
                rankPercent - distributedPercent;

            const income =
                (Number(usdtAmount) * differencePercent) / 100;

            if (income > 0) {
                await connection.execute(
                    `INSERT INTO trasections
                     (
                        credit,
                        direction,
                        user_id,
                        description
                     )
                     VALUES (?, 5, ?, ?)`,
                    [
                        income,
                        parent.id,
                        `E-${String(rank).padStart(2, "0")} Team Income ${differencePercent}% from ${member.user_id}`
                    ]
                );

                await connection.execute(
                    `UPDATE user_wallet
                     SET balance = COALESCE(balance, 0) + ?
                     WHERE user_id = ?`,
                    [income, parent.id]
                );

                console.log(
                    `Rank Income: ${income} USDT -> ${parent.user_id} | Rank E-${String(rank).padStart(2, "0")} | Differential ${differencePercent}%`
                );
            }

            distributedPercent = rankPercent;
        }

        parentUserId = parent.real_sponsor_id;
        generation++;
    }
}

/*
|--------------------------------------------------------------------------
| POLL NEW EVENTS
|--------------------------------------------------------------------------
|
| Claimed + Deposited are emitted by the same combined contract.
|
| One cursor is therefore enough.
|
|--------------------------------------------------------------------------
*/

async function pollForPayoutEvents() {
    if (isPolling) {
        return;
    }

    isPolling = true;

    try {
        let lastBlock =
            await getLastProcessedBlock();

        const latestBlock =
            await provider.getBlockNumber();

        consecutiveFailures = 0;
        lastSuccessfulPollAt = Date.now();

        if (lastBlock >= latestBlock) {
            return;
        }

        console.log(
            `New blocks detected: ${lastBlock + 1} -> ${latestBlock}`
        );

        while (lastBlock < latestBlock) {
            const fromBlock =
                lastBlock + 1;

            const toBlock =
                Math.min(
                    fromBlock +
                    BLOCK_BATCH_SIZE -
                    1,
                    latestBlock
                );

            console.log(
                `Scanning blocks ${fromBlock} -> ${toBlock}`
            );

            const events =
                await contract.queryFilter(
                    "*",
                    fromBlock,
                    toBlock
                );

            console.log(
                "Total events found:",
                events.length
            );

            for (const event of events) {
                const eventName =
                    event.fragment?.name;

                if (
                    eventName ===
                    "Deposited"
                ) {
                    await processDepositEvent(
                        event
                    );
                } else if (
                    eventName ===
                    "Claimed"
                ) {
                    await processClaimEvent(
                        event
                    );
                } else {
                    console.log(
                        "Skipping event:",
                        eventName
                    );
                }
            }

            /*
             * Only move the cursor after every relevant event in this
             * block range has been processed successfully.
             */

            await saveLastProcessedBlock(
                toBlock
            );

            lastBlock = toBlock;
        }
    } catch (error) {
        consecutiveFailures++;

        console.error(
            `Poll cycle failed (failure #${consecutiveFailures}):`,
            error?.message || error
        );
    } finally {
        isPolling = false;
    }
}

/*
|--------------------------------------------------------------------------
| HEALTHCHECK
|--------------------------------------------------------------------------
*/

function startHealthcheck() {
    setInterval(() => {
        const secondsSinceSuccess =
            (Date.now() -
                lastSuccessfulPollAt) /
            1000;

        console.log(
            `Healthcheck: last successful poll ${secondsSinceSuccess.toFixed(
                0
            )}s ago, consecutive failures = ${consecutiveFailures}`
        );

        if (
            consecutiveFailures >=
            MAX_CONSECUTIVE_RPC_FAILURES
        ) {
            console.error(
                "Too many consecutive RPC failures. Exiting so PM2 can restart the process."
            );

            process.exit(1);
        }
    }, HEALTHCHECK_INTERVAL_MS);
}

/*
|--------------------------------------------------------------------------
| START POLLING
|--------------------------------------------------------------------------
*/

function startPolling() {
    console.log("");
    console.log("==========================================");
    console.log("EWC BLOCKCHAIN EVENT LISTENER STARTED");
    console.log("Contract:", PAYOUT_CONTRACT_ADDRESS);
    console.log("RPC:", RPC_URL);
    console.log(
        "Poll interval:",
        POLL_INTERVAL_MS,
        "ms"
    );
    console.log(
        "Watching: Deposited + Claimed"
    );
    console.log("==========================================");

    pollForPayoutEvents();

    setInterval(
        pollForPayoutEvents,
        POLL_INTERVAL_MS
    );

    startHealthcheck();
}

/*
|--------------------------------------------------------------------------
| MAIN
|--------------------------------------------------------------------------
*/

async function main() {
    try {
        console.log(
            "Starting EWC blockchain event service..."
        );

        const network =
            await provider.getNetwork();

        console.log(
            "Connected to chain:",
            network.chainId.toString()
        );

        const code =
            await provider.getCode(
                PAYOUT_CONTRACT_ADDRESS
            );

        if (code === "0x") {
            throw new Error(
                "No contract found at " +
                PAYOUT_CONTRACT_ADDRESS
            );
        }

        startPolling();
    } catch (error) {
        console.error(
            "EWC EVENT SERVICE FAILED:"
        );

        console.error(error);

        process.exit(1);
    }
}

main();