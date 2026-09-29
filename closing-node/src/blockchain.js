const { ethers } = require("ethers");
const config = require("./config");

const abi = require("../abi/merkle.json");

const provider = new ethers.JsonRpcProvider(
    config.rpcUrl,
    config.chainId
);

const wallet = new ethers.Wallet(
    config.privateKey,
    provider
);

const merkleContract = new ethers.Contract(
    config.merkleContract,
    abi,
    wallet
);

async function publishMerkleRoot(root) {

    console.log("Publishing root...");
    console.log("Root:", root);
    console.log("Signer:", wallet.address);
    console.log("Contract:", config.merkleContract);

    const rootUpdater =
        await merkleContract.rootUpdater();

    console.log(
        "Contract rootUpdater:",
        rootUpdater
    );

    if (
        rootUpdater.toLowerCase() !==
        wallet.address.toLowerCase()
    ) {
        throw new Error(
            `Root updater mismatch.\n` +
            `Contract: ${rootUpdater}\n` +
            `Wallet: ${wallet.address}`
        );
    }

    /*
     * Test the transaction before sending.
     */
    await merkleContract.setMerkleRoot.staticCall(root);

    /*
     * Send.
     */
    const tx =
        await merkleContract.setMerkleRoot(root);

    console.log(
        "Transaction:",
        tx.hash
    );

    /*
     * Wait until mined.
     */
    const receipt =
        await tx.wait();

    console.log(
        "Confirmed in block:",
        receipt.blockNumber
    );

    if (receipt.status !== 1) {
        throw new Error(
            `Merkle root transaction failed: ${tx.hash}`
        );
    }

    /*
     * Verify actual contract state.
     */
    const onChainRoot =
        await merkleContract.merkleRoot();

    if (
        onChainRoot.toLowerCase() !==
        root.toLowerCase()
    ) {
        throw new Error(
            `Root verification failed.\n` +
            `Expected: ${root}\n` +
            `On-chain: ${onChainRoot}`
        );
    }

    console.log(
        "Merkle root successfully published."
    );

    return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        root: onChainRoot
    };
}


async function publishMerkleRootWithRetry(root, maxRetries = 3) {

    let attempt = 0;

    while (true) {

        try {

            return await publishMerkleRoot(root);

        } catch (error) {

            attempt++;

            const isTimeout =
                error?.code === "TIMEOUT" ||
                (error?.message || "").toLowerCase().includes("timeout") ||
                (error?.message || "").toLowerCase().includes("failed to detect network");

            if (isTimeout && attempt <= maxRetries) {

                console.warn(`Publish attempt ${attempt} failed (timeout), retrying in ${attempt * 3000}ms...`);
                await new Promise(r => setTimeout(r, attempt * 3000));
                continue;
            }

            throw error;
        }
    }
}

module.exports = {
    provider,
    wallet,
    merkleContract,
    publishMerkleRootWithRetry
};