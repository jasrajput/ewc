/* eslint-disable no-unused-vars */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, usePublicClient } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { AlertCircle, CheckCircle2, Coins, ShieldCheck, Wallet } from "lucide-react";

import { useUSDTBalance, useUSDTAllowance, useContractWrite } from "../../hooks/useContract";
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

const PREVIEW_SLIPPAGE_BPS = 150n; // 1.5%
const TX_SLIPPAGE_BPS = 500n; // 5%
const BPS = 10000n;

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

  const publicClient = usePublicClient();

  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");
  const [investments, setInvestments] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { data: usdtBalance, refetch: refetchBalance } = useUSDTBalance(address);
  const { data: allowance, refetch: refetchAllowance } = useUSDTAllowance(address);
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
  // PANCAKESWAP QUOTE
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

        const amounts = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [amountWei, [USDT_ADDRESS, TOKEN_ADDRESS]],
        });

        const expectedRaw = amounts[1];
        const minimumRaw =
          expectedRaw - (expectedRaw * PREVIEW_SLIPPAGE_BPS) / BPS;

        setQuote({
          expectedRaw,
          minimumRaw,
          expected: Number(formatUnits(expectedRaw, EWC_DECIMALS)),
          minimum: Number(formatUnits(minimumRaw, EWC_DECIMALS)),
        });
      } catch (error) {
        console.error("Quote error:", error);
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    },
    [publicClient],
  );

  useEffect(() => {
    const timer = setTimeout(() => fetchQuote(amountNum), 350);
    return () => clearTimeout(timer);
  }, [amountNum, fetchQuote]);

  // =========================================================
  // INVESTMENT HISTORY
  // =========================================================

  const loadInvestments = useCallback(async () => {
    if (!address || !publicClient) {
      setInvestments([]);
      return;
    }

    setHistoryLoading(true);

    try {
      const data = await publicClient.readContract({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: "getUserInvestments",
        args: [address],
      });

      setInvestments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Investment history error:", error);
      setInvestments([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [address, publicClient]);

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

    const available = Math.min(balance, MAX_DEPOSIT);

    if (available < MIN_DEPOSIT) {
      setTxError(`Minimum investment is $${MIN_DEPOSIT}.`);
      return;
    }

    setAmount(String(available));
    setTxError("");
  };

  // =========================================================
  // INVEST
  // =========================================================

  const handleInvest = async () => {
    setTxError("");

    if (!isConnected || !address) {
      setTxError("Please connect your wallet first.");
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

    try {
      const amountWei = parseUnits(amount, USDT_DECIMALS);

      // Always read a fresh balance before sending the transaction.
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

      // Always read fresh allowance.
      const freshAllowance = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: TOKEN_ABI,
        functionName: "allowance",
        args: [address, STAKING_ADDRESS],
      });

      // Approve only when necessary.
      if (freshAllowance < amountWei) {
        setTxStatus("approving");

        const approvalHash = await writeContract({
          address: USDT_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "approve",
          args: [STAKING_ADDRESS, amountWei],
        });

        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        await refetchAllowance?.();
      }

      setTxStatus("investing");

      // Fresh quote immediately before deposit.
      const freshAmounts = await publicClient.readContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountWei, [USDT_ADDRESS, TOKEN_ADDRESS]],
      });

      const expectedRaw = freshAmounts[1];
      const minTokenOut = expectedRaw - (expectedRaw * TX_SLIPPAGE_BPS) / BPS;

      const depositHash = await writeContract({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: "deposit",
        args: [amountWei, minTokenOut],
        gas: 9000000n,
      });

      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      setTxStatus("success");
      setAmount("");
      setQuote(null);

      await Promise.all([
        refetchBalance?.(),
        refetchAllowance?.(),
        loadInvestments(),
      ]);

      setTimeout(() => setTxStatus(""), 3000);
    } catch (error) {
      console.error("Investment error:", error);

      const message = error?.shortMessage || error?.message || "Transaction failed.";
      setTxStatus("");

      if (message.toLowerCase().includes("rejected")) {
        setTxError("Transaction rejected.");
      } else if (message.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
        setTxError("Price changed too much. Please try again.");
      } else if (message.includes("Register first")) {
        setTxError("Register first before investing.");
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
      localStorage.getItem("ewc_user") ||
      sessionStorage.getItem("ewc_user");

    if (raw) storedUser = JSON.parse(raw);
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

  if (!isConnected) buttonText = "Connect Wallet";
  else if (validAmount && !hasEnoughBalance) buttonText = "Insufficient USDT";
  else if (validAmount && needsApproval) buttonText = `Approve & Invest ${formatUsd(amountNum)}`;
  else if (validAmount) buttonText = `Invest ${formatUsd(amountNum)}`;

  const actionDisabled =
    isConnected &&
    (!validAmount || !hasEnoughBalance || !quote || quoteLoading || transactionBusy);

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <UserLayout user={layoutUser} title="Investment" subtitle="Invest in EWC">
      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>EWC INVESTMENT</span>
          <h2>Invest in EWC</h2>
          <p>Invest USDT and receive EWC based on the current PancakeSwap quote.</p>
        </div>

        <div className={styles.rangeBadge}>
          <ShieldCheck size={16} />
          ${MIN_DEPOSIT} — ${MAX_DEPOSIT.toLocaleString()}
        </div>
      </section>

      {/* TOP INFO */}

      <section className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <Wallet size={20} />
          <div>
            <span>Available USDT</span>
            <strong>{formatNumber(balance, 2)} USDT</strong>
          </div>
        </div>

        <div className={styles.infoCard}>
          <Coins size={20} />
          <div>
            <span>Expected EWC</span>
            <strong>{quote ? `${formatNumber(quote.expected)} EWC` : "—"}</strong>
          </div>
        </div>

        <div className={styles.infoCard}>
          <ShieldCheck size={20} />
          <div>
            <span>Investment Limits</span>
            <strong>$25 — $5,000</strong>
          </div>
        </div>
      </section>

      {/* MAIN AREA */}

      <section className={styles.mainGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>INVEST</span>
              <h3>Make an Investment</h3>
            </div>
            <span className={styles.balance}>Balance: {formatNumber(balance, 2)} USDT</span>
          </div>

          <div className={styles.inputHeader}>
            <label>Investment Amount</label>
            <button type="button" onClick={setMax} disabled={transactionBusy}>MAX</button>
          </div>

          <div className={`${styles.amountBox} ${validAmount ? styles.validAmount : ""}`}>
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
            <span>Minimum <strong>$25</strong></span>
            <span>Maximum <strong>$5,000</strong></span>
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

          {/* TOKEN OUTPUT */}

          <div className={styles.outputBox}>
            <div>
              <span>You receive</span>

              <strong>
                {quoteLoading && validAmount
                  ? "Fetching quote..."
                  : quote
                    ? `${formatNumber(quote.expected)} EWC`
                    : "0 EWC"}
              </strong>
            </div>

            <Coins size={24} />
          </div>

          {quote && (
            <div className={styles.quoteMeta}>
              <span>Minimum received</span>
              <strong>{formatNumber(quote.minimum)} EWC</strong>
            </div>
          )}

          {amountNum > 0 && amountNum < MIN_DEPOSIT && (
            <div className={styles.errorBox}>
              <AlertCircle size={15} />
              Minimum investment is ${MIN_DEPOSIT}.
            </div>
          )}

          {amountNum > MAX_DEPOSIT && (
            <div className={styles.errorBox}>
              <AlertCircle size={15} />
              Maximum investment is ${MAX_DEPOSIT.toLocaleString()}.
            </div>
          )}

          {validAmount && !hasEnoughBalance && (
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

          <button
            type="button"
            className={styles.investButton}
            onClick={handleInvest}
            disabled={actionDisabled}
          >
            {transactionBusy && <span className={styles.spinner} />}
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

        {/* SUMMARY */}

        <aside className={styles.panel}>
          <span className={styles.eyebrow}>SUMMARY</span>
          <h3 className={styles.summaryTitle}>Investment Summary</h3>

          <div className={styles.summaryRows}>
            <div>
              <span>You invest</span>
              <strong>{formatUsd(amountNum)}</strong>
            </div>

            <div>
              <span>You receive</span>
              <strong className={styles.gold}>
                {quote ? `${formatNumber(quote.expected)} EWC` : "—"}
              </strong>
            </div>

            <div>
              <span>Minimum received</span>
              <strong>{quote ? `${formatNumber(quote.minimum)} EWC` : "—"}</strong>
            </div>

            <div>
              <span>USDT approval</span>
              <strong>{validAmount ? (needsApproval ? "Required" : "Ready") : "—"}</strong>
            </div>

            <div>
              <span>Network</span>
              <strong>BNB Smart Chain</strong>
            </div>
          </div>

          <div className={styles.quoteNotice}>
            <Coins size={18} />
            <div>
              <strong>Live PancakeSwap Quote</strong>
              <span>A fresh quote is fetched again immediately before investment.</span>
            </div>
          </div>
        </aside>
      </section>

      {/* HISTORY */}

      <section className={`${styles.panel} ${styles.historyPanel}`}>
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
        ) : investments.length === 0 ? (
          <div className={styles.emptyState}>
            <Coins size={26} />
            <strong>No investments yet</strong>
            <span>Your investment history will appear here.</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Investment</th>
                  <th>EWC</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {investments.map((item, index) => {
                  const invested = Number(formatUnits(item.amount || 0n, USDT_DECIMALS));
                  const tokenRaw = item.tokenAmount ?? item.ewcAmount ?? item.tokens;
                  const tokenAmount =
                    tokenRaw !== undefined && tokenRaw !== null
                      ? Number(formatUnits(tokenRaw, EWC_DECIMALS))
                      : null;

                  const timestamp = Number(item.depositTime || item.timestamp || 0);
                  const date = timestamp
                    ? new Date(timestamp * 1000).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—";

                  return (
                    <tr key={index}>
                      <td>#{index + 1}</td>
                      <td>{date}</td>
                      <td>{formatUsd(invested)}</td>
                      <td>{tokenAmount !== null ? `${formatNumber(tokenAmount)} EWC` : "—"}</td>
                      <td><span className={styles.activeStatus}>Active</span></td>
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