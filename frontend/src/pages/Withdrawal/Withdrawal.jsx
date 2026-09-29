import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useConnection,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import {
  BanknoteArrowDown,
  CircleDollarSign,
  Coins,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import {
  TOKEN_ADDRESS,
  STAKING_ADDRESS,
  TOKEN_ABI,
  STAKING_ABI as PAYOUT_ABI,
} from "../../contracts/config";
import styles from "./Withdrawal.module.css";

const BSC_CHAIN_ID = 56;
const TEN = 10n * 10n ** 18n;

const Withdrawal = () => {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  const connection = useConnection();
  const address = connection.address;
  const chainId = connection.chainId;
  const isConnected = connection.status === "connected";

  const publicClient = usePublicClient();
  const { open } = useWeb3Modal();
  const { mutateAsync: writeContract } = useWriteContract();

  const registeredWallet = info?.wallet || "";

  const walletMatches =
    !!address &&
    !!registeredWallet &&
    address.toLowerCase() === registeredWallet.toLowerCase();

  const { data: currentPriceRaw, refetch: refetchPrice } = useReadContract({
    address: STAKING_ADDRESS,
    abi: PAYOUT_ABI,
    functionName: "currentPrice",
    query: {
      enabled: !!STAKING_ADDRESS,
    },
  });

  const { data: claimedRaw, refetch: refetchClaimed } = useReadContract({
    address: STAKING_ADDRESS,
    abi: PAYOUT_ABI,
    functionName: "claimedAmount",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: tokenBalanceRaw, refetch: refetchTokenBalance } =
    useReadContract({
      address: TOKEN_ADDRESS,
      abi: TOKEN_ABI,
      functionName: "balanceOf",
      args: address ? [address] : undefined,
      query: {
        enabled: !!address,
      },
    });

  const loadWithdrawalInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/withdrawal/info");

      setInfo(response.data.data);
    } catch (err) {
      console.error("Withdrawal info error:", err);

      setError(
        err.response?.data?.message || "Unable to load withdrawal information.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWithdrawalInfo();
  }, [loadWithdrawalInfo]);

const cumulativeWei = useMemo(() => {
  try {
    if (!info?.cumulativeAmount) return 0n;

    return parseEther(String(info.cumulativeAmount));
  } catch {
    return 0n;
  }
}, [info]);

const claimedWei = useMemo(() => {
  return typeof claimedRaw === "bigint" ? claimedRaw : 0n;
}, [claimedRaw]);

  const pendingWei =
    cumulativeWei > claimedWei ? cumulativeWei - claimedWei : 0n;

  const claimableWei = (pendingWei / TEN) * TEN;
  const remainingWei = pendingWei - claimableWei;

  const pendingUsd = Number(formatEther(pendingWei));
  const claimableUsd = Number(formatEther(claimableWei));
  const claimedUsd = Number(formatEther(claimedWei));

  const currentPrice =
    currentPriceRaw !== undefined ? Number(formatEther(currentPriceRaw)) : 0;

  const tokenBalance =
    tokenBalanceRaw !== undefined ? Number(formatEther(tokenBalanceRaw)) : 0;

  const tokenEquivalent = currentPrice > 0 ? pendingUsd / currentPrice : 0;

  const formatUsd = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const shortAddress = (wallet) => {
    if (!wallet) return "Not available";

    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  const refreshChainData = async () => {
    await Promise.all([
      refetchPrice(),
      refetchClaimed(),
      refetchTokenBalance(),
    ]);
  };

  const handleClaim = async () => {
    try {
      setError("");
      setStatus("");
      setTxHash("");

      if (!isConnected) {
        open();
        return;
      }

      if (!registeredWallet) {
        throw new Error("Wallet address is not registered with this account.");
      }

      if (!walletMatches) {
        throw new Error(
          "Connected wallet does not match your registered wallet.",
        );
      }

      if (chainId !== BSC_CHAIN_ID) {
        open({ view: "Networks" });
        return;
      }

      if (!info?.merkleAvailable) {
        throw new Error(
          info?.merkleError || "No withdrawal snapshot is available.",
        );
      }

      if (!Array.isArray(info.proof)) {
        throw new Error("Invalid Merkle proof.");
      }

      if (cumulativeWei <= claimedWei) {
        throw new Error("There is nothing new to claim.");
      }

      if (pendingWei < TEN) {
        throw new Error(
          `Minimum withdrawal is $10. Your pending balance is ${formatUsd(
            pendingUsd,
          )}.`,
        );
      }

      if (claimableWei <= 0n) {
        throw new Error("There is no claimable balance.");
      }

      setClaiming(true);
      setStatus("Please approve the transaction in your wallet...");

      const hash = await writeContract({
        address: STAKING_ADDRESS,
        abi: PAYOUT_ABI,
        functionName: "claim",
        args: [cumulativeWei, info.proof],
      });

      setTxHash(hash);
      setStatus("Transaction submitted. Waiting for confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed on BNB Smart Chain.");
      }

      setStatus(
        `Claim successful. ${formatUsd(claimableUsd)} claimed${
          remainingWei > 0n
            ? `, ${formatUsd(Number(formatEther(remainingWei)))} remaining`
            : ""
        }.`,
      );

      await refreshChainData();
      await loadWithdrawalInfo();
    } catch (err) {
      console.error("Claim error:", err);

      let message = "Claim failed.";

      if (err?.code === 4001) {
        message = "Transaction rejected in wallet.";
      } else if (err?.shortMessage) {
        message = err.shortMessage;
      } else if (err?.message) {
        message = err.message;
      }

      setError(message);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <UserLayout
        title="Withdrawal"
        subtitle="Claim your available EWC rewards"
      >
        <div className={styles.loadingState}>
          Loading withdrawal information...
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Withdrawal" subtitle="Claim your available EWC rewards">
      <section className={styles.withdrawCard}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.eyebrow}>AVAILABLE REWARDS</span>

            <h2>Withdraw Earnings</h2>

            <p>
              Claim your available earnings directly to your registered wallet.
            </p>
          </div>

          <div className={styles.priceBox}>
            <span>EWC Price</span>

            <strong>
              {currentPrice > 0 ? `$${currentPrice.toFixed(4)}` : "—"}
            </strong>
          </div>
        </div>

        <div className={styles.claimHero}>
          <div className={styles.claimIcon}>
            <CircleDollarSign size={25} />
          </div>

          <div>
            <span>Available to Claim</span>

            <strong>{formatUsd(pendingUsd)}</strong>

            <small>
              {currentPrice > 0
                ? `≈ ${tokenEquivalent.toFixed(6)} EWC`
                : "EWC price unavailable"}
            </small>
          </div>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <Wallet size={18} />

            <div>
              <span>Wallet Balance</span>

              <strong>
                {isConnected
                  ? `${tokenBalance.toFixed(6)} EWC`
                  : "Connect wallet"}
              </strong>
            </div>
          </div>

          <div className={styles.stat}>
            <Coins size={18} />

            <div>
              <span>Claimed On-Chain</span>

              <strong>
                {isConnected ? formatUsd(claimedUsd) : "Connect wallet"}
              </strong>
            </div>
          </div>

          <div className={styles.stat}>
            <ShieldCheck size={18} />

            <div>
              <span>Minimum & Multiple</span>
              <strong>$10</strong>
            </div>
          </div>
        </div>

        <div className={styles.walletSection}>
          <div>
            <span>Registered Wallet</span>
            <strong>{shortAddress(registeredWallet)}</strong>
          </div>

          <div>
            <span>Connected Wallet</span>

            <strong>
              {isConnected ? shortAddress(address) : "Not connected"}
            </strong>
          </div>
        </div>

        {isConnected && !walletMatches && (
          <div className={styles.warningBox}>
            Connected wallet does not match the wallet registered with this
            account.
          </div>
        )}

        {info?.merkleError && (
          <div className={styles.warningBox}>{info.merkleError}</div>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}

        {status && (
          <div className={styles.statusBox}>
            {status}

            {txHash && (
              <>
                {" "}
                <a
                  href={`https://bscscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              </>
            )}
          </div>
        )}

        <button
          className={styles.claimButton}
          onClick={handleClaim}
          disabled={
            claiming ||
            (isConnected &&
              (!walletMatches || !info?.merkleAvailable || claimableWei <= 0n))
          }
        >
          <BanknoteArrowDown size={18} />

          {claiming
            ? "Processing..."
            : !isConnected
              ? "Connect Wallet & Claim"
              : claimableWei > 0n
                ? `Claim ${formatUsd(claimableUsd)}`
                : "Nothing to Claim"}
        </button>

        <p className={styles.claimNote}>
          Minimum withdrawal is $10. Claims are processed in multiples of $10.
        </p>
      </section>
    </UserLayout>
  );
};

export default Withdrawal;
