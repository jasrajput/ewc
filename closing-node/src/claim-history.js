const { ethers } = require("ethers");
const pool = require("./db");
const config = require("./config");

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
|
| Merkle/Claim and Deposit both live on the SAME payout contract, so this
| single listener polls once per cycle and picks up both event types from
| one eth_getLogs call range, instead of running two separate processes
| that would each hit the RPC independently for the same blocks.
|
*/

const RPC_URL = config.rpcUrl;

const PAYOUT_CONTRACT_ADDRESS = config.merkleContract;

console.log(PAYOUT_CONTRACT_ADDRESS);
/*
|--------------------------------------------------------------------------
| POLLING / HEALTH CONFIG
|--------------------------------------------------------------------------
*/

const POLL_INTERVAL_MS =
    Number(process.env.POLL_INTERVAL_MS) ||
    10000; // 10s

const BLOCK_BATCH_SIZE = 500;

const HEALTHCHECK_INTERVAL_MS =
    Number(process.env.HEALTHCHECK_INTERVAL_MS) ||
    60000; // 1 min

const MAX_CONSECUTIVE_RPC_FAILURES = 5;

/*
|--------------------------------------------------------------------------
| PROVIDER
|--------------------------------------------------------------------------
*/

const provider =
    new ethers.JsonRpcProvider(
        RPC_URL
    );

/*
|--------------------------------------------------------------------------
| PAYOUT ABI — both events on one contract
|--------------------------------------------------------------------------
*/

const PAYOUT_ABI = [
    "event Claimed(address indexed user, uint256 payoutAmount, uint256 cumulativeAmount, uint256 price)",
    "event Deposited(address indexed user, uint256 usdtAmount, uint256 tokenAmount, uint256 netTokenAmount, uint256 price, uint256 cycle)",
];

/*
|--------------------------------------------------------------------------
| CONTRACT
|--------------------------------------------------------------------------
*/

const contract =
    new ethers.Contract(
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
| GET LAST PROCESSED BLOCK
|--------------------------------------------------------------------------
|
| One shared cursor row (id = 1) since both event types are scanned in the
| exact same block range on every poll cycle — no need for separate cursors.
|
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

    const [rows] =
        await pool.execute(
            `
            SELECT last_block
            FROM blockchain_sync
            WHERE id = 1
            LIMIT 1
            `
        );

    if (!rows.length) {

        await pool.execute(
            `
            INSERT INTO blockchain_sync
            (id, contract_name, last_block)
            VALUES (1, 'payout_contract', 0)
            `
        );

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
| PROCESS CLAIM EVENT
|--------------------------------------------------------------------------
*/

async function processClaimEvent(event) {

    try {

        console.log("");
        console.log("=================================");
        console.log("PROCESSING CLAIM EVENT");
        console.log("=================================");

        let parsed;

        if (event && event.args) {

            parsed = {
                user: event.args[0],
                payoutAmount: event.args[1],
                cumulativeAmount: event.args[2],
                price: event.args[3]
            };

        } else if (event && event.topics && event.data) {

            const decoded =
                contract.interface.parseLog({
                    topics: event.topics,
                    data: event.data
                });

            parsed = {
                user: decoded.args[0],
                payoutAmount: decoded.args[1],
                cumulativeAmount: decoded.args[2],
                price: decoded.args[3]
            };

        } else {

            throw new Error("Unable to decode Claim event");
        }

        const user = parsed.user;
        const payoutAmount = parsed.payoutAmount;
        const cumulativeAmount = parsed.cumulativeAmount;
        const price = parsed.price;

        const txHash =
            event?.transactionHash ||
            event?.hash ||
            null;

        const blockNumber =
            event?.blockNumber ||
            null;

        console.log("Wallet:", user);
        console.log("Payout:", payoutAmount.toString());
        console.log("Cumulative:", cumulativeAmount.toString());
        console.log("Price:", price.toString());
        console.log("TX:", txHash);
        console.log("Block:", blockNumber);

        if (!user) {
            throw new Error("Claim event has no user address");
        }

        const payoutHuman =
            Number(ethers.formatUnits(payoutAmount, 18));

        const cumulativeHuman =
            Number(ethers.formatUnits(cumulativeAmount, 18));

        const priceHuman =
            Number(ethers.formatUnits(price, 18));



        const [members] =
            await pool.execute(
                `
                SELECT id
                FROM member
                WHERE LOWER(trx) = ?
                LIMIT 1
                `,
                [user.toLowerCase()]
            );

        if (!members.length) {

            console.error("No member found for wallet:", user);
            return;
        }

        const userId = members[0].id;

        if (txHash) {

            const [existing] =
                await pool.execute(
                    `
                    SELECT id
                    FROM withdrawals
                    WHERE txn_id = ?
                    LIMIT 1
                    `,
                    [txHash]
                );

            if (existing.length) {

                console.log("Already recorded:", txHash);
                return;
            }
        }

        let pendingBalance =
            cumulativeHuman - payoutHuman;

        if (pendingBalance < 0) {
            pendingBalance = 0;
        }

        await pool.execute(
            `
            INSERT INTO withdrawals
            (
                user_id,
                amount,
                price,
                pending_balance,
                status,
                txn_id,
                remarks,
                date_of_withdrawal,
                date_of_approved
            )
            VALUES (?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
            `,
            [
                userId,
                payoutHuman,
                priceHuman,
                pendingBalance,
                txHash,
                "Merkle claim"
            ]
        );

        console.log("");
        console.log("=================================");
        console.log("WITHDRAWAL SAVED");
        console.log("User ID:", userId);
        console.log("Amount:", payoutHuman);
        console.log("Cumulative:", cumulativeHuman);
        console.log("Pending:", pendingBalance);
        console.log("TX:", txHash);
        console.log("=================================");

    } catch (error) {
        console.error("processClaimEvent failed:", error);
        throw error;
    }
}

/*
|--------------------------------------------------------------------------
| PROCESS DEPOSIT EVENT
|--------------------------------------------------------------------------
*/

async function processDepositEvent(event) {

    const connection = await pool.getConnection();

    try {

        console.log("");
        console.log("=================================");
        console.log("PROCESSING DEPOSIT EVENT");
        console.log("=================================");

        // ---------------------------------------------------------
        // Decode Deposited event
        // ---------------------------------------------------------

        let parsed;

        if (event && event.args) {

            parsed = {
                user: event.args[0],
                usdtAmount: event.args[1],
                tokenAmount: event.args[2],
                netTokenAmount: event.args[3],
                price: event.args[4],
                cycle: event.args[5]
            };

        } else {

            const decoded = contract.interface.parseLog({
                topics: event.topics,
                data: event.data
            });

            parsed = {
                user: decoded.args[0],
                usdtAmount: decoded.args[1],
                tokenAmount: decoded.args[2],
                netTokenAmount: decoded.args[3],
                price: decoded.args[4],
                cycle: decoded.args[5]
            };
        }

        const user = parsed.user;

        const usdtHuman =
            Number(ethers.formatUnits(parsed.usdtAmount, 18));

        const netTokenHuman = Number(ethers.formatUnits(parsed.netTokenAmount, 18));
        const tokenHuman = Number(ethers.formatUnits(parsed.tokenAmount, 18));
        const burnedHuman = tokenHuman * 0.05;

        const priceHuman = Number(ethers.formatUnits(parsed.price, 18));
        const cycleHuman = parsed.cycle.toString();

        const txHash =
            event?.transactionHash ||
            event?.hash ||
            null;

        const blockNumber =
            event?.blockNumber || null;

        console.log("Wallet:", user);
        console.log("USDT:", usdtHuman);
        console.log("Token:", netTokenHuman);
        console.log("Price:", priceHuman);
        console.log("Cycle:", parsed.cycle.toString());
        console.log("TX:", txHash);
        console.log("Block:", blockNumber);

        if (!user) {
            throw new Error("Deposited event has no user");
        }

        // ---------------------------------------------------------
        // Find member from blockchain wallet
        // ---------------------------------------------------------

        const [members] = await connection.execute(
            `
            SELECT
                id,
                user_id,
                real_sponsor_id,
                package_choose,
                dateOfJoining,
                date_of_activation,
                re_top_up_status,
                limit_is_set
            FROM member
            WHERE LOWER(trx) = ?
            LIMIT 1
            `,
            [user.toLowerCase()]
        );

        if (!members.length) {
            throw new Error(
                `No member found for wallet ${user}`
            );
        }

        const member = members[0];

        const id = member.id;
        const loginId = member.user_id;
        const refId = member.real_sponsor_id;

        const packageChoose = member.package_choose;
        // const userReTopUpStatus = member.re_top_up_status;
        const userLimitIsSet = member.limit_is_set;

        // ---------------------------------------------------------
        // IDEMPOTENCY
        // ---------------------------------------------------------

        if (txHash) {

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

                console.log(
                    "Deposit already processed:",
                    txHash
                );

                connection.release();
                return;
            }
        }

        // ---------------------------------------------------------
        // Start DB transaction
        // ---------------------------------------------------------

        await connection.beginTransaction();

        // ---------------------------------------------------------
        // 1. stake_txns
        // ---------------------------------------------------------

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
                user,
                tokenHuman,
                priceHuman
            ]
        );

        // ---------------------------------------------------------
        // 2. Sponsor information
        // ---------------------------------------------------------

        let sponsor = null;

        if (refId) {

            const [sponsors] = await connection.execute(
                `
                SELECT
                    id,
                    user_id,
                    real_sponsor_id,
                    package_choose,
                    package_amount,
                    current_package,
                    direct_status,
                    dateOfJoining,
                    date_of_activation,
                    limit_pending,
                    re_top_up_status,
                    roi_per,
                    is_pool_exists,
                    limit_is_set
                FROM member
                WHERE user_id = ?
                LIMIT 1
                `,
                [refId]
            );

            if (sponsors.length) {
                sponsor = sponsors[0];
            }
        }

        // ---------------------------------------------------------
        // 3. Base cap / ROI
        // ---------------------------------------------------------

        const limitPending =
            usdtHuman * 2;

        const baseRoiPer = 0.5;

        let numRowsAffected = 0;

        // ---------------------------------------------------------
        // 4. INITIAL PACKAGE
        // ---------------------------------------------------------

        if (packageChoose == 1) {

            const [result] = await connection.execute(`UPDATE member
                SET
                    package_choose = ?,
                    package_amount = package_amount + ?,
                    total_minted_mmt = total_minted_mmt + ?,
                    total_staked_mmt = total_staked_mmt + ?,
                    total_burned_mmt = total_burned_mmt + ?,
                    current_package = ?,
                    limit_pending = limit_pending + ?,
                    roi_per = ?,
                    date_of_activation = NOW()
                WHERE user_id = ?
                `,
                [
                    2,
                    usdtHuman,
                    tokenHuman,
                    netTokenHuman,
                    burnedHuman,
                    usdtHuman,
                    limitPending,
                    baseRoiPer,
                    loginId
                ]
            );

            numRowsAffected = result.affectedRows;

            // First package
            await connection.execute(`INSERT INTO select_packages(
                        u_id,
                        pack_amount,
                        token_amount,
                        roi_per,
                        booster_roi_per,
                        current_price,
                        cycle
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    usdtHuman,
                    netTokenHuman,
                    baseRoiPer,
                    baseRoiPer,
                    priceHuman,
                    cycleHuman
                ]
            );
        }

        // ---------------------------------------------------------
        // 5. RE-TOP-UP
        // ---------------------------------------------------------

        else {

            const reTopLimitMultiplier =
                Number(userLimitIsSet) === 1 ? 4 : 2;

            const limitPendingReTop =
                usdtHuman * reTopLimitMultiplier;

            const [result] = await connection.execute(
                `
        UPDATE member
        SET
            package_choose = ?,
            package_amount = package_amount + ?,
            total_minted_mmt = total_minted_mmt + ?,
            total_staked_mmt = total_staked_mmt + ?,
            total_burned_mmt = total_burned_mmt + ?,
            current_package = ?,
            limit_pending = ?,
            re_top_up_status = 0,
            re_top_up_times = re_top_up_times + 1,
            date_of_re_top = NOW()
        WHERE user_id = ?
        `,
                [
                    2,
                    usdtHuman,
                    tokenHuman,
                    netTokenHuman,
                    burnedHuman,
                    usdtHuman,
                    limitPendingReTop,
                    loginId
                ]
            );

            numRowsAffected = result.affectedRows;

            // Get current active package
            const [oldPackages] = await connection.execute(
                `
        SELECT roi_per, booster_roi_per
        FROM select_packages
        WHERE u_id = ?
          AND status = 0
        ORDER BY id DESC
        LIMIT 1
        `,
                [id]
            );

            let oldRoiPer = baseRoiPer;
            let oldBoosterRoiPer = baseRoiPer;

            if (oldPackages.length) {
                oldRoiPer = oldPackages[0].roi_per;
                oldBoosterRoiPer = oldPackages[0].booster_roi_per;
            }

            // Close old package
            await connection.execute(
                `
        UPDATE select_packages
        SET status = 1
        WHERE u_id = ?
          AND status = 0
        `,
                [id]
            );

            // New re-top-up package
            await connection.execute(
                `
        INSERT INTO select_packages
        (
            u_id,
            pack_amount,
            token_amount,
            roi_per,
            current_price,
        )
            VALUES (?, ?, ?, ?, ?)
        `,
                [
                    id,
                    usdtHuman,
                    tokenHuman,
                    oldRoiPer,
                    priceHuman,
                ]
            );
        }

        if (numRowsAffected <= 0) {
            throw new Error(
                `Member update failed for user ${loginId}`
            );
        }

        // ---------------------------------------------------------
        // 6. Fund transaction
        // ---------------------------------------------------------

        await connection.execute(`INSERT INTO fund_transactions
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

        // ---------------------------------------------------------
        // 7. user_top_up_by
        // ---------------------------------------------------------

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

        // ---------------------------------------------------------
        // 8. Green level
        // ---------------------------------------------------------

        await connection.execute(
            `
            UPDATE levels
            SET
                status = 1,
                package_amount = package_amount + ?
            WHERE from_id = ?
            `,
            [
                usdtHuman,
                id
            ]
        );


        // ---------------------------------------------------------
        // COMMIT
        // ---------------------------------------------------------

        await connection.commit();

        console.log("");
        console.log("=================================");
        console.log("DEPOSIT FULLY PROCESSED");
        console.log("User ID:", loginId);
        console.log("Amount:", usdtHuman);
        console.log("TX:", txHash);
        console.log("=================================");

    } catch (error) {

        await connection.rollback();

        console.error(
            "processDepositEvent failed:",
            error
        );

        // IMPORTANT:
        // Throw instead of silently swallowing the error.
        // This prevents the blockchain cursor from advancing
        // past a deposit that was not successfully processed.

        throw error;

    } finally {

        connection.release();
    }
}

/*
|--------------------------------------------------------------------------
| POLL FOR NEW EVENTS (Claimed + Deposited, one pass)
|--------------------------------------------------------------------------
|
| Uses a single queryFilter call with no event-name filter (contract-wide),
| which returns ALL event logs from this contract in the block range —
| both Claimed and Deposited — in ONE eth_getLogs call instead of two.
| Each log is then routed to the right processor by its decoded event name.
|
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

            const fromBlock = lastBlock + 1;

            const toBlock =
                Math.min(
                    fromBlock + BLOCK_BATCH_SIZE - 1,
                    latestBlock
                );

            console.log(
                `Scanning blocks ${fromBlock} -> ${toBlock}`
            );

            /*
             * contract.queryFilter() with no filter argument (or "*")
             * returns every event log emitted by this contract address
             * in the range, regardless of event type — one RPC call
             * covers both Claimed and Deposited.
             */

            const events =
                await contract.queryFilter(
                    "*",
                    fromBlock,
                    toBlock
                );

            console.log("Total events found:", events.length);

            for (const event of events) {

                const eventName = event.fragment?.name;

                if (eventName === "Claimed") {
                    await processClaimEvent(event);
                } else if (eventName === "Deposited") {
                    await processDepositEvent(event);
                } else {
                    console.log("Skipping unrecognized event:", eventName);
                }
            }

            await saveLastProcessedBlock(toBlock);

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
            (Date.now() - lastSuccessfulPollAt) / 1000;

        console.log(
            `Healthcheck: last successful poll ${secondsSinceSuccess.toFixed(0)}s ago, consecutive failures = ${consecutiveFailures}`
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_RPC_FAILURES) {

            console.error(
                "Too many consecutive RPC failures. Exiting so pm2 can restart the process."
            );

            process.exit(1);
        }

    }, HEALTHCHECK_INTERVAL_MS);
}

/*
|--------------------------------------------------------------------------
| START POLLING LOOP
|--------------------------------------------------------------------------
*/

function startPolling() {

    console.log("");
    console.log("==========================================");
    console.log("PAYOUT EVENTS LISTENER STARTED (POLLING MODE)");
    console.log("Contract:", PAYOUT_CONTRACT_ADDRESS);
    console.log("RPC:", RPC_URL);
    console.log("Poll interval:", POLL_INTERVAL_MS, "ms");
    console.log("Watching: Claimed and Deposited");
    console.log("==========================================");

    pollForPayoutEvents();

    setInterval(
        pollForPayoutEvents,
        POLL_INTERVAL_MS
    );

    startHealthcheck();

    console.log("Listening for Claimed + Deposited events via polling...");
}

/*
|--------------------------------------------------------------------------
| MAIN
|--------------------------------------------------------------------------
*/

async function main() {

    try {

        console.log("Starting payout events service...");

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
                "No contract found at " + PAYOUT_CONTRACT_ADDRESS
            );
        }

        startPolling();

    } catch (error) {

        console.error("PAYOUT EVENTS SERVICE FAILED:");
        console.error(error);

        process.exit(1);
    }
}

main();