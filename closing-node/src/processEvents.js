
const { ethers } = require("ethers");
const pool = require("./db");
const config = require("./config");
const {
    syncAllowanceRank,
} = require("../../backend/services/monthlyAllowanceService");

const RPC_URL = config.rpcUrl;
const PRESALE_CONTRACT_ADDRESS =
    config.presaleContract || process.env.EWC_PRESALE_CONTRACT;
const PAYOUT_CONTRACT_ADDRESS =
    config.merkleContract || process.env.MERKLE_CONTRACT;

const PAYOUT_DEPLOYMENT_BLOCK =
    Number(process.env.PAYOUT_DEPLOYMENT_BLOCK);

const CLAIM_SYNC_ID = 3;

if (
    !PRESALE_CONTRACT_ADDRESS ||
    !ethers.isAddress(PRESALE_CONTRACT_ADDRESS)
) {
    throw new Error(
        "Configure a valid presaleContract or EWC_PRESALE_CONTRACT"
    );
}

const PAYOUT_ENABLED = process.env.PAYOUT_ENABLED === "true";
if (
    PAYOUT_ENABLED &&
    (
        !PAYOUT_CONTRACT_ADDRESS ||
        !ethers.isAddress(PAYOUT_CONTRACT_ADDRESS)
    )
) {
    throw new Error(
        "Configure a valid MERKLE_CONTRACT (EWCPayout)"
    );
}

const POLL_INTERVAL_MS =
    Number(process.env.POLL_INTERVAL_MS) || 30000;

const BLOCK_BATCH_SIZE =
    Number(process.env.BLOCK_BATCH_SIZE) || 500;

const CONFIRMATIONS =
    Number(process.env.EVENT_CONFIRMATIONS ?? 12);

const HEALTHCHECK_INTERVAL_MS =
    Number(process.env.HEALTHCHECK_INTERVAL_MS) || 60000;

const MAX_CONSECUTIVE_RPC_FAILURES = 5;

const DIRECT_INCOME_PERCENT = 10;
const PRESALE_PRICE_USDT = 0.01;

const RANKS = [
    {
        rank: 1,
        personalInvestment: 50,
        directBusiness: 1000,
        teamBusiness: 1000,
        requiredRank: 0,
        requiredCount: 0,
        percent: 1,
    },
    {
        rank: 2,
        personalInvestment: 50,
        directBusiness: 1500,
        teamBusiness: 3000,
        requiredRank: 1,
        requiredCount: 2,
        percent: 3,
    },
    {
        rank: 3,
        personalInvestment: 50,
        directBusiness: 5000,
        teamBusiness: 10000,
        requiredRank: 2,
        requiredCount: 2,
        percent: 6,
    },
    {
        rank: 4,
        personalInvestment: 100,
        directBusiness: 15000,
        teamBusiness: 30000,
        requiredRank: 3,
        requiredCount: 2,
        percent: 9,
    },
    {
        rank: 5,
        personalInvestment: 200,
        directBusiness: 50000,
        teamBusiness: 100000,
        requiredRank: 4,
        requiredCount: 2,
        percent: 12,
    },
    {
        rank: 6,
        personalInvestment: 300,
        directBusiness: 150000,
        teamBusiness: 300000,
        requiredRank: 5,
        requiredCount: 2,
        percent: 15,
    },
    {
        rank: 7,
        personalInvestment: 500,
        directBusiness: 500000,
        teamBusiness: 1000000,
        requiredRank: 6,
        requiredCount: 2,
        percent: 18,
    },
    {
        rank: 8,
        personalInvestment: 750,
        directBusiness: 1500000,
        teamBusiness: 3000000,
        requiredRank: 7,
        requiredCount: 2,
        percent: 21,
    },
    {
        rank: 9,
        personalInvestment: 1500,
        directBusiness: 5000000,
        teamBusiness: 10000000,
        requiredRank: 8,
        requiredCount: 2,
        percent: 24,
    },
    {
        rank: 10,
        personalInvestment: 3000,
        directBusiness: 15000000,
        teamBusiness: 30000000,
        requiredRank: 9,
        requiredCount: 2,
        percent: 26,
    },
    {
        rank: 11,
        personalInvestment: 5000,
        directBusiness: 50000000,
        teamBusiness: 100000000,
        requiredRank: 10,
        requiredCount: 2,
        percent: 28,
    },
    {
        rank: 12,
        personalInvestment: 10000,
        directBusiness: 250000000,
        teamBusiness: 500000000,
        requiredRank: 11,
        requiredCount: 2,
        percent: 30,
    },
];

// ============================================================
// BLOCKCHAIN
// ============================================================

const provider = new ethers.JsonRpcProvider(RPC_URL);

const PRESALE_ABI = [
    "event Deposited(address indexed payer, address indexed beneficiary, uint256 usdtAmount, uint256 allocatedEWC, uint256 bonusEWC, uint256 timestamp)",
    "function usdtDecimals() view returns (uint8)",
];

const CLAIM_ABI = [
    "event Claimed(address indexed user, uint256 usdtAmount, uint256 roiEwcAmount, uint256 cumulativeUsdtIncome, uint256 cumulativeRoiEwc, uint256 timestamp, bool isQueued)",
    "event WithdrawalPaid(address indexed user, uint256 amount, uint256 timestamp)",
    "event WithdrawalQueued(address indexed user, uint256 amount, uint256 timestamp)"
];

const contract = new ethers.Contract(
    PRESALE_CONTRACT_ADDRESS,
    PRESALE_ABI,
    provider
);

const claimInterface = new ethers.Interface(CLAIM_ABI);

const depositTopic =
    contract.interface.getEvent("Deposited").topicHash;

const withdrawalPaidTopic =
    claimInterface.getEvent("WithdrawalPaid").topicHash;

const withdrawalQueuedTopic =
    claimInterface.getEvent("WithdrawalQueued").topicHash;

const claimTopic =
    claimInterface.getEvent("Claimed").topicHash;

let usdtDecimals = 18;

let isPolling = false;
let consecutiveFailures = 0;
let lastSuccessfulPollAt = Date.now();

// ============================================================
// HELPERS
// ============================================================

function toHuman(value, decimals = 18) {
    return ethers.formatUnits(value, decimals);
}

function getTransactionHash(event) {
    return event?.transactionHash || event?.hash || null;
}

function getBlockNumber(event) {
    return event?.blockNumber ?? null;
}

// ============================================================
// PRESALE BLOCK CHECKPOINT
// ============================================================

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
        WHERE id = 2
        LIMIT 1
    `);

    if (!rows.length) {
        const initialBlock = Math.max(
            0,
            Number(process.env.PRESALE_DEPLOYMENT_BLOCK || 1) - 1
        );

        await pool.execute(
            `INSERT INTO blockchain_sync
             (id, contract_name, last_block)
             VALUES (2, 'ewc_presale', ?)`,
            [initialBlock]
        );

        return initialBlock;
    }

    return Number(rows[0].last_block);
}

// ============================================================
// MEMBER LOOKUPS
// ============================================================

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

// ============================================================
// DIRECT INCOME
// ============================================================

async function processDirectIncome(
    connection,
    member,
    sponsor,
    usdtAmount,
    txHash
) {
    if (!sponsor) {
        console.log("No sponsor found. Direct income skipped.");
        return;
    }

    if (Number(sponsor.package_choose) < 2) {
        console.log(
            "Sponsor is not active. Direct income skipped:",
            sponsor.user_id
        );
        return;
    }

    const directIncome =
        (Number(usdtAmount) * DIRECT_INCOME_PERCENT) / 100;

    if (directIncome <= 0) {
        return;
    }

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
            `Direct Income from ${member.user_id}`,
        ]
    );

    await connection.execute(
        `
        UPDATE user_wallet
        SET balance = COALESCE(balance, 0) + ?
        WHERE user_id = ?
        `,
        [directIncome, sponsor.id]
    );

    console.log(
        "Direct Income:",
        directIncome,
        "USDT ->",
        sponsor.user_id
    );
}

// ============================================================
// DEPOSIT EVENT
// ============================================================

async function processDepositEvent(event) {
    const connection = await pool.getConnection();

    let transactionOpen = false;

    try {
        console.log("");
        console.log("==========================================");
        console.log("PROCESSING EWC PRESALE DEPOSIT");
        console.log("==========================================");

        const args =
            event.args ||
            contract.interface.parseLog({
                topics: event.topics,
                data: event.data,
            }).args;

        const payer = args.payer ?? args[0];
        const beneficiary = args.beneficiary ?? args[1];
        const usdtAmount = args.usdtAmount ?? args[2];
        const allocatedEWC = args.allocatedEWC ?? args[3];
        const bonusEWC = args.bonusEWC ?? args[4];
        const timestamp = args.timestamp ?? args[5];

        const txHash = getTransactionHash(event);
        const blockNumber = getBlockNumber(event);

        if (!payer || !beneficiary || !txHash) {
            throw new Error("Incomplete presale Deposited event");
        }

        const usdtHuman = toHuman(usdtAmount, usdtDecimals);
        const allocatedEwcHuman = toHuman(allocatedEWC);
        const bonusEwcHuman = toHuman(bonusEWC);
        const allocationPriceHuman = PRESALE_PRICE_USDT;

        console.log("Presale deposit", {
            payer,
            beneficiary,
            usdtHuman,
            allocatedEwcHuman,
            bonusEwcHuman,
            timestamp: Number(timestamp),
            txHash,
            blockNumber,
        });

        const member = await findMemberByWallet(
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

        // ----------------------------------------------------
        // DEPOSIT IDEMPOTENCY
        // ----------------------------------------------------

        const [existing] = await connection.execute(
            `
            SELECT id
            FROM stake_txns
            WHERE txn_id = ?
            LIMIT 1
            `,
            [txHash]
        );

        if (existing.length) {
            console.log("Deposit already processed:", txHash);
            return;
        }

        const sponsor = await findSponsor(
            connection,
            refId
        );

        await connection.beginTransaction();
        transactionOpen = true;

        // ----------------------------------------------------
        // STAKE TRANSACTION
        // ----------------------------------------------------

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
                is_presale,
                bonus_ewc,
                created_on
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, NOW())
            `,
            [
                usdtHuman,
                usdtHuman,
                id,
                txHash,
                beneficiary,
                allocatedEwcHuman,
                allocationPriceHuman,
                bonusEwcHuman,
            ]
        );

        // ----------------------------------------------------
        // MEMBER ACTIVATION / REINVESTMENT
        // ----------------------------------------------------

        if (!wasActivated) {
            const [result] = await connection.execute(
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
                [usdtHuman, usdtHuman, id]
            );

            if (result.affectedRows <= 0) {
                throw new Error(
                    `Member activation failed for ${loginId}`
                );
            }
        } else {
            const [result] = await connection.execute(
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
                [usdtHuman, usdtHuman, id]
            );

            if (result.affectedRows <= 0) {
                throw new Error(
                    `Member re-investment update failed for ${loginId}`
                );
            }
        }

        // ----------------------------------------------------
        // INVESTMENT PACKAGE
        // ----------------------------------------------------

        await connection.execute(
            `
        INSERT INTO select_packages
        (
            u_id,
            pack_amount,
            token_amount,
            current_price,
            status,
            is_presale,
            bonus_ewc,
            vault_status,
            created_on
        )
        VALUES (?, ?, ?, ?, 0, 1, ?, 'pending', NOW())
        `,
            [
                id,
                usdtHuman,
                allocatedEwcHuman,
                allocationPriceHuman,
                bonusEwcHuman,
            ]
        );

        // ----------------------------------------------------
        // FUND TRANSACTION
        // ----------------------------------------------------

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
                id,
            ]
        );

        // ----------------------------------------------------
        // TOP-UP HISTORY
        // ----------------------------------------------------

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
            [id, id, usdtHuman]
        );

        // ----------------------------------------------------
        // NETWORK VOLUME
        // ----------------------------------------------------

        await connection.execute(
            `
            UPDATE levels
            SET
                status = 1,
                package_amount =
                    COALESCE(package_amount, 0) + ?
            WHERE from_id = ?
            `,
            [usdtHuman, id]
        );

        // ----------------------------------------------------
        // RANK CALCULATIONS
        // ----------------------------------------------------

        const ownQualification =
            await calculateQualifiedRank(
                connection,
                member.id
            );

        const [ownRows] = await connection.execute(
            `SELECT COALESCE(level_achieved, 0) AS \`rank\`
             FROM member
             WHERE id = ?
             FOR UPDATE`,
            [member.id]
        );

        if (
            ownQualification.rank >
            Number(ownRows[0]?.rank || 0)
        ) {
            await connection.execute(
                `
                UPDATE member
                SET level_achieved = ?
                WHERE id = ?
                `,
                [ownQualification.rank, member.id]
            );

            await recordRankAchievement(
                connection,
                member.id,
                ownQualification.rank
            );

            await syncAllowanceRank(
                connection,
                member.id,
                ownQualification.rank
            );

            console.log(
                `Monthly Allowance initialized/updated for ${member.user_id} at E-${String(
                    ownQualification.rank
                ).padStart(2, "0")}`
            );
        }

        await updateUplineRanks(connection, member);

        // ----------------------------------------------------
        // DIRECT AND RANK INCOME
        // ----------------------------------------------------

        await processDirectIncome(
            connection,
            member,
            sponsor,
            usdtHuman,
            txHash
        );

        await processRankIncome(
            connection,
            member,
            usdtHuman,
            txHash
        );

        await connection.commit();
        transactionOpen = false;

        console.log("");
        console.log("==========================================");
        console.log("DEPOSIT FULLY PROCESSED");
        console.log("==========================================");
        console.log("User:", loginId);
        console.log("Investment:", usdtHuman, "USDT");
        console.log("EWC allocation:", allocatedEwcHuman, "EWC");
        console.log("Allocation price:", allocationPriceHuman);
        console.log("TX:", txHash);
        console.log("==========================================");
    } catch (error) {
        if (transactionOpen) {
            await connection.rollback();
        }

        console.error("processDepositEvent failed:", error);
        throw error;
    } finally {
        connection.release();
    }
}

// ============================================================
// RANK QUALIFICATION
// ============================================================

async function getDirectBusiness(connection, memberId) {
    const [rows] = await connection.execute(
        `
        SELECT COALESCE(SUM(sp.pack_amount), 0) AS total
        FROM member m
        INNER JOIN select_packages sp ON sp.u_id = m.id
        WHERE m.real_sponsor_id = (
            SELECT user_id
            FROM member
            WHERE id = ?
            LIMIT 1
        )
        AND m.package_choose >= 2
        `,
        [memberId]
    );

    return Number(rows[0]?.total || 0);
}

async function getTeamBusiness(connection, memberId) {
    const [rows] = await connection.execute(
        `
        SELECT COALESCE(
            SUM(COALESCE(m.package_amount, 0)),
            0
        ) AS total
        FROM levels l
        INNER JOIN member m ON m.id = l.from_id
        WHERE l.to_id = ?
          AND l.from_id <> ?
        `,
        [memberId, memberId]
    );

    return Number(rows[0]?.total || 0);
}

async function getRankedDownlineCount(
    connection,
    memberId,
    requiredRank
) {
    if (requiredRank <= 0) {
        return 0;
    }

    const [rows] = await connection.execute(
        `
        SELECT COUNT(DISTINCT child.id) AS total
        FROM member parent
        INNER JOIN member child
            ON child.real_sponsor_id = parent.user_id
        WHERE parent.id = ?
          AND COALESCE(child.level_achieved, 0) >= ?
        `,
        [memberId, requiredRank]
    );

    return Number(rows[0]?.total || 0);
}

async function getPersonalInvestment(connection, memberId) {
    const [rows] = await connection.execute(
        `
        SELECT COALESCE(package_amount, 0)
            AS personal_investment
        FROM member
        WHERE id = ?
        LIMIT 1
        `,
        [memberId]
    );

    return Number(rows[0]?.personal_investment || 0);
}

async function calculateQualifiedRank(connection, memberId) {
    const personalInvestment =
        await getPersonalInvestment(connection, memberId);

    const directBusiness =
        await getDirectBusiness(connection, memberId);

    const teamBusiness =
        await getTeamBusiness(connection, memberId);

    let qualifiedRank = 0;

    for (const rank of RANKS) {
        if (personalInvestment < rank.personalInvestment) {
            break;
        }

        const directRoute =
            directBusiness >= rank.directBusiness;

        let communityRoute = false;

        if (teamBusiness >= rank.teamBusiness) {
            const rankedCount =
                rank.requiredCount > 0
                    ? await getRankedDownlineCount(
                        connection,
                        memberId,
                        rank.requiredRank
                    )
                    : 0;

            communityRoute =
                rankedCount >= rank.requiredCount;
        }

        if (!directRoute && !communityRoute) {
            break;
        }

        qualifiedRank = rank.rank;
    }

    return {
        rank: qualifiedRank,
        personalInvestment,
        directBusiness,
        teamBusiness,
    };
}



async function recordRankAchievement(connection, memberId, newRank) {
    const rank = Number(newRank);

    if (!Number.isInteger(rank) || rank < 1 || rank > 12) {
        throw new Error(`Invalid achieved rank: ${newRank}`);
    }

    // Avoid duplicate records for the same achieved rank.
    const [existing] = await connection.execute(
        `SELECT id
         FROM achieved_level
         WHERE member_id = ?
           AND level_achieved = ?
         LIMIT 1`,
        [memberId, rank]
    );

    if (existing.length > 0) return;

    await connection.execute(
        `INSERT INTO achieved_level
         (
             member_id,
             level_achieved,
             level_amount,
             reward,
             status,
             created_on,
             \`rank\`,
             pool
         )
         VALUES (?, ?, NULL, NULL, 0, NOW(), ?, 0)`,
        [
            memberId,
            rank,
            `E-${String(rank).padStart(2, "0")}`
        ]
    );
}


async function updateUplineRanks(connection, member) {
    let parentUserId = member.real_sponsor_id;

    const visited = new Set();

    while (parentUserId) {
        if (visited.has(parentUserId)) {
            throw new Error(
                `Sponsor loop detected at ${parentUserId}`
            );
        }

        visited.add(parentUserId);

        const [rows] = await connection.execute(
            `
            SELECT
                id,
                user_id,
                real_sponsor_id,
                level_achieved
            FROM member
            WHERE user_id = ?
            LIMIT 1
            `,
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

        const oldRank =
            Number(parent.level_achieved || 0);

        if (result.rank > oldRank) {
            await connection.execute(
                `
                UPDATE member
                SET level_achieved = ?
                WHERE id = ?
                `,
                [result.rank, parent.id]
            );

            await recordRankAchievement(
                connection,
                parent.id,
                result.rank
            );

            await syncAllowanceRank(
                connection,
                parent.id,
                result.rank
            );

            console.log(
                `Rank upgraded: ${parent.user_id} ` +
                `E-${String(oldRank).padStart(2, "0")} -> ` +
                `E-${String(result.rank).padStart(2, "0")}`
            );

            console.log(
                `Direct Business: ${result.directBusiness} USDT | ` +
                `Team Business: ${result.teamBusiness} USDT`
            );

            console.log(
                `Monthly Allowance initialized/updated for ` +
                `${parent.user_id} at E-${String(
                    result.rank
                ).padStart(2, "0")}`
            );
        }

        parentUserId = parent.real_sponsor_id;
    }
}

function getRankPercent(rank) {
    const rankConfig = RANKS.find(
        (item) => item.rank === Number(rank)
    );

    return rankConfig ? rankConfig.percent : 0;
}

// ============================================================
// DIFFERENTIAL RANK INCOME
// ============================================================

async function processRankIncome(
    connection,
    member,
    usdtAmount,
    txHash
) {
    let parentUserId = member.real_sponsor_id;
    let distributedPercent = 0;

    const visited = new Set();

    while (parentUserId && distributedPercent < 30) {
        if (visited.has(parentUserId)) {
            throw new Error(
                `Sponsor loop detected at ${parentUserId}`
            );
        }

        visited.add(parentUserId);

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

        if (!rows.length) {
            break;
        }

        const parent = rows[0];

        const rank =
            Number(parent.level_achieved || 0);

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
                    `
                    INSERT INTO trasections
                    (
                        credit,
                        direction,
                        user_id,
                        description
                    )
                    VALUES (?, 5, ?, ?)
                    `,
                    [
                        income,
                        parent.id,
                        `E-${String(rank).padStart(2, "0")} ` +
                        `Team Income ${differencePercent}% ` +
                        `from ${member.user_id}`,
                    ]
                );

                await connection.execute(
                    `
                    UPDATE user_wallet
                    SET balance =
                        COALESCE(balance, 0) + ?
                    WHERE user_id = ?
                    `,
                    [income, parent.id]
                );

                console.log(
                    `Rank Income: ${income} USDT -> ` +
                    `${parent.user_id} | ` +
                    `Rank E-${String(rank).padStart(2, "0")} | ` +
                    `Differential ${differencePercent}%`
                );
            }

            distributedPercent = rankPercent;
        }

        parentUserId = parent.real_sponsor_id;
    }
}

// ============================================================
// CLAIM EVENT — RESTORED
// ============================================================

async function processClaimEvent(event) {
    const args = event.args;

    const wallet = args.user ?? args[0];
    const txHash = getTransactionHash(event);

    if (!ethers.isAddress(wallet) || !txHash) {
        throw new Error("Invalid Claimed event");
    }

    const connection = await pool.getConnection();

    let transactionOpen = false;

    try {
        await connection.beginTransaction();
        transactionOpen = true;

        const [rows] = await connection.execute(
            `
            SELECT id, user_id
            FROM member
            WHERE LOWER(trx) = ?
            LIMIT 1
            `,
            [wallet.toLowerCase()]
        );

        if (rows.length !== 1) {
            throw new Error(
                `Claim wallet not registered: ${wallet}`
            );
        }

        // ----------------------------------------------------
        // AVOID DUPLICATE WITHDRAWALS
        // ----------------------------------------------------

        const [already] = await connection.execute(
            `
            SELECT id
            FROM withdrawals
            WHERE txn_id = ?
            LIMIT 1
            `,
            [txHash]
        );

        if (already.length) {
            await connection.commit();
            transactionOpen = false;

            console.log(
                "Claim already recorded:",
                txHash
            );

            return;
        }

        // ----------------------------------------------------
        // DECODE CURRENT 6-PARAMETER CLAIMED EVENT
        // ----------------------------------------------------

        const usdtAmount = ethers.formatUnits(
            args.usdtAmount ?? args[1],
            18
        );

        const roiEwcAmount = ethers.formatUnits(
            args.roiEwcAmount ?? args[2],
            18
        );

        const cumulativeUsdt = ethers.formatUnits(
            args.cumulativeUsdtIncome ?? args[3],
            18
        );

        const cumulativeEwc = ethers.formatUnits(
            args.cumulativeRoiEwc ?? args[4],
            18
        );

        const timestamp = Number(
            args.timestamp ?? args[5]
        );

        const isQueued = args.isQueued ?? args[6];

        if (
            !Number.isSafeInteger(timestamp) ||
            timestamp <= 0
        ) {
            throw new Error("Invalid claim timestamp");
        }

        const date = new Date(timestamp * 1000);

        const utcDate = date
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

        // ----------------------------------------------------
        // SAVE INTO EXISTING WITHDRAWALS TABLE
        // ----------------------------------------------------


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
        is_queued,
        date_of_withdrawal,
        date_of_approved
    )
    VALUES
    (
        ?, ?, ?, ?, ?,
        0, ?, ?,
        ?, ?,
        'Merkle claim',
        ?, ?, ?
    )
    `,
            [
                rows[0].id,
                usdtAmount,
                roiEwcAmount,
                cumulativeUsdt,
                cumulativeEwc,

                // Pending amount
                isQueued ? usdtAmount : 0,

                // Status: 0 = pending, 1 = paid
                isQueued ? 0 : 1,

                txHash,
                getBlockNumber(event),

                // Indicates admin queue
                isQueued ? 1 : 0,

                utcDate,

                // Approval date only for automatic payouts
                isQueued ? null : utcDate,
            ]
        );


        await connection.commit();
        transactionOpen = false;

        console.log(
            `CLAIM SAVED | ${rows[0].user_id} | ` +
            `${usdtAmount} USDT | ` +
            `${roiEwcAmount} EWC | ${txHash}`
        );
    } catch (error) {
        if (transactionOpen) {
            await connection.rollback();
        }

        console.error(
            "processClaimEvent failed:",
            error
        );

        throw error;
    } finally {
        connection.release();
    }
}

async function processWithdrawalPaidEvent(event) {
    const args = event.args;

    const wallet = args.user ?? args[0];
    const amount = ethers.formatUnits(
        args.amount ?? args[1],
        18
    );

    const txHash = getTransactionHash(event);

    if (!ethers.isAddress(wallet) || !txHash) {
        throw new Error("Invalid WithdrawalPaid event");
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [members] = await connection.execute(
            `SELECT id FROM member
             WHERE LOWER(trx) = ?
             LIMIT 1`,
            [wallet.toLowerCase()]
        );

        if (!members.length) {
            throw new Error(
                `WithdrawalPaid wallet not registered: ${wallet}`
            );
        }

        const memberId = members[0].id;

        // Prevent duplicate processing.
        const [processed] = await connection.execute(
            `SELECT id
             FROM withdrawal_payments
             WHERE txn_hash = ? AND log_index = ?
             LIMIT 1`,
            [txHash, event.index]
        );

        if (processed.length) {
            await connection.commit();
            return;
        }

        const [rows] = await connection.execute(
            `SELECT id, amount, pending_balance
             FROM withdrawals
             WHERE user_id = ?
               AND is_queued = 1
               AND pending_balance > 0
             ORDER BY id ASC
             FOR UPDATE`,
            [memberId]
        );

        let remaining = amount;

        for (const row of rows) {
            if (Number(remaining) <= 0) break;

            const outstanding = Number(row.pending_balance);
            const payment = Math.min(Number(remaining), outstanding);

            const newBalance = outstanding - payment;

            await connection.execute(
                `UPDATE withdrawals
                 SET pending_balance = ?,
                     status = ?,
                     date_of_approved = CASE
                         WHEN ? = 0 THEN NOW()
                         ELSE date_of_approved
                     END
                 WHERE id = ?`,
                [
                    newBalance,
                    newBalance <= 0 ? 1 : 0,
                    newBalance,
                    row.id
                ]
            );

            remaining = Number(remaining) - payment;
        }

        if (remaining > 0.00000001) {
            throw new Error(
                `WithdrawalPaid exceeds pending balance: ${wallet}`
            );
        }

        await connection.execute(
            `INSERT INTO withdrawal_payments
             (user_id, amount, txn_hash, log_index, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [
                memberId,
                amount,
                txHash,
                event.index
            ]
        );

        await connection.commit();

        console.log(
            `WITHDRAWAL PAID | ${wallet} | ${amount} USDT | ${txHash}`
        );

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// ============================================================
// CLAIM CHECKPOINT
// ============================================================

async function initializeClaimCheckpoint() {
    const [rows] = await pool.execute(
        `
        SELECT contract_name, last_block
        FROM blockchain_sync
        WHERE id = ?
        `,
        [CLAIM_SYNC_ID]
    );

    if (rows.length) {
        if (
            rows[0].contract_name !==
            "ewc_payout_claims"
        ) {
            throw new Error(
                `blockchain_sync id=${CLAIM_SYNC_ID} ` +
                `is already in use: ${rows[0].contract_name}`
            );
        }

        return Number(rows[0].last_block);
    }

    if (
        !Number.isSafeInteger(PAYOUT_DEPLOYMENT_BLOCK) ||
        PAYOUT_DEPLOYMENT_BLOCK <= 0
    ) {
        throw new Error(
            "PAYOUT_DEPLOYMENT_BLOCK is required for historical claim backfill"
        );
    }

    await pool.execute(
        `
        INSERT INTO blockchain_sync
        (id, contract_name, last_block)
        VALUES (?, 'ewc_payout_claims', ?)
        `,
        [
            CLAIM_SYNC_ID,
            PAYOUT_DEPLOYMENT_BLOCK - 1,
        ]
    );

    return PAYOUT_DEPLOYMENT_BLOCK - 1;
}

async function getClaimCheckpoint() {
    const [rows] = await pool.execute(
        `
        SELECT last_block
        FROM blockchain_sync
        WHERE id = ?
        `,
        [CLAIM_SYNC_ID]
    );

    if (!rows.length) {
        throw new Error(
            "Missing payout claim checkpoint"
        );
    }

    return Number(rows[0].last_block);
}

// ============================================================
// SAVE BOTH CHECKPOINTS
// ============================================================


async function saveBothCheckpoints(
    blockNumber,
    depositCursor,
    claimCursor
) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        if (blockNumber > depositCursor) {
            await connection.execute(
                `UPDATE blockchain_sync
                 SET last_block = ?
                 WHERE id = 2`,
                [blockNumber]
            );
        }

        if (
            PAYOUT_ENABLED &&
            blockNumber > claimCursor
        ) {
            await connection.execute(
                `UPDATE blockchain_sync
                 SET last_block = ?
                 WHERE id = ?`,
                [blockNumber, CLAIM_SYNC_ID]
            );
        }

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


// ============================================================
// SINGLE COMBINED POLLING LOOP
// ============================================================


async function pollForPresaleEvents() {
    if (isPolling) return;

    isPolling = true;

    try {
        let depositCursor = await getLastProcessedBlock();

        let claimCursor = PAYOUT_ENABLED
            ? await getClaimCheckpoint()
            : depositCursor;

        const latestBlock = Math.max(
            0,
            (await provider.getBlockNumber()) - CONFIRMATIONS
        );

        let lastBlock = PAYOUT_ENABLED
            ? Math.min(depositCursor, claimCursor)
            : depositCursor;

        while (lastBlock < latestBlock) {
            const fromBlock = lastBlock + 1;

            const toBlock = Math.min(
                fromBlock + BLOCK_BATCH_SIZE - 1,
                latestBlock
            );

            const addresses = PAYOUT_ENABLED
                ? [
                    PRESALE_CONTRACT_ADDRESS,
                    PAYOUT_CONTRACT_ADDRESS
                ]
                : PRESALE_CONTRACT_ADDRESS;

            const topics = PAYOUT_ENABLED
                ? [[depositTopic, claimTopic, withdrawalPaidTopic]]
                : [depositTopic];

            const logs = await provider.getLogs({
                address: addresses,
                topics,
                fromBlock,
                toBlock,
            });

            logs.sort(
                (a, b) =>
                    a.blockNumber - b.blockNumber ||
                    a.index - b.index
            );

            console.log(
                `Scanning ${fromBlock}-${toBlock}: ` +
                `${logs.length} events`
            );

            for (const log of logs) {
                const fromPresale =
                    log.address.toLowerCase() ===
                    PRESALE_CONTRACT_ADDRESS.toLowerCase();

                const fromPayout =
                    PAYOUT_ENABLED &&
                    log.address.toLowerCase() ===
                    PAYOUT_CONTRACT_ADDRESS.toLowerCase();


                if (
                    fromPresale &&
                    log.topics[0] === depositTopic &&
                    log.blockNumber > depositCursor
                ) {
                    const parsed = contract.interface.parseLog(log);

                    await processDepositEvent({
                        ...log,
                        args: parsed.args,
                    });

                } else if (
                    PAYOUT_ENABLED &&
                    fromPayout &&
                    log.topics[0] === claimTopic &&
                    log.blockNumber > claimCursor
                ) {
                    const parsed = claimInterface.parseLog(log);

                    await processClaimEvent({
                        ...log,
                        args: parsed.args,
                    });

                } else if (
                    PAYOUT_ENABLED &&
                    fromPayout &&
                    log.topics[0] === withdrawalPaidTopic &&
                    log.blockNumber > claimCursor
                ) {
                    const parsed = claimInterface.parseLog(log);

                    await processWithdrawalPaidEvent({
                        ...log,
                        args: parsed.args,
                    });
                }

            }

            await saveBothCheckpoints(
                toBlock,
                depositCursor,
                claimCursor
            );

            if (toBlock > depositCursor) {
                depositCursor = toBlock;
            }

            if (PAYOUT_ENABLED && toBlock > claimCursor) {
                claimCursor = toBlock;
            }

            lastBlock = PAYOUT_ENABLED
                ? Math.min(depositCursor, claimCursor)
                : depositCursor;
        }

        consecutiveFailures = 0;
        lastSuccessfulPollAt = Date.now();

    } catch (error) {
        consecutiveFailures++;

        console.error(
            `Event poll failed (#${consecutiveFailures}):`,
            error
        );
    } finally {
        isPolling = false;
    }
}


// ============================================================
// HEALTHCHECK
// ============================================================

function startHealthcheck() {
    setInterval(() => {
        const secondsSinceSuccess =
            (Date.now() - lastSuccessfulPollAt) /
            1000;

        console.log(
            `Healthcheck: last successful poll ` +
            `${secondsSinceSuccess.toFixed(0)}s ago, ` +
            `consecutive failures = ${consecutiveFailures}`
        );

        if (
            consecutiveFailures >=
            MAX_CONSECUTIVE_RPC_FAILURES
        ) {
            console.error(
                "Too many consecutive RPC failures. " +
                "Exiting so PM2 can restart the process."
            );

            process.exit(1);
        }
    }, HEALTHCHECK_INTERVAL_MS);
}

// ============================================================
// START POLLING
// ============================================================

function startPolling() {
    console.log("");
    console.log("==========================================");
    console.log("EWC EVENT LISTENER STARTED");
    console.log("Presale:", PRESALE_CONTRACT_ADDRESS);
    console.log("Payout:", PAYOUT_CONTRACT_ADDRESS);
    console.log("RPC:", RPC_URL);
    console.log("Poll interval:", POLL_INTERVAL_MS, "ms");
    console.log("Confirmations:", CONFIRMATIONS);
    console.log(
        "Watching: Presale Deposited + EWCPayout Claimed"
    );
    console.log("==========================================");

    pollForPresaleEvents();

    setInterval(
        pollForPresaleEvents,
        POLL_INTERVAL_MS
    );

    startHealthcheck();
}

// ============================================================
// MAIN
// ============================================================


async function main() {
    try {
        console.log(
            "Starting EWC blockchain event service..."
        );

        const network = await provider.getNetwork();

        console.log(
            "Connected to chain:",
            network.chainId.toString()
        );

        if (network.chainId !== 56n) {
            throw new Error(
                "Expected BSC Mainnet (56), got " +
                network.chainId.toString()
            );
        }

        const presaleCode = await provider.getCode(
            PRESALE_CONTRACT_ADDRESS
        );

        if (presaleCode === "0x") {
            throw new Error(
                "Presale contract not found at " +
                PRESALE_CONTRACT_ADDRESS
            );
        }

        // Only validate payout when enabled.
        if (PAYOUT_ENABLED) {
            const payoutCode = await provider.getCode(
                PAYOUT_CONTRACT_ADDRESS
            );

            if (payoutCode === "0x") {
                throw new Error(
                    "EWCPayout contract not deployed at " +
                    PAYOUT_CONTRACT_ADDRESS
                );
            }
        }

        usdtDecimals = Number(
            await contract.usdtDecimals()
        );

        console.log("USDT decimals:", usdtDecimals);
        console.log("Payout enabled:", PAYOUT_ENABLED);

        await getLastProcessedBlock();

        if (PAYOUT_ENABLED) {
            await initializeClaimCheckpoint();
        }

        startPolling();
    } catch (error) {
        console.error(
            "EWC EVENT SERVICE FAILED:",
            error
        );

        process.exit(1);
    }
}

main();
