import { createWeb3Modal } from '@web3modal/wagmi/react'
import { createConfig, http } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'

// =========================================================
// BSC MAINNET
// =========================================================

export const bscMainnet = defineChain({
  id: 97,
  name: 'Binance Smart Chain Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'tBNB',
    symbol: 'tBNB',
  },
  rpcUrls: {
    default: {
      http: ['https://bsc-testnet-dataseed.bnbchain.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BscScan',
      url: 'https://testnet.bscscan.com',
    },
  },
})

// =========================================================
// WALLETCONNECT
// =========================================================

const projectId =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID ||
  'a6df3ca820bb159b11b7d328faa24af0'

const metadata = {
  name: 'MADA GOLD COIN',
  description: 'MADA GOLD COIN',
  url: 'https://eonxb.online',
  icons: ['/logo.png'],
}

const chains = [bscMainnet]

// =========================================================
// WAGMI CONFIG
// =========================================================

export const config = createConfig({
  chains,

  connectors: [
    walletConnect({
      projectId,
      metadata,
    }),
  ],

  transports: {
    [bscMainnet.id]: http(
      bscMainnet.rpcUrls.default.http[0]
    ),
  },
})

// =========================================================
// WEB3 MODAL
// =========================================================

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  chains,
  themeMode: 'dark',
})