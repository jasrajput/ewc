import { useReadContract, useWriteContract } from "wagmi";
import { STAKING_ADDRESS, TOKEN_ADDRESS, TOKEN_ABI, USDT_ADDRESS } from "../contracts/config";

// ── READ: USDT balance
export const useUSDTBalance = (address) => {
  return useReadContract({
    address: USDT_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
};

// ── READ: EWC balance
export const useEWCBalance = (address) => {
  return useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
};

// ── READ: EWC allowance
export const useTokenAllowance = (ownerAddress) => {
  return useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "allowance",
    args: ownerAddress ? [ownerAddress, STAKING_ADDRESS] : undefined,
    query: { enabled: !!ownerAddress },
  });
};

// ── READ: USDT allowance
export const useUSDTAllowance = (ownerAddress) => {
  return useReadContract({
    address: USDT_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "allowance",
    args: ownerAddress ? [ownerAddress, STAKING_ADDRESS] : undefined,
    query: { enabled: !!ownerAddress },
  });
};

// ── WRITE
export const useContractWrite = () => {
  const contract = useWriteContract();

  return {
    ...contract,
    writeContract: contract.mutateAsync,
  };
};