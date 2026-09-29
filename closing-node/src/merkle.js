const { ethers } = require("ethers");

function createLeaf(wallet, cumulativeAmount) {

    return ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [wallet, cumulativeAmount]
    );
}

function hashPair(a, b) {

    const sorted = [a, b].sort(
        (x, y) =>
            x.toLowerCase().localeCompare(
                y.toLowerCase()
            )
    );

    return ethers.keccak256(
        ethers.concat([
            sorted[0],
            sorted[1]
        ])
    );
}

function buildMerkleTree(leaves) {

    if (leaves.length === 0) {
        throw new Error(
            "Cannot build empty Merkle tree"
        );
    }

    let current = [...leaves];

    const levels = [
        current
    ];

    while (current.length > 1) {

        const next = [];

        for (
            let i = 0;
            i < current.length;
            i += 2
        ) {

            const left = current[i];

            const right =
                i + 1 < current.length
                    ? current[i + 1]
                    : left;

            next.push(
                hashPair(left, right)
            );
        }

        current = next;

        levels.push(current);
    }

    return levels;
}

function getMerkleProof(levels, leafIndex) {

    const proof = [];

    let index = leafIndex;

    for (
        let level = 0;
        level < levels.length - 1;
        level++
    ) {

        const current =
            levels[level];

        const pairIndex =
            index % 2 === 0
                ? index + 1
                : index - 1;

        if (pairIndex < current.length) {
            proof.push(
                current[pairIndex]
            );
        } else {
            proof.push(
                current[index]
            );
        }

        index =
            Math.floor(index / 2);
    }

    return proof;
}

module.exports = {
    createLeaf,
    buildMerkleTree,
    getMerkleProof
};