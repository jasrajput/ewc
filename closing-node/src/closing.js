
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

// ============================================================
// CONFIGURATION
// ============================================================

const LOCK_NAME = "ewc:daily-closing";

const ROI_START_DAY = 101;
const ROI_MONTHLY_PERCENT = 2n;
const ROI_DAYS_PER_MONTH = 30n;

// Until the EWC token exists, keep this false.
// Change to true only when EWC and its liquidity pair are ready.
const EWC_ROI_ENABLED = process.env.EWC_ROI_ENABLED === "true";

// Never publish a claimable root during the lock period.
// Requires explicit configuration after verifying the contract.
const MERKLE_PUBLICATION_ENABLED =
    process.env.MERKLE_PUBLICATION_ENABLED === "true";

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

let chain = null;

// ============================================================
// DATE AND AMOUNT HELPERS
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

function getAgeDays(createdDate, closingDate) {
    if (!createdDate) {
        throw new Error("Package creation date is missing");
    }

    const created = Date.parse(`${createdDate}T00:00:00Z`);
    const closing = Date.parse(`${closingDate}T00:00:00Z`);

    if (!Number.isFinite(created) || !Number.isFinite(closing)) {
        throw new Error("Invalid package date");
    }

    return Math.floor((closing - created) / 86400000);
}

function parse18(value) {
    const amount = String(value ?? "0").trim();

    if (!/^\d+(\.\d+)?$/.test(amount)) {
        throw new Error(`Invalid amount: ${amount}`);
    }

    const parsed = ethers.parseUnits(amount, 18);

    if (parsed > ethers.MaxUint256) {
        throw new Error("Amount exceeds uint256");
    }

    return parsed;
}

function format18(value) {
    return ethers.formatUnits(value, 18);
}

function normalizeAddress(value) {
    if (!ethers.isAddress(value)) {
        throw new Error(`Invalid wallet address: ${value}`);
    }

    return ethers.getAddress(value).toLowerCase();
}

function validateRoot(value) {
    if (!ethers.isHexString(value, 32)) {
        throw new Error(`Invalid Merkle root: ${value}`);
    }

    return value.toLowerCase();
}

function verifyProof(leaf, proof, root) {
    let computed = leaf;

    for (const sibling of proof) {
        const left = BigInt(computed) <= BigInt(sibling)
            ? computed
            : sibling;

        const right = BigInt(computed) <= BigInt(sibling)
            ? sibling
            : computed;

        computed = ethers.keccak256(
            ethers.concat([left, right])
        );
    }

    return computed.toLowerCase() === root.toLowerCase();
}

// ============================================================
// FILE HELPERS
// ============================================================

function ensureSnapshotDirectory() {
    fs.mkdirSync(SNAPSHOT_DIR, {
        recursive: true,
        mode: 0o700
    });
}

function readJson(file) {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, data) {
    ensureSnapshotDirectory();

    const temporary =
        `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;

    try {
        fs.writeFileSync(
            temporary,
            JSON.stringify(data, null, 2),
            { flag: "wx", mode: 0o600 }
        );

        fs.renameSync(temporary, file);

    } finally {
        if (fs.existsSync(temporary)) {
            fs.unlinkSync(temporary);
        }
    }
}

function getSnapshotFile(id) {
    if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
        throw new Error("Invalid snapshot ID");
    }

    return path.join(SNAPSHOT_DIR, `snapshot_${id}.json`);
}

function generateSnapshotId() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "_");

    return `${timestamp}_${crypto.randomBytes(4).toString("hex")}`;
}

// ============================================================
// DATABASE RUN TRACKING
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
        throw new Error(`Closing run not found: ${date}`);
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
        throw new Error("Invalid status column");
    }

    await connection.execute(
        `UPDATE closing_runs SET ${column} = ? WHERE run_date = ?`,
        [status, date]
    );
}

// ============================================================
// BLOCKCHAIN INITIALIZATION
// ============================================================

async function getChain() {
    if (!chain) {
        chain = require("./blockchain");
    }

    return chain;
}

async function verifyTokenDecimals(provider, address, label) {
    if (!address || !ethers.isAddress(address)) {
        throw new Error(`${label} address is missing or invalid`);
    }

    const code = await provider.getCode(address);

    if (code === "0x") {
        throw new Error(`${label} token contract is not deployed`);
    }

    const token = new ethers.Contract(address, TOKEN_ABI, provider);
    const decimals = Number(await token.decimals());

    if (decimals !== 18) {
        throw new Error(
            `${label} has ${decimals} decimals. ` +
            "Current closing accounting requires 18."
        );
    }

    return decimals;
}

async function verifyConfiguration() {
    if (!config.rpcUrl) {
        throw new Error("RPC_URL is missing");
    }

    if (!config.usdtAddress) {
        throw new Error("USDT_ADDRESS is missing");
    }

    if (!Number.isSafeInteger(Number(config.chainId)) ||
        Number(config.chainId) <= 0) {
        throw new Error("Invalid CHAIN_ID");
    }

    // The USDT-only closing phase does not need an EWC token.
    const provider = new ethers.JsonRpcProvider(
        config.rpcUrl,
        config.chainId
    );

    const network = await provider.getNetwork();

    if (Number(network.chainId) !== Number(config.chainId)) {
        throw new Error("Incorrect blockchain network");
    }

    await verifyTokenDecimals(
        provider,
        config.usdtAddress,
        "USDT"
    );

    if (EWC_ROI_ENABLED) {
        if (!config.ewcAddress || !config.pairAddress) {
            throw new Error(
                "EWC_ROI_ENABLED requires EWC_ADDRESS and PAIR_ADDRESS"
            );
        }

        await verifyTokenDecimals(
            provider,
            config.ewcAddress,
            "EWC"
        );
    }

    if (MERKLE_PUBLICATION_ENABLED) {
        if (!config.merkleContract) {
            throw new Error("MERKLE_CONTRACT is missing");
        }

        const { wallet, merkleContract } = await getChain();

        if (await provider.getCode(config.merkleContract) === "0x") {
            throw new Error("EWCPayout is not deployed");
        }

        const updater = await merkleContract.rootUpdater();

        if (updater.toLowerCase() !== wallet.address.toLowerCase()) {
            throw new Error("Root updater wallet is not authorized");
        }
    }

    return provider;
}

// ============================================================
// EWC PRICE FROM PANCAKESWAP
// ============================================================

async function getClosingEwcPrice(provider) {
    if (!EWC_ROI_ENABLED) {
        throw new Error("EWC ROI is not enabled");
    }

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

    if (!(
        (first === ewc && second === usdt) ||
        (first === usdt && second === ewc)
    )) {
        throw new Error("Configured pair is not EWC/USDT");
    }

    const ewcReserve =
        first === ewc ? BigInt(reserves[0]) : BigInt(reserves[1]);

    const usdtReserve =
        first === usdt ? BigInt(reserves[0]) : BigInt(reserves[1]);

    if (ewcReserve <= 0n || usdtReserve <= 0n) {
        throw new Error("Invalid EWC/USDT reserves");
    }

    const priceWei = usdtReserve * 10n ** 18n / ewcReserve;

    if (priceWei <= 0n) {
        throw new Error("EWC price is zero");
    }

    return priceWei;
}

// ============================================================
// STAGE 1: DAILY EWC ROI
// ============================================================

async function processClosing(connection, date, provider) {
    const run = await getClosingRun(connection, date);

    if (run.roi_status === "done") {
        console.log("ROI already completed for:", date);
        return { status: "already_done", processed: 0 };
    }

    // During presale, EWC token and EWC/USDT pair do not exist.
    // Mark ROI deferred, not completed.
    //
    // This is NOT a retroactive ROI accrual mechanism.
    // When enabled later, missed eligible days require
    // an explicit backfill policy.

    if (!EWC_ROI_ENABLED) {
        await setStatus(connection, date, "roi_status", "deferred");

        console.log(
            "EWC ROI deferred: EWC token has not been enabled."
        );

        return { status: "deferred", processed: 0 };
    }

    let priceWei;

    if (run.roi_price_wei) {
        priceWei = BigInt(run.roi_price_wei);

    } else {
        const fetchedPrice = await getClosingEwcPrice(provider);

        await connection.beginTransaction();

        try {
            const [[locked]] = await connection.execute(
                `SELECT roi_price_wei
                 FROM closing_runs
                 WHERE run_date = ?
                 FOR UPDATE`,
                [date]
            );

            priceWei = locked.roi_price_wei
                ? BigInt(locked.roi_price_wei)
                : fetchedPrice;

            await connection.execute(
                `UPDATE closing_runs
                 SET roi_price_wei = ?
                 WHERE run_date = ?`,
                [priceWei.toString(), date]
            );

            await connection.commit();

        } catch (error) {
            await connection.rollback();
            throw error;
        }
    }

    if (priceWei <= 0n) {
        throw new Error("Invalid persisted EWC price");
    }

    await setStatus(connection, date, "roi_status", "processing");

    console.log("Starting daily EWC ROI...");
    console.log("Date:", date);
    console.log("EWC price:", format18(priceWei));

    const [packages] = await connection.execute(
        `SELECT id
         FROM select_packages
         WHERE status = 0
           AND (last_roi_date IS NULL OR last_roi_date < ?)
         ORDER BY id`,
        [date]
    );

    let processed = 0;
    let ineligible = 0;
    let skipped = 0;
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
                `SELECT id, u_id, pack_amount,
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
                skipped++;
                continue;
            }

            const pkg = rows[0];
            const age = getAgeDays(pkg.created_date, date);

            if (age < 0) {
                throw new Error("Package creation date is in future");
            }

            // Package creation day = day 1.
            // ROI begins when age reaches 100 days.
            if (age < ROI_START_DAY - 1) {
                await connection.rollback();
                transactionOpen = false;
                ineligible++;
                continue;
            }

            if (pkg.last_date && pkg.last_date >= date) {
                await connection.rollback();
                transactionOpen = false;
                skipped++;
                continue;
            }

            const memberId = Number(pkg.u_id);

            if (!Number.isSafeInteger(memberId) || memberId <= 0) {
                throw new Error("Invalid member ID");
            }

            const investmentWei = parse18(pkg.pack_amount);

            if (investmentWei <= 0n) {
                throw new Error("Invalid package investment amount");
            }

            const roiUsdWei =
                investmentWei * ROI_MONTHLY_PERCENT /
                (100n * ROI_DAYS_PER_MONTH);

            const roiEwcWei =
                roiUsdWei * 10n ** 18n / priceWei;

            if (roiUsdWei <= 0n || roiEwcWei <= 0n) {
                throw new Error("Calculated ROI is zero");
            }

            const roiUsd = format18(roiUsdWei);
            const roiEwc = format18(roiEwcWei);

            const [packageResult] = await connection.execute(
                `UPDATE select_packages
                 SET roi_comp = COALESCE(roi_comp, 0) + ?,
                     last_roi_date = ?
                 WHERE id = ? AND status = 0`,
                [roiUsd, date, packageId]
            );

            if (packageResult.affectedRows !== 1) {
                throw new Error("Package ROI update failed");
            }

            const [walletResult] = await connection.execute(
                `UPDATE user_wallet
                 SET roi_income = COALESCE(roi_income, 0) + ?,
                     cumulative_roi_ewc = COALESCE(cumulative_roi_ewc, 0) + ?
                 WHERE user_id = ?`,
                [roiEwc, roiEwc, memberId]
            );

            if (walletResult.affectedRows !== 1) {
                throw new Error(
                    `Missing or duplicate wallet for member ${memberId}`
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

            processed++;

            console.log(
                `ROI OK | Package ${packageId} | ${roiEwc} EWC`
            );

        } catch (error) {
            if (transactionOpen) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    throw new Error(
                        `ROI rollback failed for package ${packageId}: ` +
                        rollbackError.message
                    );
                }
            }

            failures.push({
                packageId,
                error: error.message
            });

            console.error(
                `ROI FAILED | Package ${packageId}:`,
                error.message
            );
        }
    }

    if (failures.length > 0) {
        await setStatus(connection, date, "roi_status", "failed");

        throw new Error(
            `ROI incomplete: ${failures.length} package(s) failed. ` +
            JSON.stringify(failures.slice(0, 3))
        );
    }

    await setStatus(connection, date, "roi_status", "done");

    console.log("ROI completed:", {
        processed,
        ineligible,
        skipped
    });

    return {
        status: "done",
        processed,
        ineligible,
        skipped
    };
}

// ============================================================
// STAGE 2: USDT INCOME CLOSING
// ============================================================

async function closeUsdtIncome(connection, date) {
    await connection.beginTransaction();

    try {
        const [[run]] = await connection.execute(
            `SELECT usdt_status
             FROM closing_runs
             WHERE run_date = ?
             FOR UPDATE`,
            [date]
        );

        if (!run) {
            throw new Error("USDT closing run missing");
        }

        if (run.usdt_status === "done") {
            await connection.commit();

            console.log("USDT closing already completed:", date);

            return {
                status: "already_done",
                wallets: 0
            };
        }

        const [[negative]] = await connection.execute(
            `SELECT COUNT(*) AS total
             FROM user_wallet
             WHERE balance < 0`
        );

        if (Number(negative.total) > 0) {
            throw new Error(
                `${negative.total} wallets have negative balances`
            );
        }

        // Move only new USDT income.
        // Do not subtract claims from lifetime cumulative income.
        //
        // The balance update and the status update are committed
        // in the same database transaction.

        const [result] = await connection.execute(
            `UPDATE user_wallet
             SET cumulative_usdt_income =
                    COALESCE(cumulative_usdt_income, 0) +
                    COALESCE(balance, 0),
                 balance = 0
             WHERE COALESCE(balance, 0) > 0`
        );

        await connection.execute(
            `UPDATE closing_runs
             SET usdt_status = 'done'
             WHERE run_date = ?`,
            [date]
        );

        await connection.commit();

        console.log(
            "USDT closing completed. Wallets:",
            result.affectedRows
        );

        return {
            status: "done",
            wallets: result.affectedRows
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

// ============================================================
// STAGE 3: BUILD DAILY MERKLE SNAPSHOT
// ============================================================

async function buildSnapshot(connection, date) {
    const run = await getClosingRun(connection, date);

    // Reuse an existing snapshot. Never regenerate it after
    // publication has begun.
    if (run.snapshot_status === "done") {
        if (!run.snapshot_id || !run.merkle_root) {
            throw new Error(
                "Snapshot marked done without snapshot metadata"
            );
        }

        const saved = readJson(getSnapshotFile(run.snapshot_id));

        if (!saved ||
            validateRoot(saved.root) !== validateRoot(run.merkle_root)) {
            throw new Error("Stored snapshot does not match closing_runs");
        }

        console.log("Reusing existing snapshot:", run.snapshot_id);
        return saved;
    }

    await setStatus(connection, date, "snapshot_status", "processing");

    await connection.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    );

    await connection.query(
        "START TRANSACTION WITH CONSISTENT SNAPSHOT"
    );

    let transactionOpen = true;

    try {
        const [[runState]] = await connection.execute(
            `SELECT roi_status, usdt_status
             FROM closing_runs
             WHERE run_date = ?`,
            [date]
        );

        if (!runState || runState.usdt_status !== "done") {
            throw new Error("USDT closing must finish before snapshot");
        }

        if (!["done", "deferred"].includes(runState.roi_status)) {
            throw new Error(
                `ROI closing is incomplete: ${runState.roi_status}`
            );
        }

        const [rows] = await connection.execute(
            `SELECT
                uw.user_id,
                m.trx,
                COALESCE(uw.cumulative_usdt_income, 0)
                    AS cumulative_usdt_income,
                COALESCE(uw.cumulative_roi_ewc, 0)
                    AS cumulative_roi_ewc
             FROM user_wallet AS uw
             INNER JOIN member AS m ON m.id = uw.user_id
             WHERE COALESCE(uw.cumulative_usdt_income, 0) > 0
                OR COALESCE(uw.cumulative_roi_ewc, 0) > 0
             ORDER BY uw.user_id`
        );

        const users = [];
        const leaves = [];
        const walletSet = new Set();

        for (const row of rows) {
            const address = normalizeAddress(row.trx);

            if (walletSet.has(address)) {
                throw new Error(
                    `Duplicate registered wallet: ${address}`
                );
            }

            walletSet.add(address);

            const cumulativeUsdt =
                String(row.cumulative_usdt_income ?? "0");

            const cumulativeEwc =
                String(row.cumulative_roi_ewc ?? "0");

            const usdtWei = parse18(cumulativeUsdt);
            const ewcWei = parse18(cumulativeEwc);

            // EWC does not exist yet. Protect against accidentally
            // publishing nonzero EWC claims during this phase.
            if (!EWC_ROI_ENABLED && ewcWei > 0n) {
                throw new Error(
                    `Member ${row.user_id} has EWC entitlement ` +
                    "but EWC is not enabled"
                );
            }

            const leaf = createLeaf(
                address,
                usdtWei,
                ewcWei
            );

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

        // No earned income yet: record an empty daily snapshot.
        // Do not publish a zero root.
        const levels = leaves.length
            ? buildMerkleTree(leaves)
            : null;

        const root = levels
            ? validateRoot(levels[levels.length - 1][0])
            : ethers.ZeroHash.toLowerCase();

        if (levels) {
            for (const user of users) {
                user.proof = getMerkleProof(levels, user.index);

                if (!verifyProof(user.leaf, user.proof, root)) {
                    throw new Error(
                        `Invalid Merkle proof: ${user.wallet}`
                    );
                }
            }
        }

        const snapshotId = generateSnapshotId();

        const snapshot = {
            snapshot_id: snapshotId,
            closing_date: date,
            created_at: new Date().toISOString(),
            root,
            user_count: users.length,
            publication_enabled: MERKLE_PUBLICATION_ENABLED,
            users
        };

        writeJsonAtomic(
            getSnapshotFile(snapshotId),
            snapshot
        );

        await connection.execute(
            `UPDATE closing_runs
             SET snapshot_status = 'done',
                 snapshot_id = ?,
                 merkle_root = ?
             WHERE run_date = ?`,
            [snapshotId, root, date]
        );

        await connection.commit();
        transactionOpen = false;

        console.log("====================================");
        console.log("DAILY MERKLE SNAPSHOT GENERATED");
        console.log("Date:", date);
        console.log("Snapshot ID:", snapshotId);
        console.log("Users:", users.length);
        console.log("Root:", root);
        console.log("====================================");

        return snapshot;

    } catch (error) {
        if (transactionOpen) {
            await connection.rollback();
        }

        throw error;
    }
}

// ============================================================
// STAGE 4: MERKLE ROOT PUBLICATION
// ============================================================

async function getOnChainRoot() {
    const { merkleContract } = await getChain();

    return validateRoot(
        await merkleContract.merkleRoot()
    );
}

async function finalizePublication(connection, pending, receipt = null) {
    const snapshot = readJson(
        getSnapshotFile(pending.snapshot_id)
    );

    if (!snapshot ||
        validateRoot(snapshot.root) !== validateRoot(pending.root)) {
        throw new Error("Snapshot/root mismatch during publication");
    }

    if (await getOnChainRoot() !== validateRoot(pending.root)) {
        throw new Error("Merkle root is not current on-chain");
    }

    const latest = {
        snapshot_id: pending.snapshot_id,
        root: validateRoot(pending.root),
        tx_hash: pending.tx_hash || null,
        block_number: receipt
            ? Number(receipt.blockNumber)
            : pending.block_number ?? null,
        created_at: new Date().toISOString()
    };

    // The withdrawal API reads only this published snapshot.
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
        throw new Error("Could not finalize closing_runs publication");
    }

    if (fs.existsSync(PENDING_FILE)) {
        fs.unlinkSync(PENDING_FILE);
    }

    console.log("Merkle root publication finalized:", latest.root);

    return latest;
}

async function publishPreparedRoot(connection, pending) {
    const { merkleContract } = await getChain();
    const expectedRoot = validateRoot(pending.root);

    if (await getOnChainRoot() === expectedRoot) {
        return finalizePublication(connection, pending);
    }

    await merkleContract.setMerkleRoot.staticCall(expectedRoot);

    await setStatus(
        connection,
        pending.closing_date,
        "publish_status",
        "processing"
    );

    // Persist an uncertain-broadcast state before sending.
    // Never automatically resend if Node.js crashes here.
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

    console.log("Root publication transaction:", tx.hash);

    const receipt = await tx.wait(1);

    if (!receipt || receipt.status !== 1) {
        throw new Error(
            `Root publication not confirmed: ${tx.hash}`
        );
    }

    if (await getOnChainRoot() !== expectedRoot) {
        throw new Error("On-chain root verification failed");
    }

    return finalizePublication(connection, {
        ...submitted,
        stage: "confirmed",
        block_number: Number(receipt.blockNumber)
    }, receipt);
}

async function recoverPendingPublication(connection) {
    const pending = readJson(PENDING_FILE);

    if (!pending) return null;

    const run = await getClosingRun(
        connection,
        pending.closing_date
    );

    if (run.snapshot_id !== pending.snapshot_id ||
        validateRoot(run.merkle_root) !== validateRoot(pending.root)) {
        throw new Error(
            "Pending publication differs from closing_runs"
        );
    }

    const currentRoot = await getOnChainRoot();

    if (currentRoot === validateRoot(pending.root)) {
        const { provider } = await getChain();

        const receipt = pending.tx_hash
            ? await provider.getTransactionReceipt(pending.tx_hash)
            : null;

        return finalizePublication(
            connection,
            pending,
            receipt
        );
    }

    if (pending.tx_hash) {
        const { provider } = await getChain();

        const receipt = await provider.getTransactionReceipt(
            pending.tx_hash
        );

        if (!receipt) {
            throw new Error(
                `Publication still uncertain: ${pending.tx_hash}`
            );
        }

        throw new Error(
            `Previous publication ${receipt.status === 0
                ? "reverted"
                : "was superseded"}. Manual reconciliation required.`
        );
    }

    if (pending.stage === "prepared") {
        return publishPreparedRoot(connection, pending);
    }

    throw new Error(
        "Publication may have been broadcast without a saved hash. " +
        "Check the root updater's transactions before retrying."
    );
}

async function publishSnapshot(connection, date, snapshot) {
    const run = await getClosingRun(connection, date);

    if (run.publish_status === "done") {
        console.log("Snapshot already published:", date);
        return { status: "already_done" };
    }

    if (validateRoot(snapshot.root) === ethers.ZeroHash.toLowerCase()) {
        console.log("Empty snapshot: no root transaction needed");
        return { status: "empty" };
    }

    const currentRoot = await getOnChainRoot();
    const latest = readJson(LATEST_FILE);

    if (latest && validateRoot(latest.root) !== currentRoot) {
        throw new Error(
            "On-chain root differs from latest.json. " +
            "Publication reconciliation required."
        );
    }

    const pending = {
        closing_date: date,
        snapshot_id: snapshot.snapshot_id,
        root: validateRoot(snapshot.root),
        stage: "prepared",
        tx_hash: null,
        created_at: new Date().toISOString()
    };

    if (currentRoot === pending.root) {
        if (!latest || validateRoot(latest.root) !== currentRoot) {
            throw new Error(
                "Root already on-chain without verified latest.json"
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
    const date = getIndiaDate();

    let lockAcquired = false;
    let currentStage = "initialization";

    try {
        const [[lock]] = await connection.query(
            "SELECT GET_LOCK(?, 0) AS acquired",
            [LOCK_NAME]
        );

        if (Number(lock.acquired) !== 1) {
            throw new Error("Another daily closing is running");
        }

        lockAcquired = true;

        await connection.query("SET time_zone = '+05:30'");

        ensureSnapshotDirectory();

        const provider = await verifyConfiguration();

        // Recover unresolved blockchain publication first.
        // No blockchain interaction when publication is disabled.
        if (MERKLE_PUBLICATION_ENABLED &&
            fs.existsSync(PENDING_FILE)) {
            currentStage = "publication_recovery";
            await recoverPendingPublication(connection);
        }

        await ensureClosingRun(connection, date);

        console.log("====================================");
        console.log("EWC DAILY CLOSING");
        console.log("Date:", date);
        console.log("EWC ROI Enabled:", EWC_ROI_ENABLED);
        console.log("Merkle Publication Enabled:", MERKLE_PUBLICATION_ENABLED);
        console.log("====================================");

        // --------------------------------------------
        // STAGE 1: ROI
        // --------------------------------------------

        currentStage = "roi";

        try {
            await processClosing(connection, date, provider);
        } catch (error) {
            await setStatus(
                connection,
                date,
                "roi_status",
                "failed"
            );

            throw error;
        }

        // --------------------------------------------
        // STAGE 2: USDT
        // --------------------------------------------

        currentStage = "usdt";

        try {
            await closeUsdtIncome(connection, date);
        } catch (error) {
            await setStatus(
                connection,
                date,
                "usdt_status",
                "failed"
            );

            throw error;
        }

        // --------------------------------------------
        // STAGE 3: DAILY SNAPSHOT
        // --------------------------------------------

        currentStage = "snapshot";

        let snapshot;

        try {
            snapshot = await buildSnapshot(connection, date);
        } catch (error) {
            await setStatus(
                connection,
                date,
                "snapshot_status",
                "failed"
            );

            throw error;
        }

        // --------------------------------------------
        // STAGE 4: ROOT PUBLICATION
        // --------------------------------------------

        currentStage = "publication";

        if (MERKLE_PUBLICATION_ENABLED) {
            try {
                await publishSnapshot(
                    connection,
                    date,
                    snapshot
                );

            } catch (error) {
                await setStatus(
                    connection,
                    date,
                    "publish_status",
                    "failed"
                );

                throw error;
            }

        } else {
            // Keep publication pending for admin visibility.
            // Do not update latest.json.
            const run = await getClosingRun(connection, date);

            if (run.publish_status !== "done") {
                await setStatus(
                    connection,
                    date,
                    "publish_status",
                    "pending"
                );
            }

            console.log(
                "On-chain publication disabled. " +
                "Daily snapshot saved for auditing only."
            );
        }

        console.log("====================================");
        console.log("EWC DAILY CLOSING COMPLETED");
        console.log("Date:", date);
        console.log("Snapshot:", snapshot.snapshot_id);
        console.log("Root:", snapshot.root);
        console.log("Published:", MERKLE_PUBLICATION_ENABLED);
        console.log("====================================");

        return {
            status: "success",
            closingDate: date,
            snapshotId: snapshot.snapshot_id,
            merkleRoot: snapshot.root,
            publicationEnabled: MERKLE_PUBLICATION_ENABLED
        };

    } catch (error) {
        console.error(
            `DAILY CLOSING FAILED AT ${currentStage}:`,
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
                console.error(
                    "Closing lock release failed:",
                    error.message
                );
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
            console.error("Closing failed:", error);
            process.exitCode = 1;

            try {
                await pool.end();
            } catch (closeError) {
                console.error(
                    "Database pool shutdown failed:",
                    closeError.message
                );
            }
        });
}
