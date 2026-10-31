const { ethers } = require("ethers");
const pool = require("./db");
const config = require("./config");

const RPC_URL = config.rpcUrl;
const PRESALE_CONTRACT_ADDRESS = config.presaleContract || process.env.EWC_PRESALE_CONTRACT;

if (!PRESALE_CONTRACT_ADDRESS || !ethers.isAddress(PRESALE_CONTRACT_ADDRESS)) {
    throw new Error("Configure a valid presaleContract in config.js (or EWC_PRESALE_CONTRACT)");
}

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 10000;
const BLOCK_BATCH_SIZE = Number(process.env.BLOCK_BATCH_SIZE) || 500;
const CONFIRMATIONS = Number(process.env.EVENT_CONFIRMATIONS ?? 12);
const HEALTHCHECK_INTERVAL_MS = Number(process.env.HEALTHCHECK_INTERVAL_MS) || 60000;
const MAX_CONSECUTIVE_RPC_FAILURES = 5;
const DIRECT_INCOME_PERCENT = 10;
const PRESALE_PRICE_USDT = 0.01;
const RANKS = [
    // Direct business threshold OR (community volume + two preceding-rank members).
    { rank: 1, directBusiness: 1000, teamBusiness: 1000, requiredRank: 0, requiredCount: 0, percent: 1 },
    { rank: 2, directBusiness: 1500, teamBusiness: 3000, requiredRank: 1, requiredCount: 2, percent: 3 },
    { rank: 3, directBusiness: 5000, teamBusiness: 10000, requiredRank: 2, requiredCount: 2, percent: 6 },
    { rank: 4, directBusiness: 15000, teamBusiness: 30000, requiredRank: 3, requiredCount: 2, percent: 9 },
    { rank: 5, directBusiness: 50000, teamBusiness: 100000, requiredRank: 4, requiredCount: 2, percent: 12 },
    { rank: 6, directBusiness: 150000, teamBusiness: 300000, requiredRank: 5, requiredCount: 2, percent: 15 },
    { rank: 7, directBusiness: 500000, teamBusiness: 1000000, requiredRank: 6, requiredCount: 2, percent: 18 },
    { rank: 8, directBusiness: 1500000, teamBusiness: 3000000, requiredRank: 7, requiredCount: 2, percent: 21 },
    { rank: 9, directBusiness: 5000000, teamBusiness: 10000000, requiredRank: 8, requiredCount: 2, percent: 24 },
    { rank: 10, directBusiness: 15000000, teamBusiness: 30000000, requiredRank: 9, requiredCount: 2, percent: 26 },
    { rank: 11, directBusiness: 50000000, teamBusiness: 100000000, requiredRank: 10, requiredCount: 2, percent: 28 },
    { rank: 12, directBusiness: 250000000, teamBusiness: 500000000, requiredRank: 11, requiredCount: 2, percent: 30 }
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const PRESALE_ABI = [
    "event Deposited(address indexed payer, address indexed beneficiary, uint256 usdtAmount, uint256 allocatedEWC, uint256 bonusEWC, uint256 timestamp)",
    "function usdtDecimals() view returns (uint8)"
];
const contract = new ethers.Contract(PRESALE_CONTRACT_ADDRESS, PRESALE_ABI, provider);
let usdtDecimals = 18;


let isPolling = false;
let consecutiveFailures = 0;
let lastSuccessfulPollAt = Date.now();


function toHuman(value, decimals = 18) {
    // Database columns use DECIMAL; avoid floating point when storing EWC allocations.
    return ethers.formatUnits(value, decimals);
}

function getTransactionHash(event) {
    return event?.transactionHash || event?.hash || null;
}

function getBlockNumber(event) {
    return event?.blockNumber ?? null;
}


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
        /*
         * Starting at zero is safe but can be very slow on an established
         * chain. If this service is being deployed after the contract,
         * you can manually set last_block to deploymentBlock - 1.
         */

        const initialBlock = Math.max(0, Number(process.env.PRESALE_DEPLOYMENT_BLOCK || 1) - 1);
        await pool.execute(
            `INSERT INTO blockchain_sync (id, contract_name, last_block)
             VALUES (2, 'ewc_presale', ?)`,
            [initialBlock]
        );
        return initialBlock;
    }

    return Number(rows[0].last_block);
}


async function saveLastProcessedBlock(blockNumber) {
    await pool.execute(
        `
        UPDATE blockchain_sync
        SET last_block = ?
        WHERE id = 2
        `,
        [blockNumber]
    );
}


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
        (Number(usdtAmount) * DIRECT_INCOME_PERCENT) / 100;

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


async function processDepositEvent(event) {
    const connection = await pool.getConnection();

    try {
        console.log("");
        console.log("==========================================");
        console.log("PROCESSING EWC PRESALE DEPOSIT");
        console.log("==========================================");

        const args = event.args || contract.interface.parseLog({
            topics: event.topics,
            data: event.data
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
            payer, beneficiary, usdtHuman, allocatedEwcHuman,
            bonusEwcHuman, timestamp: Number(timestamp), txHash, blockNumber
        });

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

        const sponsor =
            await findSponsor(
                connection,
                refId
            );

        await connection.beginTransaction();

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
                bonusEwcHuman
            ]
        );

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
        // The depositing member may now qualify; update before checking uplines.
        const ownQualification = await calculateQualifiedRank(connection, member.id);
        const [ownRows] = await connection.execute(
            "SELECT COALESCE(level_achieved, 0) AS `rank` FROM member WHERE id = ? FOR UPDATE",
            [member.id]
        );
        if (ownQualification.rank > Number(ownRows[0]?.rank || 0)) {
            await connection.execute(
                "UPDATE member SET level_achieved = ? WHERE id = ?",
                [ownQualification.rank, member.id]
            );
        }
        await updateUplineRanks(connection, member);

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
        `SELECT COALESCE(SUM(COALESCE(m.package_amount, 0)), 0) AS total
         FROM levels l
         INNER JOIN member m ON m.id = l.from_id
         WHERE l.to_id = ? AND l.from_id <> ?`,
        [memberId, memberId]
    );
    return Number(rows[0]?.total || 0);
}

// Two independently qualified first-generation members (two distinct branches).
// Direct-business qualification bypasses this requirement entirely.
async function getRankedDownlineCount(connection, memberId, requiredRank) {
    if (requiredRank <= 0) return 0;
    const [rows] = await connection.execute(
        `SELECT COUNT(DISTINCT child.id) AS total
         FROM member parent
         INNER JOIN member child ON child.real_sponsor_id = parent.user_id
         WHERE parent.id = ?
           AND COALESCE(child.level_achieved, 0) >= ?`,
        [memberId, requiredRank]
    );
    return Number(rows[0]?.total || 0);
}

async function calculateQualifiedRank(connection, memberId) {
    const directBusiness = await getDirectBusiness(connection, memberId);
    const teamBusiness = await getTeamBusiness(connection, memberId);

    let qualifiedRank = 0;

    for (const rank of RANKS) {
        const directRoute = directBusiness >= rank.directBusiness;
        let communityRoute = false;
        if (teamBusiness >= rank.teamBusiness) {
            const rankedCount = rank.requiredCount > 0
                ? await getRankedDownlineCount(connection, memberId, rank.requiredRank)
                : 0;
            communityRoute = rankedCount >= rank.requiredCount;
        }
        if (!directRoute && !communityRoute) break;
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


async function pollForPresaleEvents() {
    if (isPolling) {
        return;
    }

    isPolling = true;

    try {
        let lastBlock =
            await getLastProcessedBlock();

        const latestBlock = Math.max(0, (await provider.getBlockNumber()) - CONFIRMATIONS);

        consecutiveFailures = 0;
        lastSuccessfulPollAt = Date.now();

        if (lastBlock >= latestBlock) {
            lastSuccessfulPollAt = Date.now();
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
                    contract.filters.Deposited(),
                    fromBlock,
                    toBlock
                );

            console.log(
                "Total events found:",
                events.length
            );

            for (const event of events) {
                await processDepositEvent(event);
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


function startPolling() {
    console.log("");
    console.log("==========================================");
    console.log("EWC PRESALE EVENT LISTENER STARTED");
    console.log("Contract:", PRESALE_CONTRACT_ADDRESS);
    console.log("RPC:", RPC_URL);
    console.log(
        "Poll interval:",
        POLL_INTERVAL_MS,
        "ms"
    );
    console.log(
        "Watching: Presale Deposited only"
    );
    console.log("==========================================");

    pollForPresaleEvents();

    setInterval(
        pollForPresaleEvents,
        POLL_INTERVAL_MS
    );

    startHealthcheck();
}


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
                PRESALE_CONTRACT_ADDRESS
            );

        if (code === "0x") {
            throw new Error(
                "No contract found at " +
                PRESALE_CONTRACT_ADDRESS
            );
        }

        usdtDecimals = Number(await contract.usdtDecimals());
        console.log("USDT decimals:", usdtDecimals);
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