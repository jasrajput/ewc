require("dotenv").config();

module.exports = {
    rpcUrl: process.env.RPC_URL,
    chainId: Number(process.env.CHAIN_ID),

    privateKey: process.env.ROOT_UPDATER_PRIVATE_KEY,
    merkleContract: process.env.MERKLE_CONTRACT,

    database: {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    },

    merkleDirectory:
        process.env.MERKLE_DIRECTORY || "./merkle_snapshots"
};