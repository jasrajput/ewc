
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import {
  EWC_PAYOUT_ADDRESS,
  EWC_PAYOUT_ABI,
  USDT_ADDRESS,
  TOKEN_ADDRESS as EWC_ADDRESS,
} from "../../contracts/config";

import styles from "./Withdrawal.module.css";

const BSC_CHAIN_ID = 97;

const TOKEN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
];

const formatAmount = (value, maxDecimals = 4) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0.00";

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
};

const formatUsd = (value) => `$${formatAmount(value, 2)}`;

const shortAddress = (value) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not available";

const parseAmount = (value, decimals) => {
  try {
    return parseUnits(String(value ?? "0"), decimals);
  } catch {
    return 0n;
  }
};

const Withdrawal = () => {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  const [usdtBalance, setUsdtBalance] = useState("0");
  const [ewcBalance, setEwcBalance] = useState("0");
  const [usdtDecimals, setUsdtDecimals] = useState(null);
  const [ewcDecimals, setEwcDecimals] = useState(null);

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

  const loadWithdrawalInfo = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);

      const response = await api.get("/withdrawal/info");
      if (!response.data?.success || !response.data?.data) {
        throw new Error("Invalid withdrawal information response.");
      }

      setInfo(response.data.data);
      setError("");
    } catch (err) {
      console.error("Withdrawal info error:", err);
      setError(err.response?.data?.message || err.message || "Unable to load withdrawal information.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const loadWalletBalances = useCallback(async () => {
    if (!isConnected || !address || !publicClient) {
      setUsdtBalance("0");
      setEwcBalance("0");
      return;
    }

    try {
      setBalanceLoading(true);

      const [usdtDec, ewcDec] = await Promise.all([
        publicClient.readContract({
          address: USDT_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: EWC_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "decimals",
        }),
      ]);

      const [rawUsdt, rawEwc] = await Promise.all([
        publicClient.readContract({
          address: USDT_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.readContract({
          address: EWC_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);

      setUsdtDecimals(Number(usdtDec));
      setEwcDecimals(Number(ewcDec));
      setUsdtBalance(formatUnits(rawUsdt, Number(usdtDec)));
      setEwcBalance(formatUnits(rawEwc, Number(ewcDec)));
    } catch (err) {
      console.error("Wallet balance error:", err);
      setError("Unable to read wallet token balances.");
    } finally {
      setBalanceLoading(false);
    }
  }, [isConnected, address, publicClient]);

  useEffect(() => {
    loadWithdrawalInfo(true);
  }, [loadWithdrawalInfo]);

  useEffect(() => {
    loadWalletBalances();
  }, [loadWalletBalances]);

  const amounts = useMemo(() => {
    if (usdtDecimals === null || ewcDecimals === null) return null;

    const cumulativeUsdt = parseAmount(info?.cumulativeUsdtIncome, usdtDecimals);
    const cumulativeEwc = parseAmount(info?.cumulativeRoiEwc, ewcDecimals);
    const claimedUsdt = parseAmount(info?.usdtClaimed, usdtDecimals);
    const claimedEwc = parseAmount(info?.roiEwcClaimed, ewcDecimals);

    const claimableUsdt = cumulativeUsdt > claimedUsdt ? cumulativeUsdt - claimedUsdt : 0n;
    const claimableEwc = cumulativeEwc > claimedEwc ? cumulativeEwc - claimedEwc : 0n;

    return {
      cumulativeUsdt,
      cumulativeEwc,
      claimableUsdt,
      claimableEwc,
      claimedUsdt,
      claimedEwc,
      hasClaimable: claimableUsdt > 0n || claimableEwc > 0n,
      claimableUsdtDisplay: formatUnits(claimableUsdt, usdtDecimals),
      claimableEwcDisplay: formatUnits(claimableEwc, ewcDecimals),
      claimedUsdtDisplay: formatUnits(claimedUsdt, usdtDecimals),
      claimedEwcDisplay: formatUnits(claimedEwc, ewcDecimals),
    };
  }, [info, usdtDecimals, ewcDecimals]);

  const incomeBalance = info?.incomeBalance;
  const hasIncomeBalance = incomeBalance !== undefined && incomeBalance !== null;

  const proofAvailable =
    info?.merkleAvailable === true &&
    Array.isArray(info?.proof) &&
    amounts?.hasClaimable === true;

  const canClaim =
    isConnected &&
    walletMatches &&
    chainId === BSC_CHAIN_ID &&
    proofAvailable &&
    !claiming &&
    !loading &&
    !balanceLoading;

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWithdrawalInfo(), loadWalletBalances()]);
    setRefreshing(false);
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

      if (!walletMatches) {
        throw new Error("Connected wallet does not match your registered wallet.");
      }

      if (chainId !== BSC_CHAIN_ID) {
        open({ view: "Networks" });
        return;
      }

      if (!amounts || usdtDecimals === null || ewcDecimals === null) {
        throw new Error("Token information is still loading.");
      }

      if (!proofAvailable) {
        throw new Error(info?.merkleError || "No earnings are currently authorized for claiming.");
      }

      setClaiming(true);
      setStatus("Please approve the transaction in your wallet.");

      // Read the current published root to avoid submitting a stale proof.
      const currentRoot = await publicClient.readContract({
        address: EWC_PAYOUT_ADDRESS,
        abi: EWC_PAYOUT_ABI,
        functionName: "merkleRoot",
      });

      if (!info?.merkleRoot || currentRoot.toLowerCase() !== info.merkleRoot.toLowerCase()) {
        throw new Error("The payout snapshot has changed. Refresh and try again.");
      }

      const hash = await writeContract({
        address: EWC_PAYOUT_ADDRESS,
        abi: EWC_PAYOUT_ABI,
        functionName: "claim",
        args: [amounts.cumulativeUsdt, amounts.cumulativeEwc, info.proof],
        chainId: BSC_CHAIN_ID,
      });

      setTxHash(hash);
      setStatus("Transaction submitted. Waiting for blockchain confirmation.");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Claim transaction failed on BNB Smart Chain.");
      }

      setStatus("Claim successful. Your tokens have been transferred to your wallet.");

      await Promise.all([loadWithdrawalInfo(), loadWalletBalances()]);
    } catch (err) {
      console.error("Claim error:", err);

      if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
        setError("Transaction rejected in wallet.");
      } else {
        setError(err?.shortMessage || err?.message || "Claim failed.");
      }
    } finally {
      setClaiming(false);
    }
  };

  const getClaimButtonLabel = () => {
    if (claiming) return "Processing Claim...";
    if (!isConnected) return "Connect Wallet";
    if (!walletMatches) return "Wallet Mismatch";
    if (chainId !== BSC_CHAIN_ID) return "Switch to BNB Smart Chain";
    if (balanceLoading || !amounts) return "Loading Token Information...";
    if (!amounts.hasClaimable) return "Nothing to Claim";
    if (!info?.merkleAvailable) return "Awaiting Payout Snapshot";
    if (!Array.isArray(info?.proof)) return "Proof Unavailable";
    return "Claim Earnings";
  };

  if (loading) {
    return (
      <UserLayout title="Withdrawal" subtitle="Claim your available earnings">
        <div className={styles.loadingState}>Loading withdrawal information...</div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Withdrawal" subtitle="Claim your available earnings">
      <section className={styles.withdrawCard}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.eyebrow}>EWC WITHDRAWAL CENTER</span>
            <h2>Withdraw Earnings</h2>
            <p>View your earnings and claim authorized USDT income and EWC rewards.</p>
          </div>

          <button type="button" className={styles.refreshButton} onClick={handleRefresh} disabled={refreshing || claiming}>
            <RefreshCw size={15} className={refreshing ? styles.spinning : ""} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>

        <div className={styles.balanceGrid}>
          <div className={`${styles.balanceCard} ${styles.primaryBalance}`}>
            <div className={styles.balanceHeading}>
              <CircleDollarSign size={18} />
              <span>Income Balance</span>
            </div>
            <strong className={styles.balanceAmount}>
              {hasIncomeBalance ? formatUsd(incomeBalance) : "—"}
            </strong>
            <small>Live earnings recorded in your account</small>
          </div>

          <div className={styles.balanceCard}>
            <div className={styles.balanceHeading}>
              <ArrowDownToLine size={18} />
              <span>Ready to Claim</span>
            </div>
            <strong className={styles.balanceAmount}>
              {amounts ? formatUsd(amounts.claimableUsdtDisplay) : "—"}
            </strong>
            <small>USDT authorized by the latest payout snapshot</small>
          </div>
        </div>

        <div className={styles.sectionHeading}>
          <h3>Claimable Rewards</h3>
          <span>Latest published payout snapshot</span>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <CircleDollarSign size={19} />
            <div>
              <span>USDT Income</span>
              <strong>{amounts ? formatUsd(amounts.claimableUsdtDisplay) : "—"}</strong>
            </div>
          </div>

          <div className={styles.stat}>
            <Coins size={19} />
            <div>
              <span>EWC ROI</span>
              <strong>{amounts ? formatAmount(amounts.claimableEwcDisplay, 4) : "—"} EWC</strong>
            </div>
          </div>
        </div>

        <div className={styles.sectionHeading}>
          <h3>Claim Summary</h3>
          <span>Cumulative payouts</span>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <ShieldCheck size={19} />
            <div>
              <span>Already Claimed USDT</span>
              <strong>{amounts ? formatUsd(amounts.claimedUsdtDisplay) : "—"}</strong>
            </div>
          </div>

          <div className={styles.stat}>
            <Coins size={19} />
            <div>
              <span>Already Claimed EWC</span>
              <strong>{amounts ? formatAmount(amounts.claimedEwcDisplay, 4) : "—"} EWC</strong>
            </div>
          </div>
        </div>

        <div className={styles.sectionHeading}>
          <h3>Connected Wallet</h3>
          <span>BNB Smart Chain</span>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <Wallet size={19} />
            <div>
              <span>USDT in Wallet</span>
              <strong>{!isConnected ? "—" : balanceLoading ? "Loading..." : `${formatAmount(usdtBalance)} USDT`}</strong>
            </div>
          </div>

          <div className={styles.stat}>
            <Coins size={19} />
            <div>
              <span>EWC in Wallet</span>
              <strong>{!isConnected ? "—" : balanceLoading ? "Loading..." : `${formatAmount(ewcBalance)} EWC`}</strong>
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
            <strong>{isConnected ? shortAddress(address) : "Not connected"}</strong>
          </div>
        </div>

        {isConnected && !walletMatches && (
          <div className={styles.warningBox}>
            <AlertCircle size={16} />
            Connected wallet does not match your registered wallet.
          </div>
        )}

        {hasIncomeBalance && amounts && Number(incomeBalance) > Number(amounts.claimableUsdtDisplay) && (
          <div className={styles.infoBox}>
            <ShieldCheck size={17} />
            Some earnings may be awaiting the next payout snapshot before they can be claimed.
          </div>
        )}

        {error && (
          <div className={styles.errorBox}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {status && (
          <div className={`${styles.txStatus} ${status.startsWith("Claim successful") ? styles.txSuccess : styles.txPending}`}>
            <div className={styles.txStatusIcon}>
              {status.startsWith("Claim successful") ? <CheckCircle2 size={20} /> : <div className={styles.txSpinner} />}
            </div>
            <div className={styles.txStatusContent}>
              <strong>{status.startsWith("Claim successful") ? "Claim Successful" : "Transaction Processing"}</strong>
              <span>{status}</span>
            </div>
            {txHash && (
              <a className={styles.txLink} href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">
                View Transaction
              </a>
            )}
          </div>
        )}

        <button
          type="button"
          className={styles.claimButton}
          onClick={handleClaim}
          disabled={claiming || (isConnected && !canClaim && chainId === BSC_CHAIN_ID)}
        >
          <ArrowDownToLine size={18} />
          {getClaimButtonLabel()}
        </button>

        <p className={styles.claimNote}>
          USDT earnings and EWC ROI are transferred directly to your registered wallet.
          Withdrawal history is available on the separate history page.
        </p>
      </section>
    </UserLayout>
  );
};

export default Withdrawal;
