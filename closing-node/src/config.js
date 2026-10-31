
require("dotenv").config();

module.exports = {
  // Blockchain
  rpcUrl: process.env.RPC_URL,
  chainId: Number(process.env.CHAIN_ID || 56),

  // Contracts
  presaleContract: process.env.EWC_PRESALE_CONTRACT,
  investmentContract: process.env.EWC_INVESTMENT_CONTRACT,
  merkleContract: process.env.MERKLE_CONTRACT,

  // Tokens and PancakeSwap pair
  usdtAddress: process.env.USDT_ADDRESS,
  ewcAddress: process.env.EWC_ADDRESS,
  pairAddress: process.env.PAIR_ADDRESS,

  // Authorized Merkle root updater
  privateKey: process.env.ROOT_UPDATER_PRIVATE_KEY,

  // Database
  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },

  // Merkle snapshots
  merkleDirectory: process.env.MERKLE_DIRECTORY || "./merkle_snapshots",
};
