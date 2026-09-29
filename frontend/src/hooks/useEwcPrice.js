import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { TOKEN_ADDRESS as EWC_ADDRESS, PAIR_ADDRESS } from '../contracts/config';

const PAIR_ABI = [
  {
    name: 'getReserves',
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view', type: 'function', inputs: [],
  },
  {
    name: 'token0',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view', type: 'function', inputs: [],
  },
];

export const useIexPrice = () => {
  const [price, setPrice] = useState(null);
  const publicClient = usePublicClient();

  useEffect(() => {
    const fetch = async () => {
      try {
        const [reserves, token0] = await Promise.all([
          publicClient.readContract({ address: PAIR_ADDRESS, abi: PAIR_ABI, functionName: 'getReserves' }),
          publicClient.readContract({ address: PAIR_ADDRESS, abi: PAIR_ABI, functionName: 'token0'      }),
        ]);
        const isWeglToken0 = token0.toLowerCase() === EWC_ADDRESS.toLowerCase();
        const weglRes  = parseFloat(formatUnits(isWeglToken0 ? reserves[0] : reserves[1], 18));
        const usdtRes  = parseFloat(formatUnits(isWeglToken0 ? reserves[1] : reserves[0], 18));
        if (weglRes > 0) setPrice(usdtRes / weglRes);
      } catch (e) { console.error('IEX price error', e); }
    };
    fetch();
    const t = setInterval(fetch, 15000);
    return () => clearInterval(t);
  }, [publicClient]);

  return price;
};
