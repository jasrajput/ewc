/* global BigInt */
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

// ============================================================
// CONFIGURATION
// ============================================================

const BSC_CHAIN_ID = 97;

// Closing.js and EWCPayout use 18-decimal cumulative amounts.
const TOKEN_DECIMALS = 18;

// EWC token is not deployed during the USDT-only phase.
// Change this to true after deploying and configuring EWC.
const EWC_TOKEN_ENABLED = false;

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

// Use an independent ABI for reading claim accounting.
// This works even if the imported payout ABI omits these getters.
const CLAIM_ACCOUNTING_ABI = [
  {
    type: "function",
    name: "usdtClaimed",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "roiEwcClaimed",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// ============================================================
// HELPERS
// ============================================================

const formatAmount = (value, maxDecimals = 4) => {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
};

const formatUsd = (value) => `$${formatAmount(value, 2)}`;

const shortAddress = (value) =>
  value
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : "Not available";

const parseAmount = (value, decimals = TOKEN_DECIMALS) => {
  try {
    return parseUnits(String(value ?? "0"), decimals);
  } catch {
    return 0n;
  }
};

const getErrorMessage = (error) =>
  error?.shortMessage ||
  error?.response?.data?.message ||
  error?.message ||
  "An unexpected error occurred.";

// ============================================================
// WITHDRAWAL COMPONENT
// ============================================================

const Withdrawal = () => {
  // ----------------------------------------------------------
  // BACKEND DATA
  // ----------------------------------------------------------

  const [info, setInfo] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  // ----------------------------------------------------------
  // WALLET BALANCES
  // ----------------------------------------------------------

  const [usdtBalance, setUsdtBalance] = useState("0");
  const [ewcBalance, setEwcBalance] = useState("0");

  // ----------------------------------------------------------
  // ON-CHAIN CLAIM ACCOUNTING
  // ----------------------------------------------------------

  const [claimedData, setClaimedData] = useState(null);
  const [claimedLoading, setClaimedLoading] = useState(false);
  const [claimedError, setClaimedError] = useState("");

  // ----------------------------------------------------------
  // WALLET CONNECTION
  // ----------------------------------------------------------

  const connection = useConnection();

  const address = connection.address;
  const chainId = connection.chainId;

  const isConnected = connection.status === "connected";

  const publicClient = usePublicClient();

  const { open } = useWeb3Modal();

  const { mutateAsync: writeContract } = useWriteContract();

  // ----------------------------------------------------------
  // REGISTERED WALLET
  // ----------------------------------------------------------

  const registeredWallet = info?.wallet || "";

  const walletMatches =
    Boolean(address) &&
    Boolean(registeredWallet) &&
    address.toLowerCase() === registeredWallet.toLowerCase();

  const correctNetwork = chainId === BSC_CHAIN_ID;

  // ----------------------------------------------------------
  // LOAD WITHDRAWAL INFORMATION FROM BACKEND
  // ----------------------------------------------------------

  const loadWithdrawalInfo = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        const response = await api.get("/withdrawal/info", {
          params: {
            _t: Date.now(),
          },
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.data?.success || !response.data?.data) {
          throw new Error(
            "Invalid withdrawal information response."
          );
        }

        setInfo(response.data.data);

        return response.data.data;
      } catch (err) {
        console.error("Withdrawal info error:", err);

        setError(
          err.response?.data?.message ||
            err.message ||
            "Unable to load withdrawal information."
        );

        return null;
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    []
  );

  // ----------------------------------------------------------
  // READ CLAIMED AMOUNTS DIRECTLY FROM EWCPAYOUT
  // ----------------------------------------------------------

  const loadClaimedAmounts = useCallback(
    async (walletAddress = address) => {
      if (
        !publicClient ||
        !walletAddress ||
        !isConnected ||
        !correctNetwork
      ) {
        setClaimedData(null);
        return null;
      }

      try {
        setClaimedLoading(true);
        setClaimedError("");

        const [usdtClaimed, roiEwcClaimed] = await Promise.all([
          publicClient.readContract({
            address: EWC_PAYOUT_ADDRESS,
            abi: CLAIM_ACCOUNTING_ABI,
            functionName: "usdtClaimed",
            args: [walletAddress],
          }),

          publicClient.readContract({
            address: EWC_PAYOUT_ADDRESS,
            abi: CLAIM_ACCOUNTING_ABI,
            functionName: "roiEwcClaimed",
            args: [walletAddress],
          }),
        ]);

        const result = {
          wallet: walletAddress.toLowerCase(),
          usdt: BigInt(usdtClaimed),
          ewc: BigInt(roiEwcClaimed),
        };

        setClaimedData(result);

        console.log("EWCPayout claimed accounting:", {
          wallet: walletAddress,
          usdtClaimed: formatUnits(result.usdt, TOKEN_DECIMALS),
          roiEwcClaimed: formatUnits(result.ewc, TOKEN_DECIMALS),
        });

        return result;
      } catch (err) {
        console.error("Failed to read claimed amounts:", err);

        setClaimedData(null);

        setClaimedError(
          "Unable to verify claimed amounts from EWCPayout."
        );

        return null;
      } finally {
        setClaimedLoading(false);
      }
    },
    [publicClient, address, isConnected, correctNetwork]
  );

  // ----------------------------------------------------------
  // LOAD WALLET TOKEN BALANCES
  // ----------------------------------------------------------

  const loadWalletBalances = useCallback(async () => {
    if (
      !isConnected ||
      !address ||
      !publicClient ||
      !correctNetwork
    ) {
      setUsdtBalance("0");
      setEwcBalance("0");
      return;
    }

    try {
      setBalanceLoading(true);

      // USDT is deployed and required.
      const usdtDecimals = Number(
        await publicClient.readContract({
          address: USDT_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "decimals",
        })
      );

      const rawUsdt = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: TOKEN_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      setUsdtBalance(
        formatUnits(rawUsdt, usdtDecimals)
      );

      // Do not attempt to call an undeployed EWC token.
      if (EWC_TOKEN_ENABLED && EWC_ADDRESS) {
        try {
          const ewcDecimals = Number(
            await publicClient.readContract({
              address: EWC_ADDRESS,
              abi: TOKEN_ABI,
              functionName: "decimals",
            })
          );

          const rawEwc = await publicClient.readContract({
            address: EWC_ADDRESS,
            abi: TOKEN_ABI,
            functionName: "balanceOf",
            args: [address],
          });

          setEwcBalance(
            formatUnits(rawEwc, ewcDecimals)
          );
        } catch (ewcError) {
          console.error(
            "EWC balance read failed:",
            ewcError
          );

          setEwcBalance("0");
        }
      } else {
        setEwcBalance("0");
      }
    } catch (err) {
      console.error("Wallet balance error:", err);

      setError(
        "Unable to read your USDT wallet balance."
      );
    } finally {
      setBalanceLoading(false);
    }
  }, [
    isConnected,
    address,
    publicClient,
    correctNetwork,
  ]);

  // ----------------------------------------------------------
  // INITIAL BACKEND LOAD
  // ----------------------------------------------------------

  useEffect(() => {
    loadWithdrawalInfo(true);
  }, [loadWithdrawalInfo]);

  // ----------------------------------------------------------
  // REFRESH ON-CHAIN AMOUNTS WHEN WALLET CHANGES
  // ----------------------------------------------------------

  useEffect(() => {
    setClaimedData(null);

    if (
      isConnected &&
      address &&
      correctNetwork
    ) {
      loadClaimedAmounts(address);
    }
  }, [
    isConnected,
    address,
    correctNetwork,
    loadClaimedAmounts,
  ]);

  // ----------------------------------------------------------
  // LOAD TOKEN BALANCES
  // ----------------------------------------------------------

  useEffect(() => {
    loadWalletBalances();
  }, [loadWalletBalances]);

  // ----------------------------------------------------------
  // CALCULATE CLAIMABLE AMOUNTS
  // ----------------------------------------------------------

  const amounts = useMemo(() => {
    if (!info || !claimedData) {
      return null;
    }

    if (
      !address ||
      claimedData.wallet !== address.toLowerCase() ||
      !walletMatches ||
      !correctNetwork
    ) {
      return null;
    }

    // Backend provides cumulative Merkle entitlements.
    const cumulativeUsdt = parseAmount(
      info.cumulativeUsdtIncome,
      TOKEN_DECIMALS
    );

    const cumulativeEwc = parseAmount(
      info.cumulativeRoiEwc,
      TOKEN_DECIMALS
    );

    // Blockchain provides already-claimed amounts.
    // Never rely on cached backend claimed amounts.
    const claimedUsdt = claimedData.usdt;
    const claimedEwc = claimedData.ewc;

    // Only the unclaimed difference can be withdrawn.
    const claimableUsdt =
      cumulativeUsdt > claimedUsdt
        ? cumulativeUsdt - claimedUsdt
        : 0n;

    const claimableEwc =
      cumulativeEwc > claimedEwc
        ? cumulativeEwc - claimedEwc
        : 0n;

    return {
      cumulativeUsdt,
      cumulativeEwc,

      claimedUsdt,
      claimedEwc,

      claimableUsdt,
      claimableEwc,

      hasClaimable:
        claimableUsdt > 0n ||
        claimableEwc > 0n,

      claimableUsdtDisplay: formatUnits(
        claimableUsdt,
        TOKEN_DECIMALS
      ),

      claimableEwcDisplay: formatUnits(
        claimableEwc,
        TOKEN_DECIMALS
      ),

      claimedUsdtDisplay: formatUnits(
        claimedUsdt,
        TOKEN_DECIMALS
      ),

      claimedEwcDisplay: formatUnits(
        claimedEwc,
        TOKEN_DECIMALS
      ),
    };
  }, [
    info,
    claimedData,
    address,
    walletMatches,
    correctNetwork,
  ]);

  // ----------------------------------------------------------
  // INCOME BALANCE
  // ----------------------------------------------------------

  const incomeBalance = info?.incomeBalance;

  const hasIncomeBalance =
    incomeBalance !== undefined &&
    incomeBalance !== null;

  // ----------------------------------------------------------
  // PROOF STATUS
  // ----------------------------------------------------------

  const proofAvailable =
    info?.merkleAvailable === true &&
    Array.isArray(info?.proof) &&
    Boolean(info?.merkleRoot);

  // Empty proof arrays are valid for single-leaf Merkle trees.

  const canClaim =
    isConnected &&
    walletMatches &&
    correctNetwork &&
    claimedData !== null &&
    !claimedLoading &&
    amounts?.hasClaimable === true &&
    proofAvailable &&
    !claiming &&
    !loading;

  // ----------------------------------------------------------
  // MANUAL REFRESH
  // ----------------------------------------------------------

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError("");

      const results = [
        loadWithdrawalInfo(),
        loadWalletBalances(),
      ];

      if (isConnected && address && correctNetwork) {
        results.push(loadClaimedAmounts(address));
      }

      await Promise.all(results);
    } finally {
      setRefreshing(false);
    }
  };

  // ----------------------------------------------------------
  // CLAIM EARNINGS
  // ----------------------------------------------------------

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
        throw new Error(
          "Connected wallet does not match your registered wallet."
        );
      }

      if (!correctNetwork) {
        open({ view: "Networks" });
        return;
      }

      if (!publicClient) {
        throw new Error(
          "Blockchain connection is unavailable."
        );
      }

      if (!amounts || !claimedData) {
        throw new Error(
          "Claim accounting is still loading. Please refresh."
        );
      }

      if (!amounts.hasClaimable) {
        throw new Error(
          "You have no new earnings to claim."
        );
      }

      if (!proofAvailable) {
        throw new Error(
          info?.merkleError ||
            "No earnings are currently authorized for claiming."
        );
      }

      setClaiming(true);

      setStatus(
        "Verifying the latest blockchain claim data."
      );

      // ------------------------------------------------------
      // VERIFY CURRENT MERKLE ROOT
      // ------------------------------------------------------

      const currentRoot = await publicClient.readContract({
        address: EWC_PAYOUT_ADDRESS,
        abi: EWC_PAYOUT_ABI,
        functionName: "merkleRoot",
      });

      if (
        !info?.merkleRoot ||
        currentRoot.toLowerCase() !==
          info.merkleRoot.toLowerCase()
      ) {
        throw new Error(
          "The payout snapshot has changed. Refresh and try again."
        );
      }

      // ------------------------------------------------------
      // RECHECK CLAIMED VALUES BEFORE TRANSACTION
      // ------------------------------------------------------

      const [freshUsdtClaimed, freshEwcClaimed] =
        await Promise.all([
          publicClient.readContract({
            address: EWC_PAYOUT_ADDRESS,
            abi: CLAIM_ACCOUNTING_ABI,
            functionName: "usdtClaimed",
            args: [address],
          }),

          publicClient.readContract({
            address: EWC_PAYOUT_ADDRESS,
            abi: CLAIM_ACCOUNTING_ABI,
            functionName: "roiEwcClaimed",
            args: [address],
          }),
        ]);

      const latestUsdtClaimed = BigInt(freshUsdtClaimed);
      const latestEwcClaimed = BigInt(freshEwcClaimed);

      setClaimedData({
        wallet: address.toLowerCase(),
        usdt: latestUsdtClaimed,
        ewc: latestEwcClaimed,
      });

      if (
        amounts.cumulativeUsdt < latestUsdtClaimed ||
        amounts.cumulativeEwc < latestEwcClaimed
      ) {
        throw new Error(
          "Your claim history is newer than this snapshot. Please contact support."
        );
      }

      const freshClaimableUsdt =
        amounts.cumulativeUsdt - latestUsdtClaimed;

      const freshClaimableEwc =
        amounts.cumulativeEwc - latestEwcClaimed;

      if (
        freshClaimableUsdt === 0n &&
        freshClaimableEwc === 0n
      ) {
        setStatus("");

        throw new Error(
          "These earnings have already been claimed. No additional withdrawal is available."
        );
      }

      // ------------------------------------------------------
      // SUBMIT CLAIM
      // ------------------------------------------------------

      setStatus(
        "Please approve the transaction in your wallet."
      );

      const hash = await writeContract({
        address: EWC_PAYOUT_ADDRESS,
        abi: EWC_PAYOUT_ABI,
        functionName: "claim",
        args: [
          amounts.cumulativeUsdt,
          amounts.cumulativeEwc,
          info.proof,
        ],
        chainId: BSC_CHAIN_ID,
      });

      setTxHash(hash);

      setStatus(
        "Transaction submitted. Waiting for blockchain confirmation."
      );

      // ------------------------------------------------------
      // WAIT FOR CONFIRMATION
      // ------------------------------------------------------

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        });

      if (receipt.status !== "success") {
        throw new Error(
          "Claim transaction failed on BNB Smart Chain."
        );
      }

      // ------------------------------------------------------
      // REFRESH AFTER SUCCESS
      // ------------------------------------------------------

      // Read directly from blockchain after confirmation.
      // This ensures Ready to Claim becomes zero immediately.
      const [refreshedUsdt, refreshedEwc] =
        await Promise.all([
          publicClient.readContract({
            address: EWC_PAYOUT_ADDRESS,
            abi: CLAIM_ACCOUNTING_ABI,
            functionName: "usdtClaimed",
            args: [address],
          }),

          publicClient.readContract({
            address: EWC_PAYOUT_ADDRESS,
            abi: CLAIM_ACCOUNTING_ABI,
            functionName: "roiEwcClaimed",
            args: [address],
          }),
        ]);

      setClaimedData({
        wallet: address.toLowerCase(),
        usdt: BigInt(refreshedUsdt),
        ewc: BigInt(refreshedEwc),
      });

      await Promise.all([
        loadWithdrawalInfo(),
        loadWalletBalances(),
      ]);

      setStatus(
        "Claim successful. Your tokens have been transferred to your wallet."
      );
    } catch (err) {
      console.error("Claim error:", err);

      if (
        err?.code === 4001 ||
        err?.code === "ACTION_REJECTED"
      ) {
        setError("Transaction rejected in wallet.");
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setClaiming(false);
    }
  };

  // ----------------------------------------------------------
  // CLAIM BUTTON LABEL
  // ----------------------------------------------------------

  const getClaimButtonLabel = () => {
    if (claiming) {
      return "Processing Claim...";
    }

    if (!isConnected) {
      return "Connect Wallet";
    }

    if (!walletMatches) {
      return "Wallet Mismatch";
    }

    if (!correctNetwork) {
      return "Switch to BNB Smart Chain";
    }

    if (claimedLoading || !claimedData) {
      return "Loading Claim Information...";
    }

    if (!amounts) {
      return "Claim Information Unavailable";
    }

    if (!amounts.hasClaimable) {
      return "Nothing to Claim";
    }

    if (!info?.merkleAvailable) {
      return "Awaiting Payout Snapshot";
    }

    if (!Array.isArray(info?.proof)) {
      return "Proof Unavailable";
    }

    return "Claim Earnings";
  };

  // ----------------------------------------------------------
  // INITIAL LOADING SCREEN
  // ----------------------------------------------------------

  if (loading) {
    return (
      <UserLayout
        title="Withdrawal"
        subtitle="Claim your available earnings"
      >
        <div className={styles.loadingState}>
          Loading withdrawal information...
        </div>
      </UserLayout>
    );
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <UserLayout
      title="Withdrawal"
      subtitle="Claim your available earnings"
    >
      <section className={styles.withdrawCard}>

        {/* ==================================================
            HEADER
        ================================================== */}

        <div className={styles.cardHeader}>
          <div>
            <span className={styles.eyebrow}>
              EWC WITHDRAWAL CENTER
            </span>

            <h2>Withdraw Earnings</h2>

            <p>
              View your earnings and claim authorized
              USDT income and EWC rewards.
            </p>
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={handleRefresh}
            disabled={refreshing || claiming}
          >
            <RefreshCw
              size={15}
              className={
                refreshing ? styles.spinning : ""
              }
            />

            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>

        {/* ==================================================
            MAIN BALANCES
        ================================================== */}

        <div className={styles.balanceGrid}>

          <div
            className={`${styles.balanceCard} ${styles.primaryBalance}`}
          >
            <div className={styles.balanceHeading}>
              <CircleDollarSign size={18} />
              <span>Income Balance</span>
            </div>

            <strong className={styles.balanceAmount}>
              {hasIncomeBalance
                ? formatUsd(incomeBalance)
                : "—"}
            </strong>

            <small>
              Live earnings recorded in your account
            </small>
          </div>

          <div className={styles.balanceCard}>
            <div className={styles.balanceHeading}>
              <ArrowDownToLine size={18} />
              <span>Ready to Claim</span>
            </div>

            <strong className={styles.balanceAmount}>
              {amounts
                ? formatUsd(
                    amounts.claimableUsdtDisplay
                  )
                : "—"}
            </strong>

            <small>
              Unclaimed USDT from the published snapshot
            </small>
          </div>

        </div>

        {/* ==================================================
            CLAIMABLE REWARDS
        ================================================== */}

        <div className={styles.sectionHeading}>
          <h3>Claimable Rewards</h3>

          <span>
            Latest published payout snapshot
          </span>
        </div>

        <div className={styles.statsGrid}>

          <div className={styles.stat}>
            <CircleDollarSign size={19} />

            <div>
              <span>USDT Income</span>

              <strong>
                {amounts
                  ? formatUsd(
                      amounts.claimableUsdtDisplay
                    )
                  : "—"}
              </strong>
            </div>
          </div>

          <div className={styles.stat}>
            <Coins size={19} />

            <div>
              <span>EWC ROI</span>

              <strong>
                {amounts
                  ? formatAmount(
                      amounts.claimableEwcDisplay,
                      4
                    )
                  : "—"}{" "}
                EWC
              </strong>
            </div>
          </div>

        </div>

        {/* ==================================================
            CLAIM HISTORY SUMMARY
        ================================================== */}

        <div className={styles.sectionHeading}>
          <h3>Claim Summary</h3>

          <span>
            Cumulative payouts recorded on-chain
          </span>
        </div>

        <div className={styles.statsGrid}>

          <div className={styles.stat}>
            <ShieldCheck size={19} />

            <div>
              <span>Already Claimed USDT</span>

              <strong>
                {amounts
                  ? formatUsd(
                      amounts.claimedUsdtDisplay
                    )
                  : "—"}
              </strong>
            </div>
          </div>

          <div className={styles.stat}>
            <Coins size={19} />

            <div>
              <span>Already Claimed EWC</span>

              <strong>
                {amounts
                  ? formatAmount(
                      amounts.claimedEwcDisplay,
                      4
                    )
                  : "—"}{" "}
                EWC
              </strong>
            </div>
          </div>

        </div>

        {/* ==================================================
            CONNECTED WALLET BALANCES
        ================================================== */}

        <div className={styles.sectionHeading}>
          <h3>Connected Wallet</h3>

          <span>BNB Smart Chain</span>
        </div>

        <div className={styles.statsGrid}>

          <div className={styles.stat}>
            <Wallet size={19} />

            <div>
              <span>USDT in Wallet</span>

              <strong>
                {!isConnected
                  ? "—"
                  : balanceLoading
                  ? "Loading..."
                  : `${formatAmount(usdtBalance)} USDT`}
              </strong>
            </div>
          </div>

          <div className={styles.stat}>
            <Coins size={19} />

            <div>
              <span>EWC in Wallet</span>

              <strong>
                {!EWC_TOKEN_ENABLED
                  ? "Not launched"
                  : !isConnected
                  ? "—"
                  : balanceLoading
                  ? "Loading..."
                  : `${formatAmount(ewcBalance)} EWC`}
              </strong>
            </div>
          </div>

        </div>

        {/* ==================================================
            WALLET ADDRESSES
        ================================================== */}

        <div className={styles.walletSection}>

          <div>
            <span>Registered Wallet</span>

            <strong>
              {shortAddress(registeredWallet)}
            </strong>
          </div>

          <div>
            <span>Connected Wallet</span>

            <strong>
              {isConnected
                ? shortAddress(address)
                : "Not connected"}
            </strong>
          </div>

        </div>

        {/* ==================================================
            WARNINGS
        ================================================== */}

        {isConnected && !walletMatches && (
          <div className={styles.warningBox}>
            <AlertCircle size={16} />

            Connected wallet does not match your
            registered wallet.
          </div>
        )}

        {isConnected && !correctNetwork && (
          <div className={styles.warningBox}>
            <AlertCircle size={16} />

            Please switch to BNB Smart Chain testnet.
          </div>
        )}

        {claimedError && (
          <div className={styles.warningBox}>
            <AlertCircle size={16} />

            {claimedError}
          </div>
        )}

        {hasIncomeBalance &&
          amounts &&
          Number(incomeBalance) >
            Number(amounts.claimableUsdtDisplay) && (
            <div className={styles.infoBox}>
              <ShieldCheck size={17} />

              Some earnings may be awaiting the next
              payout snapshot before they can be claimed.
            </div>
          )}

        {/* ==================================================
            NOTHING TO CLAIM MESSAGE
        ================================================== */}

        {amounts &&
          !amounts.hasClaimable &&
          !claimedLoading && (
            <div className={styles.infoBox}>
              <CheckCircle2 size={17} />

              No unclaimed earnings are available in the
              current payout snapshot.
            </div>
          )}

        {/* ==================================================
            ERROR MESSAGE
        ================================================== */}

        {error && (
          <div className={styles.errorBox}>
            <AlertCircle size={16} />

            <span>{error}</span>
          </div>
        )}

        {/* ==================================================
            TRANSACTION STATUS
        ================================================== */}

        {status && (
          <div
            className={`${styles.txStatus} ${
              status.startsWith("Claim successful")
                ? styles.txSuccess
                : styles.txPending
            }`}
          >
            <div className={styles.txStatusIcon}>
              {status.startsWith("Claim successful") ? (
                <CheckCircle2 size={20} />
              ) : (
                <div className={styles.txSpinner} />
              )}
            </div>

            <div className={styles.txStatusContent}>
              <strong>
                {status.startsWith("Claim successful")
                  ? "Claim Successful"
                  : "Transaction Processing"}
              </strong>

              <span>{status}</span>
            </div>

            {txHash && (
              <a
                className={styles.txLink}
                href={`https://testnet.bscscan.com/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View Transaction
              </a>
            )}
          </div>
        )}

        {/* ==================================================
            CLAIM BUTTON
        ================================================== */}

        <button
          type="button"
          className={styles.claimButton}
          onClick={handleClaim}
          disabled={
            claiming ||
            loading ||
            (isConnected && !canClaim)
          }
        >
          <ArrowDownToLine size={18} />

          {getClaimButtonLabel()}
        </button>

        {/* ==================================================
            FOOTER
        ================================================== */}

        <p className={styles.claimNote}>
          USDT earnings and EWC ROI are transferred
          directly to your registered wallet.
          Withdrawal history is available on the
          separate history page.
        </p>

      </section>
    </UserLayout>
  );
};

export default Withdrawal;