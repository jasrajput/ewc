
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");

const pool = require("./db");
const config = require("./config");

const {
    createLeaf,
    buildMerkleTree,
    getMerkleProof
} = require("./merkle");

const {
    provider,
    wallet,
    merkleContract
} = require("./blockchain");

// ============================================================
// CONFIGURATION
// ============================================================

const LOCK_NAME = "ewc:daily-closing";

const ROI_START_DAY = 101;
const ROI_MONTHLY_PERCENT = 2n;
const ROI_DAYS_PER_MONTH = 30n;

const TOKEN_ABI = [
    "function decimals() view returns (uint8)"
];

const PAIR_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112,uint112,uint32)"
];

const SNAPSHOT_DIR = path.resolve(
    __dirname,
    config.merkleDirectory || "merkle_snapshots"
);

const LATEST_FILE = path.join(SNAPSHOT_DIR, "latest.json");
const PENDING_FILE = path.join(SNAPSHOT_DIR, "pending.json");

// ============================================================
// HELPERS
// ============================================================

function getIndiaDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts.map(part => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

function sqlDate(value) {
    if (!value) return null;

    if (typeof value === "string") {
        const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid SQL date: ${value}`);
    }

    return getIndiaDate(date);
}

function getAgeDays(createdDate, closingDate) {
    const created = Date.parse(`${createdDate}T00:00:00Z`);
    const closing = Date.parse(`${closingDate}T00:00:00Z`);

    if (!Number.isFinite(created) || !Number.isFinite(closing)) {
        throw new Error("Invalid ROI package date");
    }

    return Math.floor((closing - created) / 86400000);
}

function normalizeAddress(address) {
    if (!ethers.isAddress(address)) {
        throw new Error(`Invalid registered wallet: ${address}`);
    }

    return ethers.getAddress(address).toLowerCase();
}

function parse18(value) {
    const text = String(value ?? "0").trim();

    if (!/^\d+(\.\d+)?$/.test(text)) {
        throw new Error(`Invalid decimal amount: ${text}`);
    }

    const amount = ethers.parseUnits(text, 18);

    if (amount > ethers.MaxUint256) {
        throw new Error("Amount exceeds uint256");
    }

    return amount;
}

function format18(value) {
    return ethers.formatUnits(value, 18);
}

function validateRoot(value) {
    if (!ethers.isHexString(value, 32)) {
        throw new Error(`Invalid Merkle root: ${value}`);
    }

    return value.toLowerCase();
}

function ensureDirectory() {
    fs.mkdirSync(SNAPSHOT_DIR, {
        recursive: true,
        mode: 0o700
    });
}

function readJson(filename) {
    if (!fs.existsSync(filename)) return null;
    return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function writeJsonAtomic(filename, value) {
    ensureDirectory();

    const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;

    try {
        fs.writeFileSync(
            temporary,
            JSON.stringify(value, null, 2),
            { flag: "wx", mode: 0o600 }
        );

        fs.renameSync(temporary, filename);
    } finally {
        if (fs.existsSync(temporary)) {
            fs.unlinkSync(temporary);
        }
    }
}

function snapshotFile(snapshotId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(String(snapshotId))) {
        throw new Error("Invalid snapshot ID");
    }

    return path.join(SNAPSHOT_DIR, `snapshot_${snapshotId}.json`);
}

function newSnapshotId() {
    const time = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "_");

    return `${time}_${crypto.randomBytes(4).toString("hex")}`;
}

function verifyProof(leaf, proof, root) {
    let hash = leaf;

    for (const sibling of proof) {
        const left = BigInt(hash) <= BigInt(sibling) ? hash : sibling;
        const right = BigInt(hash) <= BigInt(sibling) ? sibling : hash;

        hash = ethers.keccak256(ethers.concat([left, right]));
    }

    return hash.toLowerCase() === root.toLowerCase();
}

// ============================================================
// DATABASE CLOSING RUNS
// ============================================================

async function ensureClosingRun(connection, date) {
    await connection.execute(
        "INSERT IGNORE INTO closing_runs (run_date) VALUES (?)",
        [date]
    );
}

async function getClosingRun(connection, date) {
    const [rows] = await connection.execute(
        "SELECT * FROM closing_runs WHERE run_date = ?",
        [date]
    );

    if (!rows.length) {
        throw new Error(`Closing run missing for ${date}`);
    }

    return rows[0];
}

async function setStatus(connection, date, column, status) {
    const allowed = new Set([
        "roi_status",
        "usdt_status",
        "snapshot_status",
        "publish_status"
    ]);

    if (!allowed.has(column)) {
        throw new Error("Invalid closing status column");
    }

    await connection.execute(
        `UPDATE closing_runs SET ${column} = ? WHERE run_date = ?`,
        [status, date]
    );
}

// ============================================================
// BLOCKCHAIN VERIFICATION
// ============================================================

async function verifyBlockchainConfiguration() {
    if (!config.rpcUrl) throw new Error("RPC_URL is missing");
    if (!config.merkleContract) throw new Error("MERKLE_CONTRACT is missing");
    if (!config.pairAddress) throw new Error("PAIR_ADDRESS is missing");
    if (!config.ewcAddress) throw new Error("EWC_ADDRESS is missing");
    if (!config.usdtAddress) throw new Error("USDT_ADDRESS is missing");

    const network = await provider.getNetwork();

    if (Number(network.chainId) !== Number(config.chainId)) {
        throw new Error("Incorrect blockchain network");
    }

    const contractCode = await provider.getCode(config.merkleContract);

    if (contractCode === "0x") {
        throw new Error("Merkle payout contract is not deployed");
    }

    const usdt = new ethers.Contract(config.usdtAddress, TOKEN_ABI, provider);
    const ewc = new ethers.Contract(config.ewcAddress, TOKEN_ABI, provider);

    const [updater, usdtDecimals, ewcDecimals] = await Promise.all([
        merkleContract.rootUpdater(),
        usdt.decimals(),
        ewc.decimals()
    ]);

    if (updater.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error("Root updater wallet is not authorized");
    }

    // Existing Merkle accounting uses 18-decimal amounts.
    if (Number(usdtDecimals) !== 18 || Number(ewcDecimals) !== 18) {
        throw new Error(
            `Token decimals mismatch: USDT=${usdtDecimals}, EWC=${ewcDecimals}`
        );
    }

    console.log("Blockchain configuration verified.");
}

// ============================================================
// PANCAKESWAP EWC PRICE
// ============================================================

async function getClosingEwcPrice() {
    const pair = new ethers.Contract(
        config.pairAddress,
        PAIR_ABI,
        provider
    );

    const [token0, token1, reserves] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves()
    ]);

    const first = token0.toLowerCase();
    const second = token1.toLowerCase();
    const ewc = config.ewcAddress.toLowerCase();
    const usdt = config.usdtAddress.toLowerCase();

    if (!((first === ewc && second === usdt) || (first === usdt && second === ewc))) {
        throw new Error("Configured PancakeSwap pair is not EWC/USDT");
    }

    const ewcReserve = first === ewc ? reserves[0] : reserves[1];
    const usdtReserve = first === usdt ? reserves[0] : reserves[1];

    if (ewcReserve <= 0n || usdtReserve <= 0n) {
        throw new Error("Invalid PancakeSwap reserves");
    }

    // Both tokens are verified as 18 decimals.
    const priceWei = usdtReserve * 10n ** 18n / ewcReserve;

    if (priceWei <= 0n) {
        throw new Error("Closing EWC price is zero");
    }

    return {
        priceWei,
        price: format18(priceWei)
    };
}

// ============================================================
// STAGE 1: DAILY ROI CLOSING
// ============================================================

async function processClosing(connection, closingDate) {
    const run = await getClosingRun(connection, closingDate);

    if (run.roi_status === "done") {
        console.log("ROI already completed:", closingDate);
        return { status: "already_done", processedCount: 0 };
    }

    let priceWei;

    if (run.roi_price_wei) {
        priceWei = BigInt(run.roi_price_wei);
    } else {
        const price = await getClosingEwcPrice();

        // Save the day's price once, so retries use the same value.
        await connection.beginTransaction();

        try {
            const [[lockedRun]] = await connection.execute(
                `SELECT roi_price_wei
                 FROM closing_runs
                 WHERE run_date = ?
                 FOR UPDATE`,
                [closingDate]
            );

            priceWei = lockedRun.roi_price_wei
                ? BigInt(lockedRun.roi_price_wei)
                : price.priceWei;

            await connection.execute(
                `UPDATE closing_runs
                 SET roi_price_wei = ?
                 WHERE run_date = ?`,
                [priceWei.toString(), closingDate]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    }

    if (priceWei <= 0n) {
        throw new Error("Invalid persisted ROI price");
    }

    await setStatus(connection, closingDate, "roi_status", "processing");

    console.log("====================================");
    console.log("DAILY ROI CLOSING");
    console.log("Date:", closingDate);
    console.log("EWC Price:", format18(priceWei));
    console.log("====================================");

    const [packages] = await connection.execute(
        `SELECT id
         FROM select_packages
         WHERE status = 0
           AND (last_roi_date IS NULL OR last_roi_date < ?)
         ORDER BY id`,
        [closingDate]
    );

    let processedCount = 0;
    let ineligibleCount = 0;
    let skippedCount = 0;
    const failures = [];

    for (const item of packages) {
        const packageId = Number(item.id);
        let transactionOpen = false;

        try {
            if (!Number.isSafeInteger(packageId) || packageId <= 0) {
                throw new Error("Invalid package ID");
            }

            await connection.beginTransaction();
            transactionOpen = true;

            const [rows] = await connection.execute(
                `SELECT
                    id,
                    u_id,
                    pack_amount,
                    DATE_FORMAT(created_on, '%Y-%m-%d') AS created_date,
                    DATE_FORMAT(last_roi_date, '%Y-%m-%d') AS last_date,
                    status
                 FROM select_packages
                 WHERE id = ?
                 FOR UPDATE`,
                [packageId]
            );

            if (!rows.length || Number(rows[0].status) !== 0) {
                await connection.rollback();
                transactionOpen = false;
                skippedCount++;
                continue;
            }

            const pkg = rows[0];

            const ageDays = getAgeDays(
                pkg.created_date,
                closingDate
            );

            if (ageDays < 0) {
                throw new Error("Package creation date is in the future");
            }

            // Creation day = day 1; age 100 = day 101.
            if (ageDays < ROI_START_DAY - 1) {
                await connection.rollback();
                transactionOpen = false;
                ineligibleCount++;
                continue;
            }

            if (pkg.last_date && pkg.last_date >= closingDate) {
                await connection.rollback();
                transactionOpen = false;
                skippedCount++;
                continue;
            }

            const memberId = Number(pkg.u_id);

            if (!Number.isSafeInteger(memberId) || memberId <= 0) {
                throw new Error("Invalid member ID");
            }

            const investmentWei = parse18(pkg.pack_amount);

            if (investmentWei <= 0n) {
                throw new Error("Invalid package investment");
            }

            // Monthly ROI = 2% USDT.
            // Daily ROI = 2% / 30.
            const roiUsdWei =
                investmentWei * ROI_MONTHLY_PERCENT /
                (100n * ROI_DAYS_PER_MONTH);

            // Convert the USDT value into EWC tokens.
            const roiEwcWei = roiUsdWei * 10n ** 18n / priceWei;

            if (roiUsdWei <= 0n || roiEwcWei <= 0n) {
                throw new Error("Calculated ROI is zero");
            }

            const roiUsd = format18(roiUsdWei);
            const roiEwc = format18(roiEwcWei);

            const [packageUpdate] = await connection.execute(
                `UPDATE select_packages
                 SET roi_comp = COALESCE(roi_comp, 0) + ?,
                     last_roi_date = ?
                 WHERE id = ? AND status = 0`,
                [roiUsd, closingDate, packageId]
            );

            if (packageUpdate.affectedRows !== 1) {
                throw new Error("Failed to update package ROI");
            }

            const [walletUpdate] = await connection.execute(
                `UPDATE user_wallet
                 SET roi_income = COALESCE(roi_income, 0) + ?,
                     cumulative_roi_ewc = COALESCE(cumulative_roi_ewc, 0) + ?
                 WHERE user_id = ?`,
                [roiEwc, roiEwc, memberId]
            );

            if (walletUpdate.affectedRows !== 1) {
                throw new Error(
                    `Missing or duplicate user_wallet for member ${memberId}`
                );
            }

            const description =
                `ROI Income ${roiEwc} EWC at $${format18(priceWei)}`;

            await connection.execute(
                `INSERT INTO trasections
                 (credit, direction, user_id, description)
                 VALUES (?, 7, ?, ?)`,
                [roiEwc, memberId, description]
            );

            await connection.commit();
            transactionOpen = false;

            processedCount++;

            console.log(
                `ROI SUCCESS | Package=${packageId} | ` +
                `Member=${memberId} | EWC=${roiEwc}`
            );

        } catch (error) {
            if (transactionOpen) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    throw new Error(
                        `Rollback failed for package ${packageId}: ` +
                        rollbackError.message
                    );
                }
            }

            failures.push({
                packageId,
                error: error.message
            });

            console.error(
                `ROI FAILED | Package=${packageId}:`,
                error.message
            );
        }
    }

    if (failures.length > 0) {
        await setStatus(connection, closingDate, "roi_status", "failed");

        throw new Error(
            `ROI closing incomplete: ${failures.length} package(s) failed. ` +
            JSON.stringify(failures.slice(0, 3))
        );
    }

    await setStatus(connection, closingDate, "roi_status", "done");

    console.log("ROI closing completed:", {
        processedCount,
        ineligibleCount,
        skippedCount
    });

    return {
        status: "done",
        processedCount,
        ineligibleCount,
        skippedCount,
        closingPrice: format18(priceWei)
    };
}

// ============================================================
// STAGE 2: USDT INCOME CLOSING
// ============================================================

async function closeUsdtIncome(connection, closingDate) {
    console.log("Starting USDT income closing...");

    await connection.beginTransaction();

    try {
        const [[run]] = await connection.execute(
            `SELECT usdt_status
             FROM closing_runs
             WHERE run_date = ?
             FOR UPDATE`,
            [closingDate]
        );

        if (run.usdt_status === "done") {
            await connection.commit();

            console.log("USDT closing already completed:", closingDate);

            return {
                status: "already_done",
                processedCount: 0
            };
        }

        const [[invalid]] = await connection.execute(
            `SELECT COUNT(*) AS total
             FROM user_wallet
             WHERE balance < 0`
        );

        if (Number(invalid.total) > 0) {
            throw new Error(
                `${invalid.total} user wallets have negative balances`
            );
        }

        // Atomic accounting:
        // Move pending USDT into cumulative entitlement.
        // Clear pending balance.
        const [result] = await connection.execute(
            `UPDATE user_wallet
             SET cumulative_usdt_income =
                    COALESCE(cumulative_usdt_income, 0) +
                    COALESCE(balance, 0),
                 balance = 0
             WHERE COALESCE(balance, 0) > 0`
        );

        // Both balance movement and run status commit together.
        await connection.execute(
            `UPDATE closing_runs
             SET usdt_status = 'done'
             WHERE run_date = ?`,
            [closingDate]
        );

        await connection.commit();

        console.log(
            "USDT closing completed. Wallets:",
            result.affectedRows
        );

        return {
            status: "done",
            processedCount: result.affectedRows
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

// ============================================================
// STAGE 3: BUILD MERKLE SNAPSHOT
// ============================================================

async function buildSnapshot(connection, closingDate) {
    const run = await getClosingRun(connection, closingDate);

    if (run.snapshot_status === "done") {
        if (!run.snapshot_id || !run.merkle_root) {
            throw new Error("Snapshot is marked done but metadata is missing");
        }

        const saved = readJson(snapshotFile(run.snapshot_id));

        if (!saved || validateRoot(saved.root) !== validateRoot(run.merkle_root)) {
            throw new Error("Saved snapshot does not match closing_runs");
        }

        console.log("Reusing existing snapshot:", run.snapshot_id);
        return saved;
    }

    await setStatus(connection, closingDate, "snapshot_status", "processing");

    console.log("Building Merkle snapshot...");

    // Read committed balances consistently.
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

    let transactionOpen = true;

    try {
        const [[lockedRun]] = await connection.execute(
            `SELECT roi_status, usdt_status
             FROM closing_runs
             WHERE run_date = ?`,
            [closingDate]
        );

        if (
            lockedRun.roi_status !== "done" ||
            lockedRun.usdt_status !== "done"
        ) {
            throw new Error("ROI and USDT closings must finish before snapshot");
        }

        const [rows] = await connection.execute(
            `SELECT
                uw.user_id,
                m.trx,
                COALESCE(uw.cumulative_usdt_income, 0) AS cumulative_usdt_income,
                COALESCE(uw.cumulative_roi_ewc, 0) AS cumulative_roi_ewc
             FROM user_wallet uw
             INNER JOIN member m ON m.id = uw.user_id
             WHERE
                COALESCE(uw.cumulative_usdt_income, 0) > 0
                OR COALESCE(uw.cumulative_roi_ewc, 0) > 0
             ORDER BY uw.user_id`
        );

        if (!rows.length) {
            throw new Error("No users with cumulative entitlement");
        }

        const users = [];
        const leaves = [];
        const addresses = new Set();

        for (const row of rows) {
            const address = normalizeAddress(row.trx);

            if (addresses.has(address)) {
                throw new Error(
                    `Duplicate wallet ${address}: resolve before publishing`
                );
            }

            addresses.add(address);

            const cumulativeUsdt = String(row.cumulative_usdt_income);
            const cumulativeEwc = String(row.cumulative_roi_ewc);

            const usdtWei = parse18(cumulativeUsdt);
            const ewcWei = parse18(cumulativeEwc);

            if (usdtWei === 0n && ewcWei === 0n) continue;

            const leaf = createLeaf(address, usdtWei, ewcWei);
            const index = leaves.length;

            leaves.push(leaf);

            users.push({
                index,
                user_id: Number(row.user_id),
                wallet: address,
                cumulative_usdt_income: cumulativeUsdt,
                cumulative_roi_ewc: cumulativeEwc,
                cumulative_usdt_income_wei: usdtWei.toString(),
                cumulative_roi_ewc_wei: ewcWei.toString(),
                leaf
            });
        }

        if (!leaves.length) {
            throw new Error("No valid Merkle leaves");
        }

        const levels = buildMerkleTree(leaves);
        const root = validateRoot(levels[levels.length - 1][0]);

        for (const user of users) {
            user.proof = getMerkleProof(levels, user.index);

            if (!verifyProof(user.leaf, user.proof, root)) {
                throw new Error(`Invalid proof for ${user.wallet}`);
            }
        }

        const snapshotId = newSnapshotId();

        const snapshot = {
            snapshot_id: snapshotId,
            closing_date: closingDate,
            created_at: new Date().toISOString(),
            root,
            users
        };

        // Save proofs before storing their snapshot ID in MySQL.
        writeJsonAtomic(snapshotFile(snapshotId), snapshot);

        await connection.execute(
            `UPDATE closing_runs
             SET snapshot_status = 'done',
                 snapshot_id = ?,
                 merkle_root = ?
             WHERE run_date = ?`,
            [snapshotId, root, closingDate]
        );

        await connection.commit();
        transactionOpen = false;

        console.log("Merkle snapshot generated:", {
            snapshotId,
            root,
            users: users.length
        });

        return snapshot;

    } catch (error) {
        if (transactionOpen) {
            await connection.rollback();
        }

        throw error;
    }
}

// ============================================================
// STAGE 4: PUBLISH MERKLE ROOT
// ============================================================

async function onChainRoot() {
    return validateRoot(await merkleContract.merkleRoot());
}

async function finalizePublication(connection, pending, receipt = null) {
    const snapshot = readJson(snapshotFile(pending.snapshot_id));

    if (!snapshot) {
        throw new Error("Cannot finalize: snapshot file is missing");
    }

    if (validateRoot(snapshot.root) !== validateRoot(pending.root)) {
        throw new Error("Cannot finalize: snapshot root mismatch");
    }

    if (await onChainRoot() !== validateRoot(pending.root)) {
        throw new Error("Cannot finalize: root does not match blockchain");
    }

    const latest = {
        snapshot_id: pending.snapshot_id,
        root: validateRoot(pending.root),
        tx_hash: pending.tx_hash || null,
        block_number: receipt
            ? Number(receipt.blockNumber)
            : (pending.block_number ?? null),
        created_at: new Date().toISOString()
    };

    // Only make proofs public after verifying the on-chain root.
    writeJsonAtomic(LATEST_FILE, latest);

    const [result] = await connection.execute(
        `UPDATE closing_runs
         SET publish_status = 'done',
             tx_hash = ?
         WHERE run_date = ?
           AND snapshot_id = ?
           AND merkle_root = ?`,
        [
            latest.tx_hash,
            pending.closing_date,
            pending.snapshot_id,
            pending.root
        ]
    );

    if (result.affectedRows !== 1) {
        throw new Error("Failed to finalize closing_runs publication");
    }

    if (fs.existsSync(PENDING_FILE)) {
        fs.unlinkSync(PENDING_FILE);
    }

    console.log("Root published successfully:", latest.root);

    return latest;
}

async function publishPreparedRoot(connection, pending) {
    const expectedRoot = validateRoot(pending.root);
    const currentRoot = await onChainRoot();

    if (currentRoot === expectedRoot) {
        return finalizePublication(connection, pending);
    }

    // Simulate before broadcasting.
    await merkleContract.setMerkleRoot.staticCall(expectedRoot);

    await setStatus(
        connection,
        pending.closing_date,
        "publish_status",
        "processing"
    );

    // If Node.js crashes after this state, do not blindly resend.
    const broadcasting = {
        ...pending,
        stage: "broadcasting",
        updated_at: new Date().toISOString()
    };

    writeJsonAtomic(PENDING_FILE, broadcasting);

    const tx = await merkleContract.setMerkleRoot(expectedRoot);

    const submitted = {
        ...broadcasting,
        stage: "submitted",
        tx_hash: tx.hash,
        updated_at: new Date().toISOString()
    };

    writeJsonAtomic(PENDING_FILE, submitted);

    console.log("Root transaction submitted:", tx.hash);

    const receipt = await tx.wait(1);

    if (!receipt || receipt.status !== 1) {
        throw new Error(`Root publication not confirmed: ${tx.hash}`);
    }

    if (await onChainRoot() !== expectedRoot) {
        throw new Error("On-chain Merkle root verification failed");
    }

    const confirmed = {
        ...submitted,
        stage: "confirmed",
        block_number: Number(receipt.blockNumber)
    };

    writeJsonAtomic(PENDING_FILE, confirmed);

    return finalizePublication(connection, confirmed, receipt);
}

async function recoverPendingRoot(connection) {
    const pending = readJson(PENDING_FILE);

    if (!pending) return null;

    console.log("Recovering pending publication:", pending.snapshot_id);

    const run = await getClosingRun(connection, pending.closing_date);

    if (
        run.snapshot_id !== pending.snapshot_id ||
        validateRoot(run.merkle_root) !== validateRoot(pending.root)
    ) {
        throw new Error("Pending publication does not match closing_runs");
    }

    const currentRoot = await onChainRoot();

    if (currentRoot === validateRoot(pending.root)) {
        const receipt = pending.tx_hash
            ? await provider.getTransactionReceipt(pending.tx_hash)
            : null;

        return finalizePublication(connection, pending, receipt);
    }

    if (pending.tx_hash) {
        const receipt = await provider.getTransactionReceipt(pending.tx_hash);

        if (!receipt) {
            throw new Error(
                `Root transaction ${pending.tx_hash} is not confirmed. ` +
                "Check blockchain status before retrying."
            );
        }

        if (receipt.status === 0) {
            throw new Error(
                `Root transaction reverted: ${pending.tx_hash}. ` +
                "Manual reconciliation required."
            );
        }

        throw new Error(
            "Published root has subsequently changed on-chain. " +
            "Manual reconciliation required."
        );
    }

    if (pending.stage === "prepared") {
        return publishPreparedRoot(connection, pending);
    }

    throw new Error(
        "Previous root transaction may have been broadcast without saving " +
        "its hash. Check the updater wallet transactions before retrying."
    );
}

async function publishSnapshot(connection, closingDate, snapshot) {
    const run = await getClosingRun(connection, closingDate);
    const currentRoot = await onChainRoot();
    const latest = readJson(LATEST_FILE);

    if (latest && validateRoot(latest.root) !== currentRoot) {
        throw new Error(
            "Current blockchain root does not match latest.json. " +
            "Resolve any external or interrupted publication."
        );
    }

    if (run.publish_status === "done") {
        if (validateRoot(run.merkle_root) !== currentRoot) {
            throw new Error("Recorded published root differs from blockchain");
        }

        // Repair missing latest.json from a verified daily record.
        if (!latest || latest.snapshot_id !== run.snapshot_id) {
            return finalizePublication(connection, {
                closing_date: closingDate,
                snapshot_id: run.snapshot_id,
                root: run.merkle_root,
                tx_hash: run.tx_hash
            });
        }

        console.log("Merkle root already published today.");

        return {
            status: "already_done",
            root: currentRoot,
            snapshotId: run.snapshot_id
        };
    }

    const pending = {
        closing_date: closingDate,
        snapshot_id: snapshot.snapshot_id,
        root: validateRoot(snapshot.root),
        tx_hash: null,
        stage: "prepared",
        created_at: new Date().toISOString()
    };

    // If the snapshot's root is already on-chain, no transaction
    // is needed. This can happen if balances have not changed.
    if (currentRoot === pending.root) {
        if (!latest && currentRoot !== ethers.ZeroHash.toLowerCase()) {
            throw new Error(
                "Root exists on-chain but latest.json is missing. " +
                "Verify the previous publication before continuing."
            );
        }

        writeJsonAtomic(PENDING_FILE, pending);
        return finalizePublication(connection, pending);
    }

    writeJsonAtomic(PENDING_FILE, pending);

    return publishPreparedRoot(connection, pending);
}

// ============================================================
// MAIN DAILY CLOSING
// ============================================================

async function dailyClosing() {
    const connection = await pool.getConnection();

    const today = getIndiaDate();
    let lockAcquired = false;
    let currentStage = "initialization";

    try {
        const [[lock]] = await connection.query(
            "SELECT GET_LOCK(?, 0) AS acquired",
            [LOCK_NAME]
        );

        if (Number(lock.acquired) !== 1) {
            throw new Error("Another daily closing is already running");
        }

        lockAcquired = true;

        await connection.query("SET time_zone = '+05:30'");

        ensureDirectory();
        await verifyBlockchainConfiguration();

        // Resolve a previous interrupted root publication first.
        // It may belong to an earlier closing date.
        if (fs.existsSync(PENDING_FILE)) {
            currentStage = "publication recovery";
            await recoverPendingRoot(connection);
        }

        await ensureClosingRun(connection, today);

        console.log("====================================");
        console.log("EWC DAILY CLOSING STARTED");
        console.log("Closing Date:", today);
        console.log("====================================");

        // --------------------------------------------
        // STAGE 1: ROI
        // --------------------------------------------

        currentStage = "roi";

        try {
            await processClosing(connection, today);
        } catch (error) {
            await setStatus(connection, today, "roi_status", "failed");
            throw error;
        }

        // --------------------------------------------
        // STAGE 2: USDT
        // --------------------------------------------

        currentStage = "usdt";

        try {
            await closeUsdtIncome(connection, today);
        } catch (error) {
            await setStatus(connection, today, "usdt_status", "failed");
            throw error;
        }

        // --------------------------------------------
        // STAGE 3: MERKLE SNAPSHOT
        // --------------------------------------------

        currentStage = "snapshot";

        let snapshot;

        try {
            snapshot = await buildSnapshot(connection, today);
        } catch (error) {
            await setStatus(connection, today, "snapshot_status", "failed");
            throw error;
        }

        // --------------------------------------------
        // STAGE 4: BLOCKCHAIN ROOT PUBLICATION
        // --------------------------------------------

        currentStage = "publication";

        try {
            await publishSnapshot(connection, today, snapshot);
        } catch (error) {
            await setStatus(connection, today, "publish_status", "failed");
            throw error;
        }

        console.log("====================================");
        console.log("EWC DAILY CLOSING SUCCESSFUL");
        console.log("Date:", today);
        console.log("Snapshot:", snapshot.snapshot_id);
        console.log("Root:", snapshot.root);
        console.log("====================================");

        return {
            status: "success",
            closingDate: today,
            snapshotId: snapshot.snapshot_id,
            merkleRoot: snapshot.root
        };

    } catch (error) {
        console.error(
            `DAILY CLOSING FAILED AT ${currentStage.toUpperCase()}:`,
            error
        );

        throw error;

    } finally {
        if (lockAcquired) {
            try {
                await connection.query(
                    "SELECT RELEASE_LOCK(?)",
                    [LOCK_NAME]
                );
            } catch (error) {
                console.error("Closing lock release failed:", error.message);
            }
        }

        connection.release();
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    dailyClosing
};

// ============================================================
// STANDALONE EXECUTION
// ============================================================

if (require.main === module) {
    dailyClosing()
        .then(async result => {
            console.log("Closing result:", result);
            await pool.end();
        })
        .catch(async error => {
            console.error("Closing execution failed:", error);
            process.exitCode = 1;

            try {
                await pool.end();
            } catch (closeError) {
                console.error("Pool shutdown error:", closeError);
            }
        });
}
