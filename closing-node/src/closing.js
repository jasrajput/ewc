const fs = require("fs");
const path = require("path");

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
 * HELPERS
 * ========================================================= */

function normalizeAddress(address) {
    return String(address).trim().toLowerCase();
}


/*
 * Convert a decimal string into a scaled BigInt.
 *
 * Example with 18 decimals:
 * "1.5" -> 1500000000000000000n
 */
function decimalToScaledBigInt(value, decimals = 18) {
    const str = String(value ?? "0").trim();

    if (!str) {
        return 0n;
    }

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


/*
 * Convert a scaled BigInt back into a decimal string.
 */
function scaledBigIntToDecimal(value, decimals = 18) {
    const negative = value < 0n;

    if (negative) {
        value = -value;
    }

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


/*
 * Convert percentage into an integer with 2 decimal precision.
 *
 * Examples:
 * 2    -> 200
 * 2.5  -> 250
 * 0.25 -> 25
 */
function percentageToScaledInt(value) {
    const str = String(value ?? "0").trim();

    if (!str) {
        return 0n;
    }

    const [wholePart, decimalPart = ""] = str.split(".");
    const whole = BigInt(wholePart || "0");
    const decimals = (decimalPart + "00").slice(0, 2);

    return (whole * 100n) + BigInt(decimals);
}


/*
 * Calculate:
 *
 * amount * percentage / 100
 */
function calculatePercentage(amount, percentage) {
    const amount18 = decimalToScaledBigInt(amount, 18);
    const percentageScaled = percentageToScaledInt(percentage);

    const result = (amount18 * percentageScaled) / 10000n;

    return scaledBigIntToDecimal(result, 18);
}


/*
 * Compare two decimal values without using JS floating point.
 *
 * Returns:
 *  1 -> amount1 > amount2
 *  0 -> equal
 * -1 -> amount1 < amount2
 */
function compareAmounts(amount1, amount2) {
    const a = decimalToScaledBigInt(amount1, 18);
    const b = decimalToScaledBigInt(amount2, 18);

    if (a > b) return 1;
    if (a < b) return -1;

    return 0;
}


/* =========================================================
 * PROCESS DAILY ROI
 * ========================================================= */

async function processClosing() {
    let processed = false;

    console.log("Starting daily ROI closing...");

    const connection = await pool.getConnection();

    try {
        /*
         * Get packages which:
         *
         * - are active according to the current package status
         * - have not already received ROI today
         *
         * The final EWC 100-day / 2%-monthly reward rule
         * is NOT implemented here yet.
         */
        const [packages] = await connection.execute(`
            SELECT
                id,
                u_id,
                pack_amount,
                roi_per
            FROM select_packages
            WHERE status = 0
              AND (
                  last_roi_date IS NULL
                  OR last_roi_date < CURDATE()
              )
        `);

        console.log("Packages found:", packages.length);

        for (const pkg of packages) {
            const packageId = Number(pkg.id);
            const memberId = Number(pkg.u_id);
            const packageAmount = String(pkg.pack_amount ?? "0");
            const roiPercentage = String(pkg.roi_per ?? "0");

            /*
             * Basic validation.
             */
            if (!Number.isInteger(packageId) || packageId <= 0) {
                console.error("Invalid package ID:", pkg.id);
                continue;
            }

            if (!Number.isInteger(memberId) || memberId <= 0) {
                console.error(
                    `Invalid member ID for package ${packageId}:`,
                    pkg.u_id
                );
                continue;
            }

            if (compareAmounts(packageAmount, "0") <= 0) {
                console.log(
                    `Skipping package ${packageId}: package amount is zero.`
                );
                continue;
            }

            if (compareAmounts(roiPercentage, "0") <= 0) {
                console.log(
                    `Skipping package ${packageId}: ROI percentage is zero.`
                );
                continue;
            }


            /*
             * Verify that the member exists.
             *
             * Old-project fields are intentionally not used:
             *
             * - limit_pending
             * - re_top_up_status
             * - task_status
             * - real_sponsor_id
             * - package_choose
             */
            const [members] = await connection.execute(
                `
                SELECT
                    id,
                    user_id
                FROM member
                WHERE id = ?
                LIMIT 1
                `,
                [memberId]
            );

            if (!members.length) {
                console.error(
                    `Member not found for package ${packageId}: ${memberId}`
                );
                continue;
            }


            /*
             * Preserve the existing ROI calculation for now.
             *
             * We will replace this with the final EWC reward
             * calculation once the investment rule is finalized.
             */
            const roi = calculatePercentage(
                packageAmount,
                roiPercentage
            );

            if (compareAmounts(roi, "0") <= 0) {
                console.log(
                    `Skipping package ${packageId}: calculated ROI is zero.`
                );
                continue;
            }


            console.log("=================================");
            console.log("PACKAGE ROI");
            console.log("Package ID:", packageId);
            console.log("Member ID:", memberId);
            console.log("Package Amount:", packageAmount);
            console.log("ROI Percentage:", roiPercentage);
            console.log("Calculated ROI:", roi);


            /*
             * Keep package update, wallet update and transaction
             * entry atomic.
             */
            await connection.beginTransaction();

            try {
                /*
                 * Lock this package while processing.
                 *
                 * This provides additional protection against
                 * overlapping closing processes.
                 */
                const [lockedPackages] = await connection.execute(
                    `
                    SELECT
                        id,
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


                /*
                 * Check again inside the transaction that this
                 * package was not already processed today.
                 */
                if (lockedPackages[0].last_roi_date) {
                    const lastRoiDate = new Date(
                        lockedPackages[0].last_roi_date
                    );

                    const lastRoiDateString = lastRoiDate.toLocaleDateString(
                        "en-CA",
                        {
                            timeZone: "Asia/Kolkata"
                        }
                    );

                    const todayString = new Date().toLocaleDateString(
                        "en-CA",
                        {
                            timeZone: "Asia/Kolkata"
                        }
                    );

                    if (lastRoiDateString === todayString) {
                        await connection.rollback();

                        console.log(
                            `Package ${packageId} already processed today.`
                        );

                        continue;
                    }
                }


                /*
                 * Update accumulated package ROI and processing date.
                 *
                 * No limit_pending or re-top-up logic is used.
                 */
                const [packageUpdate] = await connection.execute(
                    `
                    UPDATE select_packages
                    SET
                        roi_comp = COALESCE(roi_comp, 0) + ?,
                        last_roi_date = CURDATE()
                    WHERE id = ?
                    `,
                    [
                        roi,
                        packageId
                    ]
                );

                if (packageUpdate.affectedRows <= 0) {
                    throw new Error(
                        `Failed to update package ${packageId}`
                    );
                }


                /*
                 * roi_income is the cumulative ROI entitlement.
                 *
                 * main_wallet is intentionally not credited here.
                 */
                const [walletResult] = await connection.execute(
                    `
                    UPDATE user_wallet
                    SET roi_income = COALESCE(roi_income, 0) + ?
                    WHERE user_id = ?
                    `,
                    [
                        roi,
                        memberId
                    ]
                );

                if (walletResult.affectedRows <= 0) {
                    throw new Error(
                        `user_wallet not found for member ${memberId}`
                    );
                }


                /*
                 * Record ROI/reward history.
                 *
                 * Direction 7 is preserved from the current EWC
                 * transaction mapping.
                 */
                const description = `ROI Income is ${roi}`;

                await connection.execute(
                    `
                    INSERT INTO trasections
                    (
                        credit,
                        direction,
                        user_id,
                        description
                    )
                    VALUES (?, ?, ?, ?)
                    `,
                    [
                        roi,
                        7,
                        memberId,
                        description
                    ]
                );


                await connection.commit();

                processed = true;

                console.log(
                    `Processed package ${packageId} | Member ${memberId} | ROI ${roi}`
                );

            } catch (error) {
                await connection.rollback();

                console.error(
                    `FAILED package ${packageId}, member ${memberId}:`,
                    error.message
                );

                /*
                 * One bad package should not prevent every other
                 * package from being processed.
                 */
                continue;
            }
        }

        console.log("ROI closing completed.");

    } finally {
        connection.release();
    }

    return processed;
}


/* =========================================================
 * BUILD MERKLE SNAPSHOT
 * ========================================================= */

async function buildSnapshot() {
    console.log("Building Merkle tree...");

    const connection = await pool.getConnection();

    try {
        /*
         * EWC only uses ROI/reward income here.
         *
         * level_com has been completely removed.
         */
        const [rows] = await connection.execute(`
            SELECT
                uw.user_id,
                m.trx,
                uw.roi_income
            FROM user_wallet uw
            INNER JOIN member m
                ON m.id = uw.user_id
            WHERE m.trx IS NOT NULL
              AND m.trx != ''
              AND uw.roi_income > 0
        `);

        if (!rows.length) {
            throw new Error(
                "No users with cumulative ROI income."
            );
        }

        const users = [];
        const leaves = [];

        for (const row of rows) {
            const wallet = normalizeAddress(row.trx);

            /*
             * Only valid EVM wallet addresses can be included
             * in the Merkle tree.
             */
            if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
                console.error(
                    `Invalid wallet for user ${row.user_id}: ${row.trx}`
                );
                continue;
            }


            /*
             * roi_income is already cumulative.
             *
             * Since this project has no level income:
             *
             * cumulative_amount = roi_income
             */
            const cumulativeAmount = String(
                row.roi_income ?? "0"
            );

            if (compareAmounts(cumulativeAmount, "0") <= 0) {
                continue;
            }


            /*
             * Convert cumulative token amount into 18-decimal
             * integer form before creating the Merkle leaf.
             */
            const amountWei = decimalToScaledBigInt(
                cumulativeAmount,
                18
            );

            const leaf = createLeaf(
                wallet,
                amountWei
            );

            const index = leaves.length;

            leaves.push(leaf);

            users.push({
                index,
                user_id: Number(row.user_id),
                wallet,
                roi_income: cumulativeAmount,
                cumulative_amount: cumulativeAmount,
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


        /*
         * Build Merkle tree.
         */
        const levels = buildMerkleTree(
            leaves
        );

        if (!levels.length) {
            throw new Error(
                "Failed to build Merkle tree."
            );
        }

        const root = levels[
            levels.length - 1
        ][0];

        if (!root) {
            throw new Error(
                "Merkle root was not generated."
            );
        }

        console.log(
            "Merkle Root:",
            root
        );


        /*
         * Generate proof for every user.
         */
        for (const user of users) {
            user.proof = getMerkleProof(
                levels,
                user.index
            );
        }


        /*
         * Generate snapshot ID.
         */
        const now = new Date();

        const snapshotId = now
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\..+/, "")
            .replace("T", "_");


        /*
         * Ensure snapshot directory exists.
         */
        const directory = path.resolve(
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


        /*
         * Save snapshot JSON.
         */
        const snapshotFile = path.join(
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
    const directory = path.resolve(
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

    const latestFile = path.join(
        directory,
        "latest.json"
    );

    const latestData = {
        snapshot_id: snapshot.snapshotId,
        root: published.root,
        tx_hash: published.txHash,
        block_number: published.blockNumber,
        created_at: new Date().toISOString()
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
    const today = new Date().toLocaleDateString(
        "en-CA",
        {
            timeZone: "Asia/Kolkata"
        }
    );

    try {
        /*
         * Get today's closing run.
         */
        let [rows] = await pool.execute(
            `
            SELECT *
            FROM closing_runs
            WHERE run_date = ?
            `,
            [today]
        );


        /*
         * Create today's closing run if it does not exist.
         */
        if (!rows.length) {
            await pool.execute(
                `
                INSERT INTO closing_runs (run_date)
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
         * STAGE 1: ROI DISTRIBUTION
         * ================================================= */

        if (run.roi_status !== "done") {
            const processed = await processClosing();

            if (!processed) {
                console.log(
                    "No new ROI processed. Skipping Merkle snapshot."
                );
                return;
            }

            await pool.execute(
                `
                UPDATE closing_runs
                SET roi_status = 'done'
                WHERE run_date = ?
                `,
                [today]
            );

            run.roi_status = "done";

        } else {
            console.log(
                "ROI already distributed today, skipping."
            );
        }


        /* =================================================
         * STAGE 2: MERKLE SNAPSHOT
         * ================================================= */

        let snapshot;

        if (run.snapshot_status !== "done") {
            snapshot = await buildSnapshot();

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
            run.snapshot_id = snapshot.snapshotId;
            run.merkle_root = snapshot.root;

        } else {
            console.log(
                "Snapshot already built today, reusing:",
                run.merkle_root
            );

            snapshot = {
                snapshotId: run.snapshot_id,
                root: run.merkle_root
            };
        }


        /* =================================================
         * STAGE 3: PUBLISH MERKLE ROOT
         * ================================================= */

        if (run.publish_status !== "done") {
            const published = await publishMerkleRootWithRetry(
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
            run.tx_hash = published.txHash;

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
            "DAILY CLOSING FAILED (safe to retry, will resume from last completed stage):",
            error
        );

        throw error;

    } finally {
        /*
         * Keep this only if dailyClosing.js runs as a standalone
         * process/cron.
         *
         * If dailyClosing() is called from the long-running Express
         * application, pool.end() must NOT run here because it closes
         * the application's MySQL pool.
         */
        await pool.end();
    }
}


module.exports = {
    dailyClosing
};