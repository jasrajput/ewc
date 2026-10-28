/* eslint-disable no-unused-vars */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, usePublicClient } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { formatUnits, parseUnits } from "viem";

import {
  AlertCircle,
  CheckCircle2,
  Coins,
  ShieldCheck,
  Wallet,
  Clock3,
  LockKeyhole,
  ArrowRight,
  CalendarDays,
  Sparkles,
} from "lucide-react";

import { Link } from "react-router-dom";

import api from "../../services/api";

import {
  useUSDTBalance,
  useUSDTAllowance,
  useContractWrite,
} from "../../hooks/useContract";

import {
  STAKING_ADDRESS,
  USDT_ADDRESS,
  STAKING_ABI,
  TOKEN_ABI,
  ROUTER_ADDRESS,
  TOKEN_ADDRESS,
} from "../../contracts/config";

import UserLayout from "../../components/layout/UserLayout";

import styles from "./Investment.module.css";
import comingStyles from "./InvestmentComingSoon.module.css";

// =========================================================
// CONFIGURATION
// =========================================================

const MIN_DEPOSIT = 25;
const MAX_DEPOSIT = 5000;

const USDT_DECIMALS = 18;
const EWC_DECIMALS = 18;

const TX_SLIPPAGE_BPS = 500n;
const BPS = 10000n;

// December 1, 2026, 00:00 UTC
const STAKING_START = Date.UTC(2026, 11, 1, 0, 0, 0);

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

const getCountdown = (now) => {
  const difference = Math.max(0, STAKING_START - now);

  return {
    days: Math.floor(difference / 86400000),
    hours: Math.floor((difference / 3600000) % 24),
    minutes: Math.floor((difference / 60000) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
};

const pad = (value) => String(value).padStart(2, "0");

// =========================================================
// PANCAKESWAP ROUTER ABI
// =========================================================

const ROUTER_ABI = [
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
];

// =========================================================
// COMPONENT
// =========================================================

const Investment = () => {
  const connection = useConnection();

  const address = connection.address;
  const isConnected = connection.status === "connected";

  const { open } = useWeb3Modal();
  const publicClient = usePublicClient();

  const { writeContract } = useContractWrite();

  // =========================================================
  // STAKING LAUNCH
  // =========================================================

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const stakingNotStarted = currentTime < STAKING_START;

  const countdown = getCountdown(currentTime);

  // =========================================================
  // STATE
  // =========================================================

  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [investmentType, setInvestmentType] = useState("self");

  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [beneficiaryMember, setBeneficiaryMember] = useState(null);

  const [accountChecking, setAccountChecking] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");

  const [investments, setInvestments] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // =========================================================
  // BALANCE AND ALLOWANCE
  // =========================================================

  const { data: usdtBalance, refetch: refetchBalance } =
    useUSDTBalance(address);

  const { data: allowance, refetch: refetchAllowance } =
    useUSDTAllowance(address);

  const amountNum = Number(amount) || 0;

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

  // =========================================================
  // EWC ALLOCATION PREVIEW
  // =========================================================

  const fetchQuote = useCallback(
    async (value) => {
      if (
        !publicClient ||
        Date.now() < STAKING_START ||
        value < MIN_DEPOSIT ||
        value > MAX_DEPOSIT
      ) {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);

      try {
        const amountWei = parseUnits(String(value), USDT_DECIMALS);

        const result = await publicClient.readContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: "previewEwcAllocation",
          args: [amountWei],
        });

        const priceRaw = result[0];
        const allocationRaw = result[1];

        setQuote({
          priceRaw,
          allocationRaw,
          price: Number(formatUnits(priceRaw, 18)),
          allocation: Number(formatUnits(allocationRaw, EWC_DECIMALS)),
        });
      } catch (error) {
        console.error("EWC allocation quote error:", error);
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    },
    [publicClient],
  );

  useEffect(() => {
    if (stakingNotStarted) return;

    const timer = setTimeout(() => {
      fetchQuote(amountNum);
    }, 350);

    return () => clearTimeout(timer);
  }, [amountNum, fetchQuote, stakingNotStarted]);

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
      const message =
        error?.response?.data?.message ||
        "Unable to verify this wallet address.";

      setAccountError(message);
      setBeneficiaryMember(null);

      return null;
    } finally {
      setAccountChecking(false);
    }
  }, []);

  useEffect(() => {
    if (stakingNotStarted) return;

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
  }, [
    investmentType,
    address,
    isConnected,
    verifyInvestmentAccount,
    stakingNotStarted,
  ]);

  // =========================================================
  // STAKING HISTORY
  // =========================================================

  const loadInvestments = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");

      const response = await api.get("/investment/history");

      if (response.data?.success) {
        setInvestments(response.data.investments || []);
      } else {
        setInvestments([]);
      }
    } catch (error) {
      console.error("Staking history error:", error);

      setInvestments([]);

      setHistoryError(
        error?.response?.data?.message || "Unable to load staking history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stakingNotStarted) return;

    loadInvestments();
  }, [loadInvestments, stakingNotStarted]);

  // =========================================================
  // AMOUNT INPUT
  // =========================================================

  const handleAmountChange = (event) => {
    const value = event.target.value;

    if (value === "") {
      setAmount("");
      setTxError("");
      return;
    }

    if (!/^\d*\.?\d{0,2}$/.test(value)) {
      return;
    }

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
      setTxError(`Minimum staking is $${MIN_DEPOSIT}.`);
      return;
    }

    setAmount(available.toFixed(2));
    setTxError("");
  };

  // =========================================================
  // BENEFICIARY
  // =========================================================

  const handleVerifyOtherAccount = async () => {
    setAccountError("");
    setBeneficiaryMember(null);

    const cleanAddress = beneficiaryAddress.trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
      setAccountError("Enter a valid wallet address.");
      return;
    }

    await verifyInvestmentAccount(cleanAddress);
  };

  const handleBeneficiaryChange = (event) => {
    setBeneficiaryAddress(event.target.value);
    setBeneficiaryMember(null);
    setAccountError("");
  };

  // =========================================================
  // INTERNAL PANCAKESWAP SLIPPAGE
  // =========================================================

  const getInternalMinEwcOut = async (amountWei) => {
    const internalSwapAmount = (amountWei * 2000n) / BPS;

    const amounts = await publicClient.readContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [internalSwapAmount, [USDT_ADDRESS, TOKEN_ADDRESS]],
    });

    const expectedOut = amounts[1];

    return expectedOut - (expectedOut * TX_SLIPPAGE_BPS) / BPS;
  };

  // =========================================================
  // STAKING TRANSACTION
  // =========================================================

  const handleInvest = async () => {
    setTxError("");

    // Regular staking must not be accessible
    // before December 1, 2026.

    if (Date.now() < STAKING_START) {
      setTxError("Regular staking opens on December 1, 2026.");
      return;
    }

    if (!isConnected || !address) {
      open();
      return;
    }

    if (!publicClient) {
      setTxError("Blockchain connection is not ready.");
      return;
    }

    if (!validAmount) {
      setTxError(
        `Enter an amount between $${MIN_DEPOSIT} and $${MAX_DEPOSIT.toLocaleString()}.`,
      );
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
        args: [address, STAKING_ADDRESS],
      });

      if (freshAllowance < amountWei) {
        setTxStatus("approving");

        const approvalHash = await writeContract({
          address: USDT_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "approve",
          args: [STAKING_ADDRESS, amountWei],
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

      const minEwcOut = await getInternalMinEwcOut(amountWei);

      let depositHash;

      if (investmentType === "self") {
        depositHash = await writeContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: "deposit",
          args: [amountWei, minEwcOut],
        });
      } else {
        depositHash = await writeContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: "depositFor",
          args: [beneficiary, amountWei, minEwcOut],
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: depositHash,
      });

      if (receipt.status !== "success") {
        throw new Error("Staking transaction failed.");
      }

      setTxStatus("success");
      setAmount("");
      setQuote(null);

      await Promise.all([
        refetchBalance?.(),
        refetchAllowance?.(),
        loadInvestments(),
      ]);

      setTimeout(() => {
        setTxStatus("");
      }, 5000);
    } catch (error) {
      console.error("Staking error:", error);

      const message =
        error?.shortMessage || error?.message || "Transaction failed.";

      setTxStatus("");

      if (message.toLowerCase().includes("rejected")) {
        setTxError("Transaction rejected by wallet.");
      } else if (message.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
        setTxError("Price changed too much. Please try again.");
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

    if (raw) {
      storedUser = JSON.parse(raw);
    }
  } catch (error) {
    storedUser = {};
  }

  const layoutUser = {
    ...storedUser,
    wallet_address: address || "",
  };

  // =========================================================
  // COMING SOON — BEFORE DECEMBER 1
  // =========================================================

  if (stakingNotStarted) {
    return (
      <UserLayout
        user={layoutUser}
        title="EWC Staking"
        subtitle="Coming December 1, 2026"
      >
        <div className={comingStyles.page}>
          <div className={comingStyles.backgroundGlow} />

          <section className={comingStyles.hero}>
            <div className={comingStyles.badge}>
              <Sparkles size={15} />
              COMING SOON
            </div>

            <div className={comingStyles.iconWrapper}>
              <LockKeyhole size={36} />
            </div>

            <h1>
              EWC Staking
              <span> Opens Soon.</span>
            </h1>

            <p className={comingStyles.description}>
              A new chapter of Elevate World Community begins on December 1,
              2026.
              <br />
              Regular EWC staking will become available after the Private Sale
              concludes.
            </p>

            <div className={comingStyles.launchDate}>
              <CalendarDays size={19} />

              <div>
                <span>OFFICIAL STAKING LAUNCH</span>

                <strong>December 1, 2026</strong>
              </div>
            </div>

            <div className={comingStyles.countdownSection}>
              <div className={comingStyles.countdownHeading}>
                <Clock3 size={18} />
                <span>STAKING BEGINS IN</span>
              </div>

              <div className={comingStyles.countdownGrid}>
                {[
                  ["DAYS", countdown.days],
                  ["HOURS", countdown.hours],
                  ["MINUTES", countdown.minutes],
                  ["SECONDS", countdown.seconds],
                ].map(([label, value]) => (
                  <div className={comingStyles.countdownBox} key={label}>
                    <strong>{pad(value)}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={comingStyles.infoGrid}>
              <div className={comingStyles.infoCard}>
                <Coins size={22} />
                <span>MINIMUM STAKING</span>
                <strong>$25 USDT</strong>
              </div>

              <div className={comingStyles.infoCard}>
                <Wallet size={22} />
                <span>MAXIMUM STAKING</span>
                <strong>$5,000 USDT</strong>
              </div>

              <div className={comingStyles.infoCard}>
                <ShieldCheck size={22} />
                <span>NETWORK</span>
                <strong>BNB Smart Chain</strong>
              </div>
            </div>

            <div className={comingStyles.privateSaleCard}>
              <div className={comingStyles.privateSaleContent}>
                <div className={comingStyles.saleBadge}>EWC PRIVATE SALE</div>

                <h2>Don't Want to Wait?</h2>

                <p>
                  Participate in the EWC Private Sale and secure your allocation
                  at a fixed price of $0.01 per EWC, with exclusive tier-based
                  bonuses.
                </p>

                <div className={comingStyles.saleHighlights}>
                  <span>✓ $0.01 per EWC</span>

                  <span>✓ Up to 100% Bonus</span>

                  <span>✓ Starting from $10</span>
                </div>
              </div>

              <Link to="/presale" className={comingStyles.saleButton}>
                Explore Private Sale
                <ArrowRight size={18} />
              </Link>
            </div>

            <div className={comingStyles.footerNote}>
              <ShieldCheck size={16} />

              <span>
                Regular staking opens automatically on December 1, 2026 at 00:00
                UTC.
              </span>
            </div>
          </section>
        </div>
      </UserLayout>
    );
  }

  // =========================================================
  // REGULAR STAKING — DECEMBER 1 ONWARD
  // =========================================================

  let buttonText = "Enter Staking Amount";

  if (!isConnected) {
    buttonText = "Connect Wallet";
  } else if (validAmount && !hasEnoughBalance) {
    buttonText = "Insufficient USDT";
  } else if (validAmount && needsApproval) {
    buttonText = `Approve & Stake ${formatUsd(amountNum)}`;
  } else if (validAmount) {
    buttonText = `Stake ${formatUsd(amountNum)}`;
  }

  const actionDisabled =
    transactionBusy ||
    (isConnected &&
      (!validAmount ||
        !hasEnoughBalance ||
        !quote ||
        quoteLoading ||
        accountChecking ||
        !beneficiaryMember));

  return (
    <UserLayout user={layoutUser} title="Staking" subtitle="Invest in EWC">
      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>EWC STAKING</span>

          <h2>Stake EWC</h2>

          <p>
            Deposit USDT and receive an EWC allocation based on the current EWC
            market price.
          </p>
        </div>

        <div className={styles.rangeBadge}>
          <ShieldCheck size={16} />${MIN_DEPOSIT} — $
          {MAX_DEPOSIT.toLocaleString()}
        </div>
      </section>

      <section className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <Wallet size={20} />

          <div>
            <span>Available USDT</span>

            <strong>
              {isConnected
                ? `${formatNumber(balance, 2)} USDT`
                : "Connect wallet"}
            </strong>
          </div>
        </div>

        <div className={styles.infoCard}>
          <Coins size={20} />

          <div>
            <span>EWC Allocation</span>

            <strong>
              {quote ? `${formatNumber(quote.allocation)} EWC` : "—"}
            </strong>
          </div>
        </div>

        <div className={styles.infoCard}>
          <ShieldCheck size={20} />

          <div>
            <span>Staking Limits</span>

            <strong>
              ${MIN_DEPOSIT} — ${MAX_DEPOSIT.toLocaleString()}
            </strong>
          </div>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>STAKE</span>

              <h3>Stake EWC</h3>
            </div>

            <span className={styles.balance}>
              Balance: {isConnected ? `${formatNumber(balance, 2)} USDT` : "—"}
            </span>
          </div>

          <div className={styles.investForSection}>
            <label className={styles.investForLabel}>Staking For</label>

            <div className={styles.investForTabs}>
              <button
                type="button"
                className={
                  investmentType === "self" ? styles.activeInvestFor : ""
                }
                onClick={() => setInvestmentType("self")}
                disabled={transactionBusy}
              >
                My Account
              </button>

              <button
                type="button"
                className={
                  investmentType === "other" ? styles.activeInvestFor : ""
                }
                onClick={() => setInvestmentType("other")}
                disabled={transactionBusy}
              >
                Other Account
              </button>
            </div>
          </div>

          {investmentType === "other" && (
            <div className={styles.beneficiarySection}>
              <label>Account Wallet Address</label>

              <div className={styles.beneficiaryInputRow}>
                <input
                  type="text"
                  value={beneficiaryAddress}
                  onChange={handleBeneficiaryChange}
                  placeholder="0x..."
                  disabled={transactionBusy || accountChecking}
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
            <div className={styles.accountChecking}>Verifying account...</div>
          )}

          {accountError && (
            <div className={styles.errorBox}>
              <AlertCircle size={15} />
              <span>{accountError}</span>
            </div>
          )}

          {beneficiaryMember && (
            <div className={styles.verifiedAccount}>
              <div className={styles.verifiedIcon}>
                <CheckCircle2 size={18} />
              </div>

              <div className={styles.verifiedDetails}>
                <span>Account Verified</span>

                <strong>{beneficiaryMember.name}</strong>

                <div className={styles.verifiedMeta}>
                  <span>User ID: {beneficiaryMember.user_id}</span>

                  <span>
                    {beneficiaryMember.activated
                      ? "Active Account"
                      : "Account Not Yet Activated"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className={styles.inputHeader}>
            <label>Staking Amount</label>

            <button type="button" onClick={setMax} disabled={transactionBusy}>
              MAX
            </button>
          </div>

          <div
            className={`${styles.amountBox} ${
              validAmount ? styles.validAmount : ""
            }`}
          >
            <span className={styles.dollar}>$</span>

            <input
              type="number"
              value={amount}
              min={MIN_DEPOSIT}
              max={MAX_DEPOSIT}
              step="0.01"
              placeholder="25"
              onChange={handleAmountChange}
              disabled={transactionBusy}
            />

            <span className={styles.usdtBadge}>USDT</span>
          </div>

          <div className={styles.limits}>
            <span>
              Minimum <strong>${MIN_DEPOSIT}</strong>
            </span>

            <span>
              Maximum <strong>${MAX_DEPOSIT.toLocaleString()}</strong>
            </span>
          </div>

          <div className={styles.presets}>
            {[25, 100, 250, 500, 1000, 5000].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => selectPreset(value)}
                disabled={transactionBusy}
                className={amountNum === value ? styles.activePreset : ""}
              >
                ${value.toLocaleString()}
              </button>
            ))}
          </div>

          <div className={styles.outputBox}>
            <div>
              <span>EWC Allocation</span>

              <strong>
                {quoteLoading && validAmount
                  ? "Calculating..."
                  : quote
                    ? `${formatNumber(quote.allocation)} EWC`
                    : "0 EWC"}
              </strong>
            </div>

            <Coins size={24} />
          </div>

          {quote && (
            <div className={styles.quoteMeta}>
              <span>Current EWC Price</span>

              <strong>${formatNumber(quote.price, 6)}</strong>
            </div>
          )}

          {amountNum > 0 && amountNum < MIN_DEPOSIT && (
            <div className={styles.errorBox}>
              <AlertCircle size={15} />
              Minimum staking is ${MIN_DEPOSIT}.
            </div>
          )}

          {amountNum > MAX_DEPOSIT && (
            <div className={styles.errorBox}>
              <AlertCircle size={15} />
              Maximum staking is ${MAX_DEPOSIT.toLocaleString()}.
            </div>
          )}

          {isConnected && validAmount && !hasEnoughBalance && (
            <div className={styles.errorBox}>
              <AlertCircle size={15} />
              Insufficient USDT balance.
            </div>
          )}

          {txError && (
            <div className={styles.errorBox}>
              <AlertCircle size={15} />
              {txError}
            </div>
          )}

          {txStatus === "success" && (
            <div className={styles.successBox}>
              <CheckCircle2 size={16} />
              Staking successful.
            </div>
          )}

          <button
            type="button"
            className={styles.investButton}
            onClick={handleInvest}
            disabled={actionDisabled}
          >
            {txStatus === "approving"
              ? "Approving USDT..."
              : txStatus === "investing"
                ? "Confirming Staking..."
                : buttonText}
          </button>

          <p className={styles.securityText}>
            <ShieldCheck size={14} />
            Transaction is executed on BNB Smart Chain.
          </p>
        </div>

        <aside className={styles.panel}>
          <span className={styles.eyebrow}>SUMMARY</span>

          <h3 className={styles.summaryTitle}>Staking Summary</h3>

          <div className={styles.summaryRows}>
            <div>
              <span>Staking For</span>

              <strong>
                {beneficiaryMember
                  ? `${beneficiaryMember.name} (${beneficiaryMember.user_id})`
                  : investmentType === "self"
                    ? "My Account"
                    : "Not verified"}
              </strong>
            </div>

            <div>
              <span>You Stake</span>
              <strong>{formatUsd(amountNum)}</strong>
            </div>

            <div>
              <span>EWC Price</span>

              <strong>
                {quote ? `$${formatNumber(quote.price, 6)}` : "—"}
              </strong>
            </div>

            <div>
              <span>EWC Allocation</span>

              <strong className={styles.gold}>
                {quote ? `${formatNumber(quote.allocation)} EWC` : "—"}
              </strong>
            </div>

            <div>
              <span>USDT Approval</span>

              <strong>
                {validAmount ? (needsApproval ? "Required" : "Ready") : "—"}
              </strong>
            </div>

            <div>
              <span>Network</span>
              <strong>BNB Smart Chain</strong>
            </div>
          </div>

          <div className={styles.quoteNotice}>
            <Coins size={18} />

            <div>
              <strong>Live EWC Price</strong>

              <span>
                Your EWC allocation is calculated from your full USDT deposit
                value.
              </span>
            </div>
          </div>
        </aside>
      </section>

      <section className={`${styles.panel} ${styles.historyPanel}`}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>HISTORY</span>

            <h3>My Staking</h3>
          </div>
        </div>

        {historyLoading ? (
          <div className={styles.emptyState}>Loading staking...</div>
        ) : historyError ? (
          <div className={styles.emptyState}>
            <AlertCircle size={26} />

            <strong>Unable to load staking</strong>

            <span>{historyError}</span>
          </div>
        ) : investments.length === 0 ? (
          <div className={styles.emptyState}>
            <Coins size={26} />

            <strong>No staking yet</strong>

            <span>Your staking history will appear here.</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Staking</th>
                  <th>EWC Price</th>
                  <th>EWC Allocation</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {investments.map((item, index) => {
                  const date = item.createdOn
                    ? new Date(item.createdOn).toLocaleString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";

                  return (
                    <tr key={item.id}>
                      <td>#{investments.length - index}</td>

                      <td>{date}</td>

                      <td>{formatUsd(item.amount)}</td>

                      <td>${formatNumber(item.ewcPrice, 6)}</td>

                      <td>{formatNumber(item.ewcAllocation)} EWC</td>

                      <td>
                        <span className={styles.statusSuccess}>Completed</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </UserLayout>
  );
};

export default Investment;
