
import { createWeb3Modal } from '@web3modal/wagmi/react'
import { createConfig, http } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'

// =========================================================
// BSC MAINNET - EWC
// =========================================================

export const bscMainnet = defineChain({
  id: 56,
  name: 'BNB Smart Chain Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: {
      http: ['https://bsc-dataseed.binance.org'],
    },
    public: {
      http: ['https://bsc-dataseed.binance.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BscScan',
      url: 'https://bscscan.com',
    },
  },
  testnet: false,
})

// =========================================================
// WALLETCONNECT - EWC
// =========================================================

const projectId =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID ||
  '54b039af03e2ba235845ce4ddffeb618'

const metadata = {
  name: 'EWC',
  description: 'EWC Presale',
  url: 'https://ewctoken.com',
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
