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


function normalizeAddress(address) {

    return String(address)
        .trim()
        .toLowerCase();
}


/*
 * Database DECIMAL calculations are done
 * using strings / BigInt wherever possible.
 *
 * Your existing DB uses decimal monetary values.
 */
function decimalToScaledBigInt(value, decimals = 18) {

    const str = String(value);

    const parts = str.split(".");

    let whole = parts[0] || "0";

    let fraction =
        parts[1] || "";

    fraction =
        fraction
            .padEnd(decimals, "0")
            .slice(0, decimals);

    return (
        BigInt(whole) *
        (10n ** BigInt(decimals))
        +
        BigInt(fraction || "0")
    );
}


function scaledBigIntToDecimal(
    value,
    decimals = 18
) {

    const negative =
        value < 0n;

    if (negative) {
        value = -value;
    }

    const base =
        10n ** BigInt(decimals);

    const whole =
        value / base;

    const fraction =
        value % base;

    let fractionString =
        fraction
            .toString()
            .padStart(decimals, "0");

    fractionString =
        fractionString.replace(
            /0+$/,
            ""
        );

    const result =
        fractionString.length
            ? `${whole}.${fractionString}`
            : `${whole}`;

    return negative
        ? `-${result}`
        : result;
}


/*
 * amount * percentage / 100
 *
 * Database values are treated as 18-decimal values.
 */
function percentageToScaledInt(value) {
    const str = String(value).trim();

    if (!str) return 0n;

    const [wholePart, decimalPart = ""] = str.split(".");

    const whole = BigInt(wholePart || "0");

    // Keep maximum 2 decimal places
    const decimals = (decimalPart + "00").slice(0, 2);

    return (whole * 100n) + BigInt(decimals);
}
function calculatePercentage(amount, percentage) {

    const amount18 =
        decimalToScaledBigInt(
            amount,
            18
        );

    const percentageScaled =
        percentageToScaledInt(
            percentage
        );

    const result =
        (amount18 * percentageScaled) /
        10000n;

    return scaledBigIntToDecimal(
        result,
        18
    );
}

/*
 * amount1 + amount2
 */
function addAmounts(
    amount1,
    amount2
) {

    const a =
        decimalToScaledBigInt(
            amount1,
            18
        );

    const b =
        decimalToScaledBigInt(
            amount2,
            18
        );

    return scaledBigIntToDecimal(
        a + b,
        18
    );
}


/*
 * Compare decimal values.
 */
function compareAmounts(
    amount1,
    amount2
) {

    const a =
        decimalToScaledBigInt(
            amount1,
            18
        );

    const b =
        decimalToScaledBigInt(
            amount2,
            18
        );

    if (a > b) return 1;
    if (a < b) return -1;

    return 0;
}


async function getGrowthDirectCount(connection, refUserId) {
    const [rows] = await connection.execute(
        `SELECT COUNT(id) AS total_direct
         FROM member
         WHERE real_sponsor_id = ?
         AND package_choose != 1`,
        [refUserId]
    );

    return Number(rows[0].total_direct);
}


/* =========================================================
 * PROCESS DAILY CLOSING
 * ========================================================= */

async function processClosing() {

    let processed = false;

    console.log(
        "Starting daily closing..."
    );


    const connection =
        await pool.getConnection();


    try {

        /*
         * Get active packages.
         */
        const [packages] =
            await connection.execute(`
                SELECT id, u_id, pack_amount, roi_per
                FROM select_packages
                WHERE status = 0
                AND (last_roi_date IS NULL OR last_roi_date < CURDATE())`);


        console.log(
            "Packages found:",
            packages.length
        );


        /*
         * Process each package.
         */
        for (const pkg of packages) {

            const t_id =
                pkg.id;

            const u_id =
                pkg.u_id;

            const package_amount =
                String(pkg.pack_amount);

            const roi_per =
                Number(pkg.roi_per);

            /*
             * Get member.
             */
            const [members] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        package_choose,
                        package_amount,
                        real_sponsor_id,
                        re_top_up_status,
                        limit_pending,
                        task_status
                    FROM member
                    WHERE id = ?
                    `,
                    [u_id]
                );


            if (!members.length) {

                console.log(
                    `Member not found: ${u_id}`
                );

                continue;
            }


            const member = members[0];


            const commSponsorId = member.real_sponsor_id;
            const userSelfId = member.user_id;


            const packageChoose =
                Number(
                    member.package_choose
                );


            const reTopUpStatus =
                Number(
                    member.re_top_up_status
                );


            const taskStatus =
                Number(
                    member.task_status
                );


            let limitPending =
                String(
                    member.limit_pending
                );


            /*
             * Same eligibility logic as PHP.
             */
            if (roi_per <= 0) {
                continue;
            }


            if (reTopUpStatus !== 0) {
                continue;
            }


            /*
             * ROI.
             */

            console.log("=================================");
            console.log("PACKAGE DEBUG");
            console.log("Package ID:", t_id);
            console.log("User ID:", u_id);
            console.log("Package Amount:", package_amount);
            console.log("roi_per:", roi_per);

            let roi =
                calculatePercentage(
                    package_amount,
                    roi_per
                );


         

            /*
             * Apply limit_pending.
             */
            if (
                compareAmounts(
                    roi,
                    limitPending
                ) > 0
            ) {

                roi =
                    limitPending;


                await connection.execute(
                    `
                    UPDATE member
                    SET re_top_up_status = 1
                    WHERE id = ?
                    `,
                    [u_id]
                );
            }


            if (
                compareAmounts(
                    roi,
                    "0"
                ) <= 0
            ) {

                continue;
            }


            /*
             * =========================================
             * START DB TRANSACTION
             * =========================================
             */
            await connection.beginTransaction();


            try {

                /*
                 * Reduce limit_pending.
                 */
                await connection.execute(
                    `
                    UPDATE member
                    SET limit_pending =
                        limit_pending - ?
                    WHERE id = ?
                    `,
                    [
                        roi,
                        u_id
                    ]
                );


                /*
                 * Update package ROI completion.
                 */
                await connection.execute(
                    `
                    UPDATE select_packages
                    SET roi_comp =
                        roi_comp + ?,
                        last_roi_date = CURDATE()
                    WHERE id = ?
                    `,
                    [
                        roi,
                        t_id
                    ]
                );


                /*
                 * Update cumulative ROI.
                 *
                 * IMPORTANT:
                 *
                 * We do NOT increase main_wallet.
                 */
                const [
                    walletResult
                ] =
                    await connection.execute(
                        `
                        UPDATE user_wallet
                        SET roi_income =
                            roi_income + ?
                        WHERE user_id = ?
                        `,
                        [
                            roi,
                            u_id
                        ]
                    );


                if (
                    walletResult.affectedRows <= 0
                ) {

                    throw new Error(
                        `user_wallet not found for user ${u_id}`
                    );
                }


                /*
                 * ROI transaction.
                 */
                const description =
                    `ROI Income is $${roi}`;


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
                        u_id,
                        description
                    ]
                );

                /*
                 * Commit this package.
                 */
                await connection.commit();

                processed = true;



                console.log(
                    `Processed package ${t_id} | User ${u_id} | ROI $${roi}`
                );

            } catch (error) {

                await connection.rollback();


                console.error(
                    `FAILED package ${t_id}, user ${u_id}:`,
                    error.message
                );


                /*
                 * Continue with next package.
                 */
                continue;
            }
        }

        console.log(
            "Income closing completed."
        );

    } finally {

        connection.release();
    }

    return processed;

}


/* =========================================================
 * BUILD MERKLE SNAPSHOT
 * ========================================================= */

async function buildSnapshot() {

    console.log(
        "Building Merkle tree..."
    );


    const connection =
        await pool.getConnection();


    try {

        const [
            rows
        ] =
            await connection.execute(
                `
               SELECT
                uw.user_id,
                m.trx,
                uw.roi_income
            FROM user_wallet uw
            INNER JOIN member m
                ON m.id = uw.user_id
            WHERE
                m.trx IS NOT NULL
                AND m.trx != ''
                AND uw.roi_income > 0
                `
            );


        if (!rows.length) {

            throw new Error(
                "No users with cumulative income."
            );
        }


        const users = [];
        const leaves = [];


        for (const row of rows) {

            const wallet =
                normalizeAddress(
                    row.trx
                );


            if (
                !/^0x[a-f0-9]{40}$/.test(wallet)
            ) {

                console.error(
                    `Invalid wallet for user ${row.user_id}: ${row.trx}`
                );

                continue;
            }


            /*
             * cumulativeAmount =
             *
             * roi_income +
             * level_com
             */
            const cumulativeAmount =
                addAmounts(
                    row.roi_income,
                    row.level_com
                );


            if (
                compareAmounts(
                    cumulativeAmount,
                    "0"
                ) <= 0
            ) {

                continue;
            }


            /*
             * Create leaf.
             */
            const leaf =
                createLeaf(
                    wallet,
                    decimalToScaledBigInt(
                        cumulativeAmount,
                        18
                    )
                );


            const index =
                leaves.length;


            leaves.push(leaf);


            users.push({
    index,

    user_id:
        Number(row.user_id),

    wallet,

    roi_income:
        String(row.roi_income),

    cumulative_amount:
        cumulativeAmount,

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
         * Build tree.
         */
        const levels =
            buildMerkleTree(
                leaves
            );


        const root =
            levels[
            levels.length - 1
            ][0];


        console.log(
            "Merkle Root:",
            root
        );


        /*
         * Proofs.
         */
        for (const user of users) {

            user.proof =
                getMerkleProof(
                    levels,
                    user.index
                );
        }


        /*
         * Snapshot ID.
         */
        const now =
            new Date();


        const snapshotId =
            now
                .toISOString()
                .replace(
                    /[-:]/g,
                    ""
                )
                .replace(
                    /\..+/,
                    ""
                )
                .replace(
                    "T",
                    "_"
                );


        /*
         * Make directory.
         */
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


        /*
         * Save snapshot.
         */
        const snapshotFile =
            path.join(
                directory,
                `snapshot_${snapshotId}.json`
            );


        const snapshotData = {

            snapshot_id:
                snapshotId,

            created_at:
                now.toISOString(),

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
 * MAIN
 * ========================================================= */

function writeLatestFile(snapshot, published) {

    const latestFile =
        path.join(
            path.resolve(config.merkleDirectory),
            "latest.json"
        );

    fs.writeFileSync(
        latestFile,
        JSON.stringify(
            {
                snapshot_id: snapshot.snapshotId,
                root: published.root,
                tx_hash: published.txHash,
                block_number: published.blockNumber,
                created_at: new Date().toISOString()
            },
            null,
            2
        )
    );

    console.log("latest.json updated:", latestFile);
}

async function dailyClosing() {

    // const today = new Date().toISOString().slice(0, 10);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    try {

        let [rows] = await pool.execute(
            `SELECT * FROM closing_runs WHERE run_date = ?`,
            [today]
        );

        if (!rows.length) {

            await pool.execute(
                `INSERT INTO closing_runs (run_date) VALUES (?)`,
                [today]
            );

            [rows] = await pool.execute(
                `SELECT * FROM closing_runs WHERE run_date = ?`,
                [today]
            );
        }

        let run = rows[0];

        /*
         * STAGE 1: ROI distribution.
         * Skips entirely if already done today —
         * this is what actually prevents double-crediting,
         * not a per-package flag.
         */
        if (run.roi_status !== "done") {

            const processed = await processClosing();

            if (!processed) {
                console.log("No new ROI processed. Skipping Merkle snapshot.");
                return;
            }

            await pool.execute(
                `UPDATE closing_runs SET roi_status = 'done' WHERE run_date = ?`,
                [today]
            );

        } else {

            console.log("ROI already distributed today, skipping.");
        }

        /*
         * STAGE 2: Build Merkle snapshot.
         * Only runs if not already built. If it was built
         * but publish failed, we reuse the SAME root instead
         * of rebuilding (rebuilding could produce a different
         * root if run again after stage 1 already completed,
         * which is fine, but we want ONE root per day, not one
         * per retry).
         */
        let snapshot;

        if (run.snapshot_status !== "done") {

            snapshot = await buildSnapshot();

            await pool.execute(
                `UPDATE closing_runs
                 SET snapshot_status = 'done', snapshot_id = ?, merkle_root = ?
                 WHERE run_date = ?`,
                [snapshot.snapshotId, snapshot.root, today]
            );

        } else {

            console.log("Snapshot already built today, reusing:", run.merkle_root);

            snapshot = {
                snapshotId: run.snapshot_id,
                root: run.merkle_root
            };
        }

        /*
         * STAGE 3: Publish root on-chain.
         * This is the ONLY stage that retries on timeout,
         * and it retries the SAME root, not a rebuilt one.
         */
        if (run.publish_status !== "done") {

            const published = await publishMerkleRootWithRetry(snapshot.root);

            await pool.execute(
                `UPDATE closing_runs
                 SET publish_status = 'done', tx_hash = ?
                 WHERE run_date = ?`,
                [published.txHash, today]
            );

            writeLatestFile(snapshot, published);

        } else {

            console.log("Root already published today:", run.tx_hash);
        }

        console.log("DAILY CLOSING SUCCESS");

    } catch (error) {

        console.error("DAILY CLOSING FAILED (safe to retry, will resume from last completed stage):", error);
        throw error;

    } finally {

        await pool.end();
    }
}


module.exports = {
    dailyClosing
};