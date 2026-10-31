/* global BigInt */
/* eslint-disable no-unused-vars */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, usePublicClient } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { formatUnits, parseUnits } from "viem";

import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Coins,
  Gift,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Wallet,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

import api from "../../services/api";

import {
  useUSDTBalance,
  useUSDTAllowance,
  useContractWrite,
} from "../../hooks/useContract";

import {
  PRESALE_ADDRESS,
  USDT_ADDRESS,
  PRESALE_ABI,
  TOKEN_ABI,
} from "../../contracts/config";

import UserLayout from "../../components/layout/UserLayout";
import styles from "./Presale.module.css";

// =========================================================
// PRIVATE SALE CONFIGURATION
// =========================================================

// Testing start date.
// For production, update this to November 1, 2026.
const PRESALE_START = Date.UTC(2026, 9, 28, 0, 0, 0);
const PRESALE_END = Date.UTC(2026, 11, 1, 0, 0, 0);

const PRESALE_PRICE = 0.01;

const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 100000;

const USDT_DECIMALS = 18;
const EWC_DECIMALS = 18;

const PRESALE_PRICE_WEI = 10000000000000000n;
const BPS = 10000n;

const BONUS_TIERS = [
  { min: 10, bonus: 5 },
  { min: 30, bonus: 10 },
  { min: 100, bonus: 15 },
  { min: 300, bonus: 20 },
  { min: 650, bonus: 25 },
  { min: 1000, bonus: 30 },
  { min: 3000, bonus: 35 },
  { min: 6000, bonus: 40 },
  { min: 10000, bonus: 50 },
  { min: 25000, bonus: 60 },
  { min: 40000, bonus: 70 },
  { min: 50000, bonus: 85 },
  { min: 75000, bonus: 100 },
];

// =========================================================
// HELPERS
// =========================================================

const formatUsd = (value = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatNumber = (value = 0, digits = 4) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));

const getPresalePhase = (timestamp) => {
  if (timestamp < PRESALE_START) return "upcoming";
  if (timestamp >= PRESALE_END) return "ended";
  return "live";
};

const getCountdown = (now, target) => {
  const difference = Math.max(0, target - now);

  return {
    days: Math.floor(difference / 86400000),
    hours: Math.floor((difference / 3600000) % 24),
    minutes: Math.floor((difference / 60000) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
};

const pad = (value) => String(value).padStart(2, "0");

const formatDate = (value) => {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// =========================================================
// COMPONENT
// =========================================================

const Presale = () => {
  const connection = useConnection();

  const address = connection.address;
  const isConnected = connection.status === "connected";

  const { open } = useWeb3Modal();
  const publicClient = usePublicClient();

  const { writeContract } = useContractWrite();

  const { data: usdtBalance, refetch: refetchBalance } =
    useUSDTBalance(address);

  const { data: allowance, refetch: refetchAllowance } =
    useUSDTAllowance(address);

  // =========================================================
  // STATE
  // =========================================================

  const [now, setNow] = useState(Date.now());

  const [amount, setAmount] = useState("");
  const [investmentType, setInvestmentType] = useState("self");

  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [beneficiaryMember, setBeneficiaryMember] = useState(null);

  const [accountChecking, setAccountChecking] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [contractPresaleActive, setContractPresaleActive] = useState(false);
  const [contractChecking, setContractChecking] = useState(true);

  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");

  // =========================================================
  // HISTORY STATE
  // =========================================================

  const [presaleHistory, setPresaleHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  // =========================================================
  // CALCULATED VALUES
  // =========================================================

  const amountNum = Number(amount) || 0;

  const phase = getPresalePhase(now);

  const countdownTarget = phase === "upcoming" ? PRESALE_START : PRESALE_END;

  const countdown = getCountdown(now, countdownTarget);

  const balance = useMemo(() => {
    if (usdtBalance == null) return 0;

    return Number(formatUnits(usdtBalance, USDT_DECIMALS));
  }, [usdtBalance]);

  const allowanceAmount = useMemo(() => {
    if (allowance == null) return 0;

    return Number(formatUnits(allowance, USDT_DECIMALS));
  }, [allowance]);

  const validAmount =
    Number.isFinite(amountNum) &&
    amountNum >= MIN_DEPOSIT &&
    amountNum <= MAX_DEPOSIT;

  const hasEnoughBalance = amountNum <= balance;

  const needsApproval = validAmount && allowanceAmount < amountNum;

  const transactionBusy = txStatus === "approving" || txStatus === "investing";

  const canPurchase = phase === "live" && contractPresaleActive;

  // =========================================================
  // CLOCK
  // =========================================================

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // =========================================================
  // CONTRACT STATUS
  // =========================================================

  const checkPresaleStatus = useCallback(async () => {
    if (!publicClient) {
      setContractPresaleActive(false);
      setContractChecking(false);
      return;
    }

    try {
      const active = await publicClient.readContract({
        address: PRESALE_ADDRESS,
        abi: PRESALE_ABI,
        functionName: "isPresaleActive",
      });

      setContractPresaleActive(Boolean(active));
    } catch (error) {
      console.error("Private Sale status error:", error);
      setContractPresaleActive(false);
    } finally {
      setContractChecking(false);
    }
  }, [publicClient]);

  useEffect(() => {
    checkPresaleStatus();

    const interval = setInterval(checkPresaleStatus, 30000);

    return () => clearInterval(interval);
  }, [checkPresaleStatus]);

  // =========================================================
  // PRIVATE SALE QUOTE
  // =========================================================

  const fetchQuote = useCallback(
    async (value) => {
      if (!publicClient || value < MIN_DEPOSIT || value > MAX_DEPOSIT) {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);

      try {
        const amountWei = parseUnits(String(value), USDT_DECIMALS);

        const bonusBps = await publicClient.readContract({
          address: PRESALE_ADDRESS,
          abi: PRESALE_ABI,
          functionName: "getPresaleBonusBps",
          args: [amountWei],
        });

        const baseEwcWei = (amountWei * 10n ** 18n) / PRESALE_PRICE_WEI;

        const bonusEwcWei = (baseEwcWei * bonusBps) / BPS;

        const totalEwcWei = baseEwcWei + bonusEwcWei;

        setQuote({
          price: PRESALE_PRICE,

          baseEwc: Number(formatUnits(baseEwcWei, EWC_DECIMALS)),

          bonusEwc: Number(formatUnits(bonusEwcWei, EWC_DECIMALS)),

          totalEwc: Number(formatUnits(totalEwcWei, EWC_DECIMALS)),

          bonusPercent: Number(bonusBps) / 100,
        });
      } catch (error) {
        console.error("Private Sale quote error:", error);
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    },
    [publicClient],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchQuote(amountNum);
    }, 350);

    return () => clearTimeout(timer);
  }, [amountNum, fetchQuote]);

  // =========================================================
  // VERIFY MEMBER
  // =========================================================

  const verifyInvestmentAccount = useCallback(async (walletAddress) => {
    if (!walletAddress) {
      setBeneficiaryMember(null);
      setAccountError("Wallet address is required.");
      return null;
    }

    setAccountChecking(true);
    setAccountError("");
    setBeneficiaryMember(null);

    try {
      const response = await api.post("/auth/check-investment-account", {
        address: walletAddress,
      });

      if (response.data?.success && response.data?.member) {
        setBeneficiaryMember(response.data.member);
        return response.data.member;
      }

      setAccountError("Unable to verify this account.");
      return null;
    } catch (error) {
      const backendMessage = error?.response?.data?.message || "";

      const walletNotRegistered =
        backendMessage.toLowerCase().includes("no account is registered") ||
        backendMessage.toLowerCase().includes("wallet address not registered");

      setAccountError(
        walletNotRegistered
          ? "This wallet address is not linked to an EWC account. Please visit the Wallet page to link your wallet before purchasing EWC."
          : backendMessage || "Unable to verify this wallet address.",
      );

      return null;
    } finally {
      setAccountChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setBeneficiaryMember(null);
      setAccountError("");
      return;
    }

    if (investmentType === "self") {
      setBeneficiaryAddress("");
      verifyInvestmentAccount(address);
    } else {
      setBeneficiaryMember(null);
      setAccountError("");
    }
  }, [investmentType, address, isConnected, verifyInvestmentAccount]);

  const handleVerifyOtherAccount = async () => {
    const cleanAddress = beneficiaryAddress.trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
      setAccountError("Enter a valid wallet address.");
      return;
    }

    await verifyInvestmentAccount(cleanAddress);
  };

  // =========================================================
  // FETCH PRIVATE SALE HISTORY
  // =========================================================

  const fetchPresaleHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");

      const response = await api.get("/investment/history");

      if (!response.data?.success) {
        throw new Error("Unable to load investment history.");
      }

      const investments = response.data.investments || [];

      const filtered = investments.filter(
        (investment) => investment.isPresale === true,
      );

      setPresaleHistory(filtered);
    } catch (error) {
      console.error("Private Sale history error:", error);

      setHistoryError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to load Private Sale history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresaleHistory();
  }, [fetchPresaleHistory]);

  // =========================================================
  // HISTORY SUMMARY
  // =========================================================

  const historySummary = useMemo(() => {
    const confirmed = presaleHistory.filter(
      (item) => Number(item.status) === 1,
    );

    return confirmed.reduce(
      (totals, item) => {
        totals.totalInvested += Number(item.amount || 0);
        totals.baseEwc += Number(item.baseEwc || 0);
        totals.bonusEwc += Number(item.bonusEwc || 0);
        totals.totalEwc += Number(item.ewcAllocation || 0);

        return totals;
      },
      {
        totalInvested: 0,
        baseEwc: 0,
        bonusEwc: 0,
        totalEwc: 0,
      },
    );
  }, [presaleHistory]);

  // =========================================================
  // AMOUNT HANDLERS
  // =========================================================

  const handleAmountChange = (event) => {
    const value = event.target.value;

    if (value === "") {
      setAmount("");
      setTxError("");
      return;
    }

    if (!/^\d*\.?\d{0,2}$/.test(value)) return;

    if (Number(value) < 0) return;

    setAmount(value);
    setTxError("");
  };

  const selectPreset = (value) => {
    if (transactionBusy) return;

    setAmount(String(value));
    setTxError("");
  };

  const setMax = () => {
    if (transactionBusy) return;

    if (!isConnected) {
      open();
      return;
    }

    const available = Math.min(balance, MAX_DEPOSIT);

    if (available < MIN_DEPOSIT) {
      setTxError(`Minimum private sale investment is $${MIN_DEPOSIT}.`);
      return;
    }

    // Keep the amount within two decimal places.
    const maxAmount = Math.floor(available * 100) / 100;

    setAmount(maxAmount.toFixed(2));
    setTxError("");
  };

  // =========================================================
  // PURCHASE
  // =========================================================

  const handlePurchase = async () => {
    setTxError("");

    if (!isConnected || !address) {
      open();
      return;
    }

    if (!publicClient) {
      setTxError("Blockchain connection is not ready.");
      return;
    }

    if (!canPurchase) {
      setTxError("The private sale is not currently active.");
      return;
    }

    if (!validAmount) {
      setTxError(
        `Enter an amount between $${MIN_DEPOSIT} and $${MAX_DEPOSIT}.`,
      );
      return;
    }

    if (!quote) {
      setTxError("Unable to calculate private sale allocation.");
      return;
    }

    let beneficiary = address;

    if (investmentType === "other") {
      beneficiary = beneficiaryAddress.trim();

      if (!/^0x[a-fA-F0-9]{40}$/.test(beneficiary)) {
        setTxError("Enter a valid beneficiary wallet address.");
        return;
      }
    }

    if (!beneficiaryMember) {
      setTxError("Please verify the beneficiary account.");
      return;
    }

    try {
      const verifiedMember = await verifyInvestmentAccount(beneficiary);

      if (!verifiedMember) {
        setTxError("Beneficiary verification failed.");
        return;
      }

      const active = await publicClient.readContract({
        address: PRESALE_ADDRESS,
        abi: PRESALE_ABI,
        functionName: "isPresaleActive",
      });

      if (!active) {
        setTxError("Private Sale is not active.");
        return;
      }

      const amountWei = parseUnits(amount, USDT_DECIMALS);

      const freshBalance = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: TOKEN_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      if (freshBalance < amountWei) {
        setTxError("Insufficient USDT balance.");
        return;
      }

      const freshAllowance = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: TOKEN_ABI,
        functionName: "allowance",
        args: [address, PRESALE_ADDRESS],
      });

      if (freshAllowance < amountWei) {
        setTxStatus("approving");

        const approvalHash = await writeContract({
          address: USDT_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "approve",
          args: [PRESALE_ADDRESS, amountWei],
        });

        const approvalReceipt = await publicClient.waitForTransactionReceipt({
          hash: approvalHash,
        });

        if (approvalReceipt.status !== "success") {
          throw new Error("USDT approval failed.");
        }

        await refetchAllowance?.();
      }

      setTxStatus("investing");

      // No PancakeSwap market buy during Private Sale.
      const minEwcOut = 0n;

      let depositHash;

      if (investmentType === "self") {
        depositHash = await writeContract({
          address: PRESALE_ADDRESS,
          abi: PRESALE_ABI,
          functionName: "deposit",
          args: [amountWei],
          gas: 9000000n,
        });
      } else {
        depositHash = await writeContract({
          address: PRESALE_ADDRESS,
          abi: PRESALE_ABI,
          functionName: "depositFor",
          args: [beneficiary, amountWei],
          gas: 9000000n,
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: depositHash,
      });

      if (receipt.status !== "success") {
        throw new Error("Private Sale transaction failed.");
      }

      setTxStatus("success");
      setAmount("");
      setQuote(null);

      await Promise.all([refetchBalance?.(), refetchAllowance?.()]);

      // The database may need time to index the event.
      fetchPresaleHistory();

      setTimeout(() => {
        fetchPresaleHistory();
      }, 5000);

      setTimeout(() => {
        setTxStatus("");
      }, 5000);
    } catch (error) {
      console.error("Private Sale purchase error:", error);

      const message =
        error?.shortMessage || error?.message || "Transaction failed.";

      setTxStatus("");

      if (message.toLowerCase().includes("rejected")) {
        setTxError("Transaction rejected by wallet.");
      } else {
        setTxError(message);
      }
    }
  };

  // =========================================================
  // USER LAYOUT
  // =========================================================

  let storedUser = {};

  try {
    const raw =
      localStorage.getItem("ewc_user") || sessionStorage.getItem("ewc_user");

    if (raw) storedUser = JSON.parse(raw);
  } catch (error) {
    storedUser = {};
  }

  const layoutUser = {
    ...storedUser,
    wallet_address: address || "",
  };

  // =========================================================
  // PURCHASE BUTTON
  // =========================================================

  let buttonText = "Enter Purchase Amount";

  if (phase === "upcoming") {
    buttonText = "Private Sale Coming Soon";
  } else if (phase === "ended") {
    buttonText = "Private Sale Has Ended";
  } else if (contractChecking) {
    buttonText = "Checking Private Sale Status...";
  } else if (!contractPresaleActive) {
    buttonText = "Private Sale Unavailable";
  } else if (!isConnected) {
    buttonText = "Connect Wallet";
  } else if (validAmount && !hasEnoughBalance) {
    buttonText = "Insufficient USDT";
  } else if (validAmount && needsApproval) {
    buttonText = `Approve & Purchase ${formatUsd(amountNum)}`;
  } else if (validAmount) {
    buttonText = `Purchase EWC for ${formatUsd(amountNum)}`;
  }

  const actionDisabled =
    transactionBusy ||
    phase !== "live" ||
    !contractPresaleActive ||
    contractChecking ||
    (isConnected &&
      (!validAmount || !hasEnoughBalance || !quote || quoteLoading));

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <UserLayout
      user={layoutUser}
      title="EWC Private Sale"
      subtitle="Exclusive Token Launch"
    >
      <div className={styles.page}>
        {/* =====================================================
            HERO
        ===================================================== */}

        <section className={styles.hero}>
          <div className={styles.heroGlow} />

          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <Sparkles size={14} />

              {phase === "upcoming"
                ? "PRIVATE SALE COMING SOON"
                : phase === "live"
                  ? "PRIVATE SALE IS LIVE"
                  : "PRIVATE SALE ENDED"}
            </div>

            <h1>
              The Future Starts
              <br />
              <span>With EWC.</span>
            </h1>

            <p className={styles.heroDescription}>
              Join the Elevate World Community token private sale. Secure your
              EWC allocation at a fixed launch price and unlock exclusive
              private sale bonuses.
            </p>

            <div className={styles.heroStats}>
              <div>
                <span>PRIVATE SALE PRICE</span>
                <strong>$0.01</strong>
                <small>Per EWC Token</small>
              </div>

              <div>
                <span>MAXIMUM BONUS</span>
                <strong>100%</strong>
                <small>Tier-Based Rewards</small>
              </div>

              <div>
                <span>PRIVATE SALE PERIOD</span>
                <strong>30 Days</strong>
                <small>November 2026</small>
              </div>
            </div>
          </div>

          <div className={styles.countdownCard}>
            <div className={styles.countdownHeading}>
              <Clock3 size={18} />

              <span>
                {phase === "upcoming"
                  ? "PRIVATE SALE STARTS IN"
                  : phase === "live"
                    ? "PRIVATE SALE ENDS IN"
                    : "PRIVATE SALE COMPLETED"}
              </span>
            </div>

            {phase !== "ended" ? (
              <div className={styles.countdownGrid}>
                {[
                  ["DAYS", countdown.days],
                  ["HOURS", countdown.hours],
                  ["MINUTES", countdown.minutes],
                  ["SECONDS", countdown.seconds],
                ].map(([label, value]) => (
                  <div className={styles.countdownUnit} key={label}>
                    <strong>{pad(value)}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.endedMessage}>
                The November 2026 private sale has concluded.
              </div>
            )}

            <div className={styles.countdownFooter}>
              <span>November 1, 2026</span>
              <span>November 30, 2026</span>
            </div>

            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${
                    phase === "upcoming"
                      ? 0
                      : phase === "ended"
                        ? 100
                        : Math.min(
                            100,
                            Math.max(
                              0,
                              ((now - PRESALE_START) /
                                (PRESALE_END - PRESALE_START)) *
                                100,
                            ),
                          )
                  }%`,
                }}
              />
            </div>

            <p className={styles.progressCaption}>
              Private Sale timeline progress
            </p>
          </div>
        </section>

        {/* =====================================================
            PURCHASE AREA
        ===================================================== */}

        <section className={styles.purchaseGrid}>
          {/* PURCHASE CARD */}

          <div className={styles.purchaseCard}>
            <div className={styles.cardHeading}>
              <div>
                <span className={styles.eyebrow}>EXCLUSIVE PRIVATE SALE</span>

                <h2>Purchase EWC Tokens</h2>

                <p>
                  Choose how much USDT you'd like to spend. Your EWC allocation
                  and private sale bonus will be calculated instantly.
                </p>
              </div>

              <div className={styles.pricePill}>
                <Coins size={17} />
                $0.01 / EWC
              </div>
            </div>

            {/* ACCOUNT SELECTION */}

            <div className={styles.formGroup}>
              <label>Purchase For</label>

              <div className={styles.accountTabs}>
                <button
                  type="button"
                  className={investmentType === "self" ? styles.activeTab : ""}
                  onClick={() => setInvestmentType("self")}
                  disabled={transactionBusy}
                >
                  My Account
                </button>

                <button
                  type="button"
                  className={investmentType === "other" ? styles.activeTab : ""}
                  onClick={() => setInvestmentType("other")}
                  disabled={transactionBusy}
                >
                  Other Account
                </button>
              </div>
            </div>

            {investmentType === "other" && (
              <div className={styles.formGroup}>
                <label>Beneficiary Wallet Address</label>

                <div className={styles.verifyRow}>
                  <input
                    type="text"
                    value={beneficiaryAddress}
                    onChange={(event) => {
                      setBeneficiaryAddress(event.target.value);
                      setBeneficiaryMember(null);
                      setAccountError("");
                    }}
                    placeholder="0x..."
                    disabled={transactionBusy}
                  />

                  <button
                    type="button"
                    onClick={handleVerifyOtherAccount}
                    disabled={
                      transactionBusy ||
                      accountChecking ||
                      !beneficiaryAddress.trim()
                    }
                  >
                    {accountChecking ? "Checking..." : "Verify"}
                  </button>
                </div>
              </div>
            )}

            {accountChecking && (
              <div className={styles.infoMessage}>Verifying account...</div>
            )}

            {accountError && (
              <div className={styles.errorMessage}>
                <AlertCircle size={17} />

                <div>
                  <p>{accountError}</p>

                  {investmentType === "self" &&
                    accountError.includes("not linked to an EWC account") && (
                      <a
                        href="/wallet"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          marginTop: "10px",
                          fontWeight: 600,
                          textDecoration: "underline",
                        }}
                      >
                        Go to Wallet Page
                        <ArrowRight size={15} />
                      </a>
                    )}
                </div>
              </div>
            )}

            {beneficiaryMember && (
              <div className={styles.verifiedBox}>
                <CheckCircle2 size={17} />

                <div>
                  <strong>{beneficiaryMember.name}</strong>

                  <span>{beneficiaryMember.user_id} · Verified Account</span>
                </div>
              </div>
            )}

            {/* AMOUNT */}

            <div className={styles.formGroup}>
              <div className={styles.labelRow}>
                <label>Purchase Amount (USDT)</label>

                <button
                  type="button"
                  onClick={setMax}
                  disabled={transactionBusy}
                >
                  MAX
                </button>
              </div>

              <div className={styles.amountInput}>
                <span>$</span>

                <input
                  type="number"
                  min={MIN_DEPOSIT}
                  max={MAX_DEPOSIT}
                  step="0.01"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="Enter amount"
                  disabled={transactionBusy}
                />

                <strong>USDT</strong>
              </div>

              <div className={styles.amountLimits}>
                <span>Min: ${MIN_DEPOSIT}</span>

                <span>Max: ${MAX_DEPOSIT.toLocaleString()}</span>
              </div>

              <div className={styles.amountPresets}>
                {[10, 100, 1000, 10000, 50000, 100000].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectPreset(value)}
                    className={amountNum === value ? styles.selectedPreset : ""}
                    disabled={transactionBusy}
                  >
                    ${value.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* ALLOCATION */}

            <div className={styles.allocationCard}>
              <div className={styles.allocationHeader}>
                <span>Your EWC Token Allocation</span>
                <Gift size={19} />
              </div>

              <div className={styles.allocationTotal}>
                {quoteLoading
                  ? "Calculating..."
                  : quote
                    ? formatNumber(quote.totalEwc, 4)
                    : "0"}

                {!quoteLoading && <small> EWC</small>}
              </div>

              <div className={styles.allocationRows}>
                <div>
                  <span>Base Allocation</span>

                  <strong>
                    {quote ? `${formatNumber(quote.baseEwc)} EWC` : "—"}
                  </strong>
                </div>

                <div>
                  <span>Private Sale Bonus</span>

                  <strong className={styles.bonusText}>
                    {quote ? `+${formatNumber(quote.bonusEwc)} EWC` : "—"}
                  </strong>
                </div>

                <div>
                  <span>Bonus Percentage</span>

                  <strong className={styles.bonusText}>
                    {quote ? `+${quote.bonusPercent}%` : "—"}
                  </strong>
                </div>
              </div>
            </div>

            {/* WALLET */}

            <div className={styles.walletBalance}>
              <Wallet size={17} />

              <span>Available Balance</span>

              <strong>
                {isConnected
                  ? `${formatNumber(balance, 2)} USDT`
                  : "Wallet not connected"}
              </strong>
            </div>

            {txError && (
              <div className={styles.errorMessage}>
                <AlertCircle size={15} />
                {txError}
              </div>
            )}

            {txStatus === "success" && (
              <div className={styles.successMessage}>
                <CheckCircle2 size={16} />
                EWC purchase completed successfully. Your purchase history will
                update shortly.
              </div>
            )}

            <button
              type="button"
              className={styles.purchaseButton}
              onClick={handlePurchase}
              disabled={actionDisabled}
            >
              {txStatus === "approving"
                ? "Approving USDT..."
                : txStatus === "investing"
                  ? "Confirming Purchase..."
                  : buttonText}

              {!transactionBusy && <ArrowRight size={18} />}
            </button>

            <p className={styles.secureNote}>
              <ShieldCheck size={14} />
              Secured by BNB Smart Chain smart contracts.
            </p>
          </div>

          {/* RIGHT SIDE */}

          <div className={styles.sideColumn}>
            <div className={styles.highlightCard}>
              <div className={styles.highlightIcon}>
                <Gift size={23} />
              </div>

              <span className={styles.eyebrow}>PRIVATE SALE EXCLUSIVE</span>

              <h3>
                More EWC.
                <br />
                More Allocation.
              </h3>

              <p>
                Receive additional EWC tokens based on your investment tier
                during the limited private sale.
              </p>

              <div className={styles.highlightStat}>
                <strong>Up to 100%</strong>
                <span>Additional EWC Bonus</span>
              </div>
            </div>

            <div className={styles.detailsCard}>
              <h3>Private Sale Benefits</h3>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <Coins size={19} />
                </div>

                <div>
                  <strong>Fixed Private Sale Price</strong>

                  <p>
                    EWC is allocated at $0.01 per token throughout the private
                    sale.
                  </p>
                </div>
              </div>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <Gift size={19} />
                </div>

                <div>
                  <strong>Exclusive Bonus Allocation</strong>

                  <p>Earn additional EWC based on your investment amount.</p>
                </div>
              </div>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <LockKeyhole size={19} />
                </div>

                <div>
                  <strong>Five-Year Token Lock</strong>

                  <p>
                    Purchased EWC is locked immediately under the platform's
                    locking mechanism.
                  </p>
                </div>
              </div>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <Clock3 size={19} />
                </div>

                <div>
                  <strong>Staking Rewards Waiting Period</strong>

                  <p>
                    The 100-day waiting period for staking rewards begins
                    December 1, 2026 for all Private Sale purchases.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            PRIVATE SALE HISTORY
        ===================================================== */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>YOUR PRIVATE SALE PORTFOLIO</span>

            <h2>My Private Sale Purchases</h2>

            <p>
              Track your investments, bonus EWC, and total token allocation.
            </p>
          </div>

          <div className={styles.historyActions}>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={fetchPresaleHistory}
              disabled={historyLoading}
            >
              <RefreshCw size={15} />

              {historyLoading ? "Refreshing..." : "Refresh History"}
            </button>
          </div>

          {historyLoading ? (
            <div className={styles.empty}>
              <RefreshCw size={26} />

              <p>Loading your Private Sale purchases...</p>
            </div>
          ) : historyError ? (
            <div className={styles.empty}>
              <AlertCircle size={28} />

              <p>{historyError}</p>

              <button
                type="button"
                className={styles.refreshButton}
                onClick={fetchPresaleHistory}
              >
                Try Again
              </button>
            </div>
          ) : presaleHistory.length === 0 ? (
            <div className={styles.empty}>
              <Coins size={34} />

              <h3 className={styles.emptyTitle}>
                No Private Sale Purchases Yet
              </h3>

              <p className={styles.emptyDescription}>
                Your Private Sale purchase history will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* SUMMARY */}

              <div className={styles.summary}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total USDT Invested</span>

                  <strong className={styles.statValue}>
                    {formatUsd(historySummary.totalInvested)}
                  </strong>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Base EWC Allocation</span>

                  <strong className={styles.statValue}>
                    {formatNumber(historySummary.baseEwc, 2)}
                  </strong>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total Bonus EWC</span>

                  <strong className={styles.statValue}>
                    +{formatNumber(historySummary.bonusEwc, 2)}
                  </strong>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total EWC Allocated</span>

                  <strong className={styles.statValue}>
                    {formatNumber(historySummary.totalEwc, 2)}
                  </strong>
                </div>
              </div>

              {/* HISTORY CARDS */}

              <div className={styles.list}>
                {presaleHistory.map((purchase) => (
                  <div key={purchase.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <span className={styles.label}>
                          PRIVATE SALE PURCHASE
                        </span>

                        <h3 className={styles.amount}>
                          {formatUsd(purchase.amount)}
                        </h3>

                        <small className={styles.date}>
                          {formatDate(purchase.createdOn)}
                        </small>
                      </div>

                      <span className={styles.badge}>
                        <CheckCircle2 size={14} />

                        {Number(purchase.status) === 1
                          ? "Completed"
                          : "Processing"}
                      </span>
                    </div>

                    <div className={styles.details}>
                      <div>
                        <span className={styles.detailLabel}>EWC Price</span>

                        <strong className={styles.detailValue}>
                          ${purchase.ewcPrice}
                        </strong>
                      </div>

                      <div>
                        <span className={styles.detailLabel}>Base EWC</span>

                        <strong className={styles.detailValue}>
                          {formatNumber(purchase.baseEwc, 2)}
                        </strong>
                      </div>

                      <div>
                        <span className={styles.detailLabel}>
                          Bonus Percentage
                        </span>

                        <strong className={styles.bonusValue}>
                          +{formatNumber(purchase.bonusPercentage, 2)}%
                        </strong>
                      </div>

                      <div>
                        <span className={styles.detailLabel}>Bonus EWC</span>

                        <strong className={styles.bonusValue}>
                          +{formatNumber(purchase.bonusEwc, 2)}
                        </strong>
                      </div>
                    </div>

                    <div className={styles.total}>
                      <span className={styles.totalLabel}>
                        Total EWC Allocated
                      </span>

                      <strong className={styles.totalValue}>
                        {formatNumber(purchase.ewcAllocation, 2)} EWC
                      </strong>
                    </div>

                    {purchase.txnId && (
                      <a
                        href={`https://testnet.bscscan.com/tx/${purchase.txnId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.txLink}
                      >
                        View Transaction
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* =====================================================
            BONUS TIERS
        ===================================================== */}

        <section className={styles.tiersSection}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>EXCLUSIVE REWARDS</span>

            <h2>Unlock Your Private Sale Bonus</h2>

            <p>
              Higher investment tiers unlock additional EWC allocation at the
              same fixed private sale price.
            </p>
          </div>

          <div className={styles.tiersGrid}>
            {BONUS_TIERS.map((tier, index) => {
              const nextTier = BONUS_TIERS[index + 1];

              const active =
                amountNum >= tier.min &&
                (!nextTier || amountNum < nextTier.min);

              return (
                <div
                  className={`${styles.tierCard} ${
                    active ? styles.activeTier : ""
                  }`}
                  key={tier.min}
                >
                  <div className={styles.tierTop}>
                    <span>${tier.min.toLocaleString()}+</span>

                    {active && (
                      <span className={styles.currentTier}>YOUR TIER</span>
                    )}
                  </div>

                  <strong>+{tier.bonus}%</strong>

                  <small>Bonus EWC</small>
                </div>
              );
            })}
          </div>
        </section>

        {/* =====================================================
            TIMELINE
        ===================================================== */}

        <section className={styles.timelineSection}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>IMPORTANT DATES</span>

            <h2>Your EWC Journey</h2>
          </div>

          <div className={styles.timelineGrid}>
            <div className={styles.timelineCard}>
              <span>01</span>

              <h3>November 1, 2026</h3>

              <strong>Private Sale Begins</strong>

              <p>
                Purchase EWC at the fixed private sale price and receive your
                bonus allocation.
              </p>
            </div>

            <div className={styles.timelineCard}>
              <span>02</span>

              <h3>November 30, 2026</h3>

              <strong>Private Sale Ends</strong>

              <p>
                The limited-time private sale closes and exclusive bonuses end.
              </p>
            </div>

            <div className={styles.timelineCard}>
              <span>03</span>

              <h3>December 1, 2026</h3>

              <strong>Staking Rewards Waiting Period Starts</strong>

              <p>
                All November private sale investments begin their 100-day
                waiting period.
              </p>
            </div>

            <div className={styles.timelineCard}>
              <span>04</span>

              <h3>March 11, 2027</h3>

              <strong>First Staking Rewards Eligibility</strong>

              <p>
                Private Sale investments reach day 101 under the platform's
                Staking Rewards schedule.
              </p>
            </div>
          </div>
        </section>

        {/* =====================================================
            FOOTER
        ===================================================== */}

        <div className={styles.bottomNotice}>
          <ShieldCheck size={19} />

          <p>
            EWC private sale allocations are calculated using the fixed private
            sale price and applicable bonus tier. All transactions are executed
            on BNB Smart Chain. Review the smart contract terms before
            purchasing.
          </p>
        </div>
      </div>
    </UserLayout>
  );
};

export default Presale;
