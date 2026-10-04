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
} from "lucide-react";
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

const MIN_DEPOSIT = 25;
const MAX_DEPOSIT = 5000;

const USDT_DECIMALS = 18;
const EWC_DECIMALS = 18;

const TX_SLIPPAGE_BPS = 500n;
const BPS = 10000n;

/*
 * IMPORTANT:
 *
 * Protocol routing is intentionally NOT shown anywhere in the member UI.
 *
 * Member model:
 *
 * 100% USDT investment
 *          ↓
 * EWC allocation based on 100% investment value
 *
 * The protocol performs its internal treasury / commission / market
 * operations separately.
 */

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

const Investment = () => {
  const connection = useConnection();
  const address = connection.address;
  const isConnected = connection.status === "connected";

  const { open } = useWeb3Modal();
  const publicClient = usePublicClient();

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

  const { data: usdtBalance, refetch: refetchBalance } =
    useUSDTBalance(address);

  const { data: allowance, refetch: refetchAllowance } =
    useUSDTAllowance(address);

  const { writeContract } = useContractWrite();

  const amountNum = Number(amount) || 0;

  const balance = useMemo(() => {
    if (usdtBalance === undefined || usdtBalance === null) return 0;

    return Number(formatUnits(usdtBalance, USDT_DECIMALS));
  }, [usdtBalance]);

  const allowanceAmount = useMemo(() => {
    if (allowance === undefined || allowance === null) return 0;

    return Number(formatUnits(allowance, USDT_DECIMALS));
  }, [allowance]);

  const validAmount = amountNum >= MIN_DEPOSIT && amountNum <= MAX_DEPOSIT;

  const hasEnoughBalance = amountNum <= balance;

  const needsApproval = validAmount && allowanceAmount < amountNum;

  const transactionBusy = txStatus === "approving" || txStatus === "investing";

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

  // =========================================================
  // MEMBER EWC ALLOCATION
  // =========================================================

  /*
   * This is the ONLY quote shown to the member.
   *
   * previewEwcAllocation() calculates allocation from the full
   * USDT investment.
   *
   * Example:
   *
   * $1,000
   * EWC = $0.05
   *
   * Allocation = 20,000 EWC
   */

  const fetchQuote = useCallback(
    async (value) => {
      if (!publicClient || value < MIN_DEPOSIT || value > MAX_DEPOSIT) {
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

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchQuote(amountNum);
    }, 350);

    return () => clearTimeout(timer);
  }, [amountNum, fetchQuote]);

  // =========================================================
  // INVESTMENT HISTORY
  // =========================================================

  const loadInvestments = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");

      const response = await api.get("/investment/history");

      console.log(response.data);
      if (response.data?.success) {
        setInvestments(response.data.investments || []);
      } else {
        setInvestments([]);
      }
    } catch (error) {
      console.error("Investment history error:", error);
      setInvestments([]);
      setHistoryError(
        error?.response?.data?.message || "Unable to load investment history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvestments();
  }, [loadInvestments]);

  // =========================================================
  // INPUT
  // =========================================================

  const handleAmountChange = (e) => {
    const value = e.target.value;

    if (value === "") {
      setAmount("");
      setTxError("");
      return;
    }

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
      setTxError(`Minimum investment is $${MIN_DEPOSIT}.`);

      return;
    }

    setAmount(String(available));

    setTxError("");
  };

  // =========================================================
  // INTERNAL TRANSACTION PROTECTION
  // =========================================================

  /*
   * This value is NOT shown to the member.
   *
   * EWCInvestment.deposit() requires minEwcOut for its own
   * internal PancakeSwap transaction.
   *
   * This calculation exists ONLY so the transaction can safely
   * execute. It has nothing to do with the member's displayed
   * EWC allocation.
   */

  const getInternalMinEwcOut = async (amountWei) => {
    /*
     * Keep this synchronized with EWCInvestment's internal
     * EWC_PURCHASE_BPS.
     *
     * This is transaction plumbing only.
     */

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
  // INVEST
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

  const handleBeneficiaryChange = (e) => {
    setBeneficiaryAddress(e.target.value);
    setBeneficiaryMember(null);
    setAccountError("");
  };

  const handleInvest = async () => {
    setTxError("");

    if (!isConnected || !address) {
      open();
      return;
    }

    if (!publicClient) {
      setTxError("Blockchain connection is not ready.");
      return;
    }

    if (amountNum < MIN_DEPOSIT) {
      setTxError(`Minimum investment is $${MIN_DEPOSIT}.`);
      return;
    }

    if (amountNum > MAX_DEPOSIT) {
      setTxError(`Maximum investment is $${MAX_DEPOSIT.toLocaleString()}.`);
      return;
    }

    let beneficiary;

    if (investmentType === "self") {
      beneficiary = address;
    } else {
      beneficiary = beneficiaryAddress.trim();

      if (!/^0x[a-fA-F0-9]{40}$/.test(beneficiary)) {
        setTxError("Please enter a valid beneficiary wallet address.");
        return;
      }
    }

    if (!beneficiaryMember) {
      if (investmentType === "self") {
        setTxError(
          "Your connected wallet is not registered with your account. Please update your wallet address first.",
        );
      } else {
        setTxError("Please verify the beneficiary account before investing.");
      }

      return;
    }

    try {
      // Re-verify beneficiary immediately before transaction.
      const verifiedMember = await verifyInvestmentAccount(beneficiary);

      if (!verifiedMember) {
        setTxError(
          investmentType === "self"
            ? "Your connected wallet is not registered with your account. Please update your wallet address first."
            : "The beneficiary account could not be verified.",
        );
        return;
      }

      const amountWei = parseUnits(amount, USDT_DECIMALS);

      // Connected wallet is always the payer.
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

        await publicClient.waitForTransactionReceipt({
          hash: approvalHash,
        });

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
          gas: 9000000n,
        });
      } else {
        depositHash = await writeContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: "depositFor",
          args: [beneficiary, amountWei, minEwcOut],
          gas: 9000000n,
        });
      }

      await publicClient.waitForTransactionReceipt({
        hash: depositHash,
      });

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
      }, 3000);
    } catch (error) {
      console.error("Investment error:", error);

      const message =
        error?.shortMessage || error?.message || "Transaction failed.";

      setTxStatus("");

      if (message.toLowerCase().includes("rejected")) {
        setTxError("Transaction rejected.");
      } else if (message.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
        setTxError("Price changed too much. Please try again.");
      } else {
        setTxError(message);
      }
    }
  };

  // =========================================================
  // LAYOUT USER
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
  // ACTION BUTTON
  // =========================================================

  let buttonText = "Enter Investment Amount";

  if (!isConnected) {
    buttonText = "Connect Wallet";
  } else if (validAmount && !hasEnoughBalance) {
    buttonText = "Insufficient USDT";
  } else if (validAmount && needsApproval) {
    buttonText = `Approve & Invest ${formatUsd(amountNum)}`;
  } else if (validAmount) {
    buttonText = `Invest ${formatUsd(amountNum)}`;
  }

  /*
   * Important:
   * disconnected button stays enabled so it can open Web3Modal.
   */

  const actionDisabled =
    isConnected &&
    (!validAmount ||
      !hasEnoughBalance ||
      !quote ||
      quoteLoading ||
      transactionBusy);

  // =========================================================
  // PAGE
  // =========================================================

  return (
  <UserLayout
    user={layoutUser}
    title="Investment"
    subtitle="Invest in EWC"
  >
    <section className={styles.pageHeader}>
      <div>
        <span className={styles.eyebrow}>EWC INVESTMENT</span>
        <h2>Invest in EWC</h2>
        <p>
          Invest USDT and receive an EWC allocation based on the current EWC
          market price.
        </p>
      </div>

      <div className={styles.rangeBadge}>
        <ShieldCheck size={16} />
        ${MIN_DEPOSIT} — ${MAX_DEPOSIT.toLocaleString()}
      </div>
    </section>

    {/* =====================================================
        TOP INFO
    ===================================================== */}

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
          <span>Investment Limits</span>
          <strong>
            ${MIN_DEPOSIT} — ${MAX_DEPOSIT.toLocaleString()}
          </strong>
        </div>
      </div>
    </section>

    {/* =====================================================
        MAIN
    ===================================================== */}

    <section className={styles.mainGrid}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>INVEST</span>
            <h3>Make an Investment</h3>
          </div>

          <span className={styles.balance}>
            Balance:{" "}
            {isConnected ? `${formatNumber(balance, 2)} USDT` : "—"}
          </span>
        </div>

        {/* =================================================
            INVESTMENT BENEFICIARY
        ================================================= */}

        <div className={styles.investForSection}>
          <label className={styles.investForLabel}>
            Investment For
          </label>

          <div className={styles.investForTabs}>
            <button
              type="button"
              className={
                investmentType === "self"
                  ? styles.activeInvestFor
                  : ""
              }
              onClick={() => setInvestmentType("self")}
              disabled={transactionBusy}
            >
              My Account
            </button>

            <button
              type="button"
              className={
                investmentType === "other"
                  ? styles.activeInvestFor
                  : ""
              }
              onClick={() => setInvestmentType("other")}
              disabled={transactionBusy}
            >
              Other Account
            </button>
          </div>
        </div>

        {/* =================================================
            OTHER ACCOUNT ADDRESS
        ================================================= */}

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
                {accountChecking ? (
                  <>
                    <span className={styles.smallSpinner} />
                    Checking
                  </>
                ) : (
                  "Verify"
                )}
              </button>
            </div>
          </div>
        )}

        {/* =================================================
            SELF ACCOUNT CHECKING
        ================================================= */}

        {accountChecking && investmentType === "self" && (
          <div className={styles.accountChecking}>
            <span className={styles.smallSpinner} />
            Verifying your account...
          </div>
        )}

        {/* =================================================
            ACCOUNT ERROR
        ================================================= */}

        {accountError && (
          <div className={styles.errorBox}>
            <AlertCircle size={15} />

            <span>
              {investmentType === "self"
                ? `${accountError} Please update your wallet address before investing.`
                : accountError}
            </span>
          </div>
        )}

        {/* =================================================
            VERIFIED ACCOUNT
        ================================================= */}

        {beneficiaryMember && (
          <div className={styles.verifiedAccount}>
            <div className={styles.verifiedIcon}>
              <CheckCircle2 size={18} />
            </div>

            <div className={styles.verifiedDetails}>
              <span>Account Verified</span>

              <strong>{beneficiaryMember.name}</strong>

              <div className={styles.verifiedMeta}>
                <span>
                  User ID: {beneficiaryMember.user_id}
                </span>

                <span>
                  {beneficiaryMember.activated
                    ? "Active Account"
                    : "Account Not Yet Activated"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* =================================================
            INVESTMENT AMOUNT
        ================================================= */}

        <div className={styles.inputHeader}>
          <label>Investment Amount</label>

          <button
            type="button"
            onClick={setMax}
            disabled={transactionBusy}
          >
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
            Maximum{" "}
            <strong>${MAX_DEPOSIT.toLocaleString()}</strong>
          </span>
        </div>

        <div className={styles.presets}>
          {[25, 100, 250, 500, 1000, 5000].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => selectPreset(value)}
              disabled={transactionBusy}
              className={
                amountNum === value ? styles.activePreset : ""
              }
            >
              ${value.toLocaleString()}
            </button>
          ))}
        </div>

        {/* =================================================
            MEMBER ALLOCATION
        ================================================= */}

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

            <strong>
              ${formatNumber(quote.price, 6)}
            </strong>
          </div>
        )}

        {/* =================================================
            VALIDATION ERRORS
        ================================================= */}

        {amountNum > 0 && amountNum < MIN_DEPOSIT && (
          <div className={styles.errorBox}>
            <AlertCircle size={15} />
            Minimum investment is ${MIN_DEPOSIT}.
          </div>
        )}

        {amountNum > MAX_DEPOSIT && (
          <div className={styles.errorBox}>
            <AlertCircle size={15} />
            Maximum investment is $
            {MAX_DEPOSIT.toLocaleString()}.
          </div>
        )}

        {isConnected &&
          validAmount &&
          !hasEnoughBalance && (
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
            Investment successful.
          </div>
        )}

        {/* =================================================
            ACTION
        ================================================= */}

        <button
          type="button"
          className={styles.investButton}
          onClick={handleInvest}
          disabled={actionDisabled}
        >
          {transactionBusy && (
            <span className={styles.spinner} />
          )}

          {!transactionBusy && <Wallet size={18} />}

          {txStatus === "approving"
            ? "Approving USDT..."
            : txStatus === "investing"
              ? "Confirming Investment..."
              : buttonText}
        </button>

        <p className={styles.securityText}>
          <ShieldCheck size={14} />
          Transaction is executed on BNB Smart Chain.
        </p>
      </div>

      {/* ===================================================
          SUMMARY
      =================================================== */}

      <aside className={styles.panel}>
        <span className={styles.eyebrow}>SUMMARY</span>

        <h3 className={styles.summaryTitle}>
          Investment Summary
        </h3>

        <div className={styles.summaryRows}>
          <div>
            <span>Investment For</span>

            <strong>
              {beneficiaryMember
                ? `${beneficiaryMember.name} (${beneficiaryMember.user_id})`
                : investmentType === "self"
                  ? "My Account"
                  : "Not verified"}
            </strong>
          </div>

          <div>
            <span>You invest</span>
            <strong>{formatUsd(amountNum)}</strong>
          </div>

          <div>
            <span>EWC Price</span>

            <strong>
              {quote
                ? `$${formatNumber(quote.price, 6)}`
                : "—"}
            </strong>
          </div>

          <div>
            <span>EWC Allocation</span>

            <strong className={styles.gold}>
              {quote
                ? `${formatNumber(quote.allocation)} EWC`
                : "—"}
            </strong>
          </div>

          <div>
            <span>USDT Approval</span>

            <strong>
              {validAmount
                ? needsApproval
                  ? "Required"
                  : "Ready"
                : "—"}
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
              Your EWC allocation is calculated from your full
              USDT investment value.
            </span>
          </div>
        </div>
      </aside>
    </section>

    {/* =====================================================
        HISTORY
    ===================================================== */}

    <section
      className={`${styles.panel} ${styles.historyPanel}`}
    >
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>HISTORY</span>
          <h3>My Investments</h3>
        </div>
      </div>

      {historyLoading ? (
        <div className={styles.emptyState}>
          <span className={styles.spinner} />
          Loading investments...
        </div>
      ) : historyError ? (
        <div className={styles.emptyState}>
          <AlertCircle size={26} />
          <strong>Unable to load investments</strong>
          <span>{historyError}</span>
        </div>
      ) : investments.length === 0 ? (
        <div className={styles.emptyState}>
          <Coins size={26} />
          <strong>No investments yet</strong>
          <span>
            Your investment history will appear here.
          </span>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Investment</th>
                <th>EWC Price</th>
                <th>EWC Allocation</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {investments.map((item, index) => {
                const date = item.createdOn
                  ? new Date(
                      item.createdOn,
                    ).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                return (
                  <tr key={item.id}>
                    <td>
                      #{investments.length - index}
                    </td>

                    <td>{date}</td>

                    <td>
                      {formatUsd(item.amount)}
                    </td>

                    <td>
                      $
                      {formatNumber(
                        item.ewcPrice,
                        6,
                      )}
                    </td>

                    <td>
                      {formatNumber(
                        item.ewcAllocation,
                      )}{" "}
                      EWC
                    </td>

                    <td>
                      <span
                        className={
                          styles.statusSuccess
                        }
                      >
                        Completed
                      </span>
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
