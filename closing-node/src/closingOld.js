const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const pool = require("./db");
const config = require("./config");

const {
    createLeaf,
    buildMerkleTree,
    getMerkleProof
} = require("./merkle");

const {
    publishMerkleRootWithRetry
} = require("./blockchain");

/* =========================================================
 * CONFIG
 * ========================================================= */

const RPC_URL = config.rpcUrl || process.env.RPC_URL;
const PAIR_ADDRESS = config.pairAddress || process.env.PAIR_ADDRESS;
const EWC_ADDRESS = config.ewcAddress || process.env.EWC_ADDRESS;
const USDT_ADDRESS = config.usdtAddress || process.env.USDT_ADDRESS;

const EWC_DECIMALS = 18;

/*
 * Your test USDT currently uses 18 decimals.
 *
 * If production USDT has different decimals this is read
 * directly from the token contract before calculating price.
 */

const provider = new ethers.JsonRpcProvider(RPC_URL);

const PAIR_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)"
];

const ERC20_ABI = [
    "function decimals() view returns (uint8)"
];

/*
 * ROI rule:
 *
 * Starts on day 101 after package creation.
 * Monthly reward = 2% of invested USDT.
 * Daily reward   = 2% / 30.
 */

const ROI_MONTHLY_PERCENT = 2n;
const ROI_DAYS_PER_MONTH = 30n;
const ROI_START_DAY = 101;

/* =========================================================
 * BASIC HELPERS
 * ========================================================= */

function normalizeAddress(address) {
    return String(address || "").trim().toLowerCase();
}

function decimalToScaledBigInt(value, decimals = 18) {
    const str = String(value ?? "0").trim();

    if (!str) return 0n;

    const negative = str.startsWith("-");
    const unsigned = negative ? str.slice(1) : str;

    const parts = unsigned.split(".");
    const whole = parts[0] || "0";

    let fraction = parts[1] || "";

    fraction = fraction
        .padEnd(decimals, "0")
        .slice(0, decimals);

    const result =
        BigInt(whole) * (10n ** BigInt(decimals)) +
        BigInt(fraction || "0");

    return negative ? -result : result;
}

function scaledBigIntToDecimal(value, decimals = 18) {
    value = BigInt(value);

    const negative = value < 0n;

    if (negative) value = -value;

    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const fraction = value % base;

    const fractionString = fraction
        .toString()
        .padStart(decimals, "0")
        .replace(/0+$/, "");

    const result = fractionString
        ? `${whole}.${fractionString}`
        : `${whole}`;

    return negative ? `-${result}` : result;
}

function compareAmounts(a, b) {
    const aa = decimalToScaledBigInt(a, 18);
    const bb = decimalToScaledBigInt(b, 18);

    if (aa > bb) return 1;
    if (aa < bb) return -1;

    return 0;
}

function getIndiaDate() {
    return new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata"
    });
}

/*
 * Difference between package creation date and today's
 * closing date using calendar days.
 */

function getPackageAgeDays(createdOn) {
    if (!createdOn) return 0;

    const created = new Date(createdOn);

    const createdDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(created);

    const todayDate = getIndiaDate();

    const createdUtc = Date.parse(`${createdDate}T00:00:00Z`);
    const todayUtc = Date.parse(`${todayDate}T00:00:00Z`);

    if (!Number.isFinite(createdUtc) || !Number.isFinite(todayUtc)) {
        return 0;
    }

    return Math.floor(
        (todayUtc - createdUtc) / 86400000
    );
}

/* =========================================================
 * GET CURRENT EWC PRICE FROM PANCAKE PAIR
 * ========================================================= */

async function getClosingEwcPrice() {
    if (!RPC_URL) {
        throw new Error("RPC_URL is missing.");
    }

    if (!PAIR_ADDRESS) {
        throw new Error("PAIR_ADDRESS is missing.");
    }

    if (!EWC_ADDRESS) {
        throw new Error("EWC_ADDRESS is missing.");
    }

    if (!USDT_ADDRESS) {
        throw new Error("USDT_ADDRESS is missing.");
    }

    const pair = new ethers.Contract(
        PAIR_ADDRESS,
        PAIR_ABI,
        provider
    );

    const [
        token0,
        token1,
        reserves
    ] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves()
    ]);

    const token0Address = normalizeAddress(token0);
    const token1Address = normalizeAddress(token1);
    const ewcAddress = normalizeAddress(EWC_ADDRESS);
    const usdtAddress = normalizeAddress(USDT_ADDRESS);

    const validPair =
        (token0Address === ewcAddress &&
            token1Address === usdtAddress) ||
        (token0Address === usdtAddress &&
            token1Address === ewcAddress);

    if (!validPair) {
        throw new Error(
            "Configured Pancake pair is not EWC/USDT."
        );
    }

    const usdtContract = new ethers.Contract(
        USDT_ADDRESS,
        ERC20_ABI,
        provider
    );

    const usdtDecimals = Number(
        await usdtContract.decimals()
    );

    const reserve0 = BigInt(reserves[0].toString());
    const reserve1 = BigInt(reserves[1].toString());

    let ewcReserve;
    let usdtReserve;

    if (token0Address === ewcAddress) {
        ewcReserve = reserve0;
        usdtReserve = reserve1;
    } else {
        ewcReserve = reserve1;
        usdtReserve = reserve0;
    }

    if (ewcReserve <= 0n || usdtReserve <= 0n) {
        throw new Error(
            "EWC/USDT pair has invalid reserves."
        );
    }

    /*
     * Return USDT price of 1 EWC using 18-decimal precision.
     *
     * price18 =
     *
     * normalized USDT reserve
     * -----------------------
     * normalized EWC reserve
     */

    const price18 =
        (
            usdtReserve *
            (10n ** BigInt(EWC_DECIMALS)) *
            (10n ** 18n)
        ) /
        (
            ewcReserve *
            (10n ** BigInt(usdtDecimals))
        );

    if (price18 <= 0n) {
        throw new Error("Calculated EWC price is zero.");
    }

    return {
        priceWei: price18,
        price: scaledBigIntToDecimal(price18, 18),
        usdtDecimals
    };
}

/* =========================================================
 * PROCESS DAILY ROI
 * ========================================================= */

async function processClosing() {
    console.log("Starting daily ROI closing...");

    const connection = await pool.getConnection();

    try {
        /*
         * Get the closing EWC price ONCE.
         *
         * Every package in this closing uses the exact
         * same price.
         */

        const closingPrice = await getClosingEwcPrice();

        console.log(
            "Closing EWC Price:",
            closingPrice.price,
            "USDT"
        );

        /*
         * We only fetch packages which have not already
         * received today's ROI.
         */

        const [packages] = await connection.execute(`
            SELECT
                id,
                u_id,
                pack_amount,
                created_on,
                last_roi_date
            FROM select_packages
            WHERE status = 0
              AND (
                    last_roi_date IS NULL
                    OR last_roi_date < CURDATE()
              )
        `);

        console.log("Packages found:", packages.length);

        let processedCount = 0;

        for (const pkg of packages) {
            const packageId = Number(pkg.id);
            const memberId = Number(pkg.u_id);
            const packageAmount = String(
                pkg.pack_amount ?? "0"
            );

            if (
                !Number.isInteger(packageId) ||
                packageId <= 0
            ) {
                console.error(
                    "Invalid package ID:",
                    pkg.id
                );
                continue;
            }

            if (
                !Number.isInteger(memberId) ||
                memberId <= 0
            ) {
                console.error(
                    `Invalid member ID for package ${packageId}`
                );
                continue;
            }

            if (
                compareAmounts(packageAmount, "0") <= 0
            ) {
                continue;
            }

            /*
             * ROI starts from DAY 101.
             *
             * created_on date = day 1.
             *
             * age 0 = creation date
             * age 99 = day 100
             * age 100 = day 101
             */

            const ageDays = getPackageAgeDays(
                pkg.created_on
            );

            if (ageDays < ROI_START_DAY - 1) {
                console.log(
                    `Skipping package ${packageId}: ` +
                    `ROI starts on day ${ROI_START_DAY}. ` +
                    `Current day: ${ageDays + 1}`
                );

                continue;
            }

            await connection.beginTransaction();

            try {
                /*
                 * Lock package so two closing processes cannot
                 * reward the same package twice.
                 */

                const [lockedPackages] =
                    await connection.execute(
                        `
                        SELECT
                            id,
                            created_on,
                            last_roi_date
                        FROM select_packages
                        WHERE id = ?
                        FOR UPDATE
                        `,
                        [packageId]
                    );

                if (!lockedPackages.length) {
                    throw new Error(
                        `Package ${packageId} no longer exists.`
                    );
                }

                const locked =
                    lockedPackages[0];

                /*
                 * Recheck eligibility inside transaction.
                 */

                const lockedAgeDays =
                    getPackageAgeDays(
                        locked.created_on
                    );

                if (
                    lockedAgeDays <
                    ROI_START_DAY - 1
                ) {
                    await connection.rollback();
                    continue;
                }

                if (locked.last_roi_date) {
                    const lastDate =
                        new Date(
                            locked.last_roi_date
                        ).toLocaleDateString(
                            "en-CA",
                            {
                                timeZone:
                                    "Asia/Kolkata"
                            }
                        );

                    if (lastDate === getIndiaDate()) {
                        await connection.rollback();

                        console.log(
                            `Package ${packageId} already processed today.`
                        );

                        continue;
                    }
                }

                /*
                 * Investment amount uses 18-decimal internal
                 * precision.
                 */

                const investmentWei =
                    decimalToScaledBigInt(
                        packageAmount,
                        18
                    );

                /*
                 * DAILY ROI IN USD
                 *
                 * investment × 2% / 30
                 *
                 * = investment * 2 / 100 / 30
                 */

                const dailyRoiUsdWei =
                    (
                        investmentWei *
                        ROI_MONTHLY_PERCENT
                    ) /
                    (
                        100n *
                        ROI_DAYS_PER_MONTH
                    );

                if (dailyRoiUsdWei <= 0n) {
                    await connection.rollback();
                    continue;
                }

                /*
                 * Convert today's USD ROI into EWC using
                 * today's closing price.
                 *
                 * Both values are 18 decimals:
                 *
                 * ewc = usd * 1e18 / price
                 */

                const dailyRoiEwcWei =
                    (
                        dailyRoiUsdWei *
                        (10n ** 18n)
                    ) /
                    closingPrice.priceWei;

                if (dailyRoiEwcWei <= 0n) {
                    throw new Error(
                        `ROI EWC calculated as zero for package ${packageId}`
                    );
                }

                const dailyRoiUsd =
                    scaledBigIntToDecimal(
                        dailyRoiUsdWei,
                        18
                    );

                const dailyRoiEwc =
                    scaledBigIntToDecimal(
                        dailyRoiEwcWei,
                        18
                    );

                console.log(
                    "================================="
                );
                console.log("PACKAGE ROI");
                console.log(
                    "Package ID:",
                    packageId
                );
                console.log(
                    "Member ID:",
                    memberId
                );
                console.log(
                    "Investment:",
                    packageAmount,
                    "USDT"
                );
                console.log(
                    "Package Day:",
                    lockedAgeDays + 1
                );
                console.log(
                    "Closing EWC Price:",
                    closingPrice.price
                );
                console.log(
                    "Daily ROI USD:",
                    dailyRoiUsd
                );
                console.log(
                    "Daily ROI EWC:",
                    dailyRoiEwc
                );

                /*
                 * roi_comp remains useful as USD ROI history.
                 *
                 * This is NOT what goes into the Merkle leaf.
                 */

                const [packageUpdate] =
                    await connection.execute(
                        `
                        UPDATE select_packages
                        SET
                            roi_comp =
                                COALESCE(roi_comp, 0) + ?,
                            last_roi_date = CURDATE()
                        WHERE id = ?
                        `,
                        [
                            dailyRoiUsd,
                            packageId
                        ]
                    );

                if (
                    packageUpdate.affectedRows <= 0
                ) {
                    throw new Error(
                        `Failed to update package ${packageId}`
                    );
                }

                /*
                 * roi_income can remain the cumulative
                 * human-readable EWC ROI value.
                 *
                 * cumulative_roi_ewc is the value used for
                 * Merkle entitlement.
                 */

                const [walletUpdate] =
                    await connection.execute(
                        `
                        UPDATE user_wallet
                        SET
                            roi_income =
                                COALESCE(roi_income, 0) + ?,
                            cumulative_roi_ewc =
                                COALESCE(cumulative_roi_ewc, 0) + ?
                        WHERE user_id = ?
                        `,
                        [
                            dailyRoiEwc,
                            dailyRoiEwc,
                            memberId
                        ]
                    );

                if (
                    walletUpdate.affectedRows <= 0
                ) {
                    throw new Error(
                        `user_wallet not found for member ${memberId}`
                    );
                }

                /*
                 * Direction 7 = ROI.
                 *
                 * Since ROI is now paid in EWC, credit stores
                 * the EWC quantity.
                 */

                const description =
                    `ROI Income ${dailyRoiEwc} EWC ` +
                    `at $${closingPrice.price}`;

                await connection.execute(
                    `
                    INSERT INTO trasections
                    (
                        credit,
                        direction,
                        user_id,
                        description
                    )
                    VALUES (?, 7, ?, ?)
                    `,
                    [
                        dailyRoiEwc,
                        memberId,
                        description
                    ]
                );

                await connection.commit();

                processedCount++;

                console.log(
                    `Processed package ${packageId} | ` +
                    `${dailyRoiEwc} EWC`
                );
            } catch (error) {
                await connection.rollback();

                console.error(
                    `FAILED package ${packageId}:`,
                    error.message
                );
            }
        }

        console.log(
            `ROI closing completed. Processed: ${processedCount}`
        );

        return {
            processedCount,
            closingPrice: closingPrice.price
        };
    } finally {
        connection.release();
    }
}

/* =========================================================
 * CLOSE USDT INCOME
 * ========================================================= */

async function closeUsdtIncome() {
    console.log(
        "Closing Direct + Rank USDT income..."
    );

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        /*
         * balance currently contains income generated since
         * the previous successful closing.
         *
         * Move that amount into lifetime cumulative entitlement
         * and reset live balance.
         *
         * Salary will automatically work later if salary income
         * is credited into this same balance column.
         */

        const [result] = await connection.execute(`
            UPDATE user_wallet
            SET
                cumulative_usdt_income =
                    COALESCE(cumulative_usdt_income, 0) +
                    COALESCE(balance, 0),

                balance = 0

            WHERE COALESCE(balance, 0) > 0
        `);

        await connection.commit();

        console.log(
            "USDT income closed. Wallets:",
            result.affectedRows
        );

        return result.affectedRows;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/* =========================================================
 * BUILD MERKLE SNAPSHOT
 * ========================================================= */

async function buildSnapshot() {
    console.log("Building Merkle tree...");

    const connection = await pool.getConnection();

    try {
        /*
         * IMPORTANT:
         *
         * We include users who have either USDT entitlement
         * OR EWC ROI entitlement.
         */

        const [rows] = await connection.execute(`
            SELECT
                uw.user_id,
                m.trx,
                COALESCE(
                    uw.cumulative_usdt_income,
                    0
                ) AS cumulative_usdt_income,
                COALESCE(
                    uw.cumulative_roi_ewc,
                    0
                ) AS cumulative_roi_ewc
            FROM user_wallet uw
            INNER JOIN member m
                ON m.id = uw.user_id
            WHERE m.trx IS NOT NULL
              AND m.trx != ''
              AND (
                    COALESCE(
                        uw.cumulative_usdt_income,
                        0
                    ) > 0
                    OR
                    COALESCE(
                        uw.cumulative_roi_ewc,
                        0
                    ) > 0
              )
        `);

        if (!rows.length) {
            throw new Error(
                "No users with cumulative entitlement."
            );
        }

        const users = [];
        const leaves = [];

        for (const row of rows) {
            const wallet =
                normalizeAddress(row.trx);

            if (
                !/^0x[a-f0-9]{40}$/.test(wallet)
            ) {
                console.error(
                    `Invalid wallet for user ${row.user_id}: ${row.trx}`
                );

                continue;
            }

            const cumulativeUsdt =
                String(
                    row.cumulative_usdt_income ??
                    "0"
                );

            const cumulativeRoiEwc =
                String(
                    row.cumulative_roi_ewc ??
                    "0"
                );

            const cumulativeUsdtWei =
                decimalToScaledBigInt(
                    cumulativeUsdt,
                    18
                );

            const cumulativeRoiEwcWei =
                decimalToScaledBigInt(
                    cumulativeRoiEwc,
                    18
                );

            /*
             * Must match Solidity exactly:
             *
             * keccak256(
             *     abi.encode(
             *         user,
             *         cumulativeUsdtIncome,
             *         cumulativeRoiEwc
             *     )
             * )
             */

            const leaf = createLeaf(
                wallet,
                cumulativeUsdtWei,
                cumulativeRoiEwcWei
            );

            const index = leaves.length;

            leaves.push(leaf);

            users.push({
                index,
                user_id: Number(
                    row.user_id
                ),
                wallet,
                cumulative_usdt_income:
                    cumulativeUsdt,
                cumulative_roi_ewc:
                    cumulativeRoiEwc,
                cumulative_usdt_income_wei:
                    cumulativeUsdtWei.toString(),
                cumulative_roi_ewc_wei:
                    cumulativeRoiEwcWei.toString(),
                leaf
            });
        }

        if (!leaves.length) {
            throw new Error(
                "No valid Merkle leaves."
            );
        }

        console.log(
            "Merkle users:",
            leaves.length
        );

        const levels =
            buildMerkleTree(leaves);

        if (!levels.length) {
            throw new Error(
                "Failed to build Merkle tree."
            );
        }

        const root =
            levels[levels.length - 1][0];

        if (!root) {
            throw new Error(
                "Merkle root was not generated."
            );
        }

        console.log(
            "Merkle Root:",
            root
        );

        for (const user of users) {
            user.proof =
                getMerkleProof(
                    levels,
                    user.index
                );
        }

        const now = new Date();

        const snapshotId = now
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\..+/, "")
            .replace("T", "_");

        const directory =
            path.resolve(
                config.merkleDirectory
            );

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(
                directory,
                {
                    recursive: true
                }
            );
        }

        const snapshotFile =
            path.join(
                directory,
                `snapshot_${snapshotId}.json`
            );

        const snapshotData = {
            snapshot_id: snapshotId,
            created_at: now.toISOString(),
            root,
            users
        };

        fs.writeFileSync(
            snapshotFile,
            JSON.stringify(
                snapshotData,
                null,
                2
            )
        );

        console.log(
            "Snapshot saved:",
            snapshotFile
        );

        return {
            snapshotId,
            root,
            users,
            snapshotFile
        };
    } finally {
        connection.release();
    }
}

/* =========================================================
 * WRITE LATEST SNAPSHOT
 * ========================================================= */

function writeLatestFile(snapshot, published) {
    const directory =
        path.resolve(
            config.merkleDirectory
        );

    if (!fs.existsSync(directory)) {
        fs.mkdirSync(
            directory,
            {
                recursive: true
            }
        );
    }

    const latestFile =
        path.join(
            directory,
            "latest.json"
        );

    /*
     * Store enough information to locate the actual
     * snapshot containing the proofs.
     */

    const latestData = {
        snapshot_id:
            snapshot.snapshotId,
        root:
            published.root,
        tx_hash:
            published.txHash,
        block_number:
            published.blockNumber,
        created_at:
            new Date().toISOString()
    };

    fs.writeFileSync(
        latestFile,
        JSON.stringify(
            latestData,
            null,
            2
        )
    );

    console.log(
        "latest.json updated:",
        latestFile
    );
}

/* =========================================================
 * DAILY CLOSING
 * ========================================================= */

async function dailyClosing() {
    const today = getIndiaDate();

    try {
        /*
         * Get/create today's closing run.
         */

        let [rows] = await pool.execute(
            `
            SELECT *
            FROM closing_runs
            WHERE run_date = ?
            `,
            [today]
        );

        if (!rows.length) {
            await pool.execute(
                `
                INSERT INTO closing_runs
                    (run_date)
                VALUES (?)
                `,
                [today]
            );

            [rows] = await pool.execute(
                `
                SELECT *
                FROM closing_runs
                WHERE run_date = ?
                `,
                [today]
            );
        }

        const run = rows[0];

        /* =================================================
         * STAGE 1: DAILY ROI
         * ================================================= */

        if (run.roi_status !== "done") {
            const roiResult =
                await processClosing();

            await pool.execute(
                `
                UPDATE closing_runs
                SET roi_status = 'done'
                WHERE run_date = ?
                `,
                [today]
            );

            run.roi_status = "done";

            console.log(
                "ROI stage completed.",
                "Packages:",
                roiResult.processedCount,
                "Price:",
                roiResult.closingPrice
            );
        } else {
            console.log(
                "ROI already processed today."
            );
        }

        /* =================================================
         * STAGE 2: CLOSE USDT INCOME
         * =================================================
         *
         * We use snapshot_status as the transaction boundary
         * for this operation because your current closing_runs
         * schema does not have a separate USDT closing status.
         *
         * IMPORTANT:
         * closeUsdtIncome() must happen immediately before
         * buildSnapshot().
         * ================================================= */

        let snapshot;

        if (
            run.snapshot_status !== "done"
        ) {
            /*
             * Move current Direct + Rank (+ Salary later)
             * balance into lifetime cumulative entitlement.
             */

            await closeUsdtIncome();

            /*
             * Build snapshot AFTER the balance has been rolled
             * into cumulative_usdt_income.
             */

            snapshot =
                await buildSnapshot();

            await pool.execute(
                `
                UPDATE closing_runs
                SET
                    snapshot_status = 'done',
                    snapshot_id = ?,
                    merkle_root = ?
                WHERE run_date = ?
                `,
                [
                    snapshot.snapshotId,
                    snapshot.root,
                    today
                ]
            );

            run.snapshot_status = "done";
            run.snapshot_id =
                snapshot.snapshotId;
            run.merkle_root =
                snapshot.root;
        } else {
            console.log(
                "Snapshot already built today, reusing:",
                run.merkle_root
            );

            snapshot = {
                snapshotId:
                    run.snapshot_id,
                root:
                    run.merkle_root
            };
        }

        /* =================================================
         * STAGE 3: PUBLISH ROOT
         * ================================================= */

        if (
            run.publish_status !== "done"
        ) {
            const published =
                await publishMerkleRootWithRetry(
                    snapshot.root
                );

            await pool.execute(
                `
                UPDATE closing_runs
                SET
                    publish_status = 'done',
                    tx_hash = ?
                WHERE run_date = ?
                `,
                [
                    published.txHash,
                    today
                ]
            );

            run.publish_status = "done";
            run.tx_hash =
                published.txHash;

            writeLatestFile(
                snapshot,
                published
            );
        } else {
            console.log(
                "Root already published today:",
                run.tx_hash
            );
        }

        console.log(
            "DAILY CLOSING SUCCESS"
        );
    } catch (error) {
        console.error(
            "DAILY CLOSING FAILED " +
            "(safe to retry from completed stage):",
            error
        );

        throw error;
    } finally {
        await pool.end();
    }
}

module.exports = {
    dailyClosing
};