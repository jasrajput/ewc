import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useConnection,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import {
  parseEther,
  formatEther,
  formatUnits,
} from "viem";
import {
  BanknoteArrowDown,
  CircleDollarSign,
  Coins,
  ShieldCheck,
  Wallet,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";

import {
  STAKING_ADDRESS,
  STAKING_ABI as PAYOUT_ABI,
  USDT_ADDRESS,
  TOKEN_ADDRESS as EWC_ADDRESS,
} from "../../contracts/config";

import styles from "./Withdrawal.module.css";

const BSC_CHAIN_ID = 56;

const TOKEN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
  },
];

const Withdrawal = () => {
  const [info, setInfo] = useState(null);

  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [claiming, setClaiming] = useState(false);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  const [usdtBalance, setUsdtBalance] = useState("0");
  const [ewcBalance, setEwcBalance] = useState("0");

  const connection = useConnection();

  const address = connection.address;
  const chainId = connection.chainId;
  const isConnected =
    connection.status === "connected";

  const publicClient = usePublicClient();

  const { open } = useWeb3Modal();

  const {
    mutateAsync: writeContract,
  } = useWriteContract();

  const registeredWallet =
    info?.wallet || "";

  const walletMatches =
    !!address &&
    !!registeredWallet &&
    address.toLowerCase() ===
      registeredWallet.toLowerCase();

  /* =========================================================
   * WITHDRAWAL INFO
   * ========================================================= */

  const loadWithdrawalInfo =
    useCallback(async () => {
      try {
        setLoading(true);
        setError("");

        const response =
          await api.get(
            "/withdrawal/info",
          );

        setInfo(
          response.data.data,
        );
      } catch (err) {
        console.error(
          "Withdrawal info error:",
          err,
        );

        setError(
          err.response?.data
            ?.message ||
            "Unable to load withdrawal information.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadWithdrawalInfo();
  }, [loadWithdrawalInfo]);

  /* =========================================================
   * CONNECTED WALLET TOKEN BALANCES
   * ========================================================= */

  const loadWalletBalances =
    useCallback(async () => {
      if (
        !isConnected ||
        !address ||
        !publicClient
      ) {
        setUsdtBalance("0");
        setEwcBalance("0");
        return;
      }

      try {
        setBalanceLoading(true);

        /*
         * Read token decimals instead of assuming
         * both tokens use the same decimals.
         */

        const [
          usdtDecimals,
          ewcDecimals,
        ] = await Promise.all([
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

        const [
          rawUsdtBalance,
          rawEwcBalance,
        ] = await Promise.all([
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

        setUsdtBalance(
          formatUnits(
            rawUsdtBalance,
            Number(usdtDecimals),
          ),
        );

        setEwcBalance(
          formatUnits(
            rawEwcBalance,
            Number(ewcDecimals),
          ),
        );
      } catch (err) {
        console.error(
          "Wallet balance error:",
          err,
        );

        setUsdtBalance("0");
        setEwcBalance("0");
      } finally {
        setBalanceLoading(false);
      }
    }, [
      isConnected,
      address,
      publicClient,
    ]);

  useEffect(() => {
    loadWalletBalances();
  }, [loadWalletBalances]);

  /* =========================================================
   * CUMULATIVE VALUES
   * ========================================================= */

  const toWei = (value) => {
    try {
      return parseEther(
        String(value || 0),
      );
    } catch {
      return 0n;
    }
  };

  const cumulativeUsdtWei =
    useMemo(
      () =>
        toWei(
          info?.cumulativeUsdtIncome,
        ),
      [
        info?.cumulativeUsdtIncome,
      ],
    );

  const cumulativeRoiEwcWei =
    useMemo(
      () =>
        toWei(
          info?.cumulativeRoiEwc,
        ),
      [
        info?.cumulativeRoiEwc,
      ],
    );

  const usdtClaimedWei =
    useMemo(
      () =>
        toWei(
          info?.usdtClaimed,
        ),
      [info?.usdtClaimed],
    );

  const roiEwcClaimedWei =
    useMemo(
      () =>
        toWei(
          info?.roiEwcClaimed,
        ),
      [info?.roiEwcClaimed],
    );

  /* =========================================================
   * CLAIMABLE
   * ========================================================= */

  const claimableUsdtWei =
    cumulativeUsdtWei >
    usdtClaimedWei
      ? cumulativeUsdtWei -
        usdtClaimedWei
      : 0n;

  const claimableRoiEwcWei =
    cumulativeRoiEwcWei >
    roiEwcClaimedWei
      ? cumulativeRoiEwcWei -
        roiEwcClaimedWei
      : 0n;

  const claimableUsdt =
    Number(
      formatEther(
        claimableUsdtWei,
      ),
    );

  const claimableRoiEwc =
    Number(
      formatEther(
        claimableRoiEwcWei,
      ),
    );

  const usdtClaimed =
    Number(
      formatEther(
        usdtClaimedWei,
      ),
    );

  const roiEwcClaimed =
    Number(
      formatEther(
        roiEwcClaimedWei,
      ),
    );

  const hasClaimable =
    claimableUsdtWei > 0n ||
    claimableRoiEwcWei > 0n;

  /* =========================================================
   * FORMATTERS
   * ========================================================= */

  const formatUsd = (value) =>
    new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    ).format(
      Number(value || 0),
    );

  const formatEwc = (value) =>
    Number(
      value || 0,
    ).toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      },
    );

  const formatToken = (value) =>
    Number(
      value || 0,
    ).toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      },
    );

  const shortAddress = (
    wallet,
  ) => {
    if (!wallet) {
      return "Not available";
    }

    return `${wallet.slice(
      0,
      6,
    )}...${wallet.slice(-4)}`;
  };

  /* =========================================================
   * CLAIM
   * ========================================================= */

  const handleClaim =
    async () => {
      try {
        setError("");
        setStatus("");
        setTxHash("");

        if (!isConnected) {
          open();
          return;
        }

        if (!registeredWallet) {
          throw new Error(
            "Wallet address is not registered with this account.",
          );
        }

        if (!walletMatches) {
          throw new Error(
            "Connected wallet does not match your registered wallet.",
          );
        }

        if (
          chainId !==
          BSC_CHAIN_ID
        ) {
          open({
            view: "Networks",
          });

          return;
        }

        if (
          !info?.merkleAvailable
        ) {
          throw new Error(
            info?.merkleError ||
              "No earnings are currently available to claim.",
          );
        }

        if (
          !Array.isArray(
            info?.proof,
          )
        ) {
          throw new Error(
            "Unable to verify your withdrawal.",
          );
        }

        if (!hasClaimable) {
          throw new Error(
            "There is nothing new to claim.",
          );
        }

        if (!publicClient) {
          throw new Error(
            "Blockchain connection is not ready.",
          );
        }

        setClaiming(true);

        setStatus(
          "Please approve the transaction in your wallet.",
        );

        const hash =
          await writeContract({
            address:
              STAKING_ADDRESS,

            abi:
              PAYOUT_ABI,

            functionName:
              "claim",

            args: [
              cumulativeUsdtWei,
              cumulativeRoiEwcWei,
              info.proof,
            ],
          });

        setTxHash(hash);

        setStatus(
          "Transaction submitted. Waiting for blockchain confirmation.",
        );

        const receipt =
          await publicClient.waitForTransactionReceipt(
            {
              hash,
            },
          );

        if (
          receipt.status !==
          "success"
        ) {
          throw new Error(
            "Transaction failed on BNB Smart Chain.",
          );
        }

        const claimedParts =
          [];

        if (
          claimableUsdtWei >
          0n
        ) {
          claimedParts.push(
            `${formatUsd(
              claimableUsdt,
            )} USDT`,
          );
        }

        if (
          claimableRoiEwcWei >
          0n
        ) {
          claimedParts.push(
            `${formatEwc(
              claimableRoiEwc,
            )} EWC`,
          );
        }

        setStatus(
          `Claim successful: ${claimedParts.join(
            " + ",
          )}`,
        );

        /*
         * Refresh backend claim information
         * and actual connected wallet balances.
         */

        await Promise.all([
          loadWithdrawalInfo(),
          loadWalletBalances(),
        ]);
      } catch (err) {
        console.error(
          "Claim error:",
          err,
        );

        let message =
          "Claim failed.";

        if (
          err?.code === 4001
        ) {
          message =
            "Transaction rejected in wallet.";
        } else if (
          err?.shortMessage
        ) {
          message =
            err.shortMessage;
        } else if (
          err?.message
        ) {
          message =
            err.message;
        }

        setError(message);
      } finally {
        setClaiming(false);
      }
    };

  /* =========================================================
   * LOADING
   * ========================================================= */

  if (loading) {
    return (
      <UserLayout
        title="Withdrawal"
        subtitle="Claim your available earnings"
      >
        <div
          className={
            styles.loadingState
          }
        >
          Loading withdrawal
          information...
        </div>
      </UserLayout>
    );
  }

  /* =========================================================
   * UI
   * ========================================================= */

  return (
    <UserLayout
      title="Withdrawal"
      subtitle="Claim your available earnings"
    >
      <section
        className={
          styles.withdrawCard
        }
      >
        <div
          className={
            styles.cardHeader
          }
        >
          <div>
            <span
              className={
                styles.eyebrow
              }
            >
              AVAILABLE EARNINGS
            </span>

            <h2>
              Withdraw Earnings
            </h2>

            <p>
              Claim your available
              USDT earnings and EWC
              rewards directly to your
              registered wallet.
            </p>
          </div>

          <div
            className={
              styles.priceBox
            }
          >
            <span>
              Total Available
            </span>

            <strong>
              {formatUsd(
                claimableUsdt,
              )}
            </strong>

            <small>
              {formatEwc(
                claimableRoiEwc,
              )}{" "}
              EWC
            </small>
          </div>
        </div>

        {/* AVAILABLE TO CLAIM */}

        <div
          className={
            styles.claimHero
          }
        >
          <div
            className={
              styles.claimIcon
            }
          >
            <CircleDollarSign
              size={25}
            />
          </div>

          <div>
            <span>
              Available to Claim
            </span>

            <strong>
              {formatUsd(
                claimableUsdt,
              )}{" "}
              USDT
            </strong>

            <small>
              {formatEwc(
                claimableRoiEwc,
              )}{" "}
              EWC
            </small>
          </div>
        </div>

        {/* CLAIMABLE BREAKDOWN */}

        <div
          className={
            styles.statsGrid
          }
        >
          <div
            className={
              styles.stat
            }
          >
            <CircleDollarSign
              size={18}
            />

            <div>
              <span>
                USDT Earnings
              </span>

              <strong>
                {formatUsd(
                  claimableUsdt,
                )}
              </strong>
            </div>
          </div>

          <div
            className={
              styles.stat
            }
          >
            <Coins size={18} />

            <div>
              <span>
                EWC ROI
              </span>

              <strong>
                {formatEwc(
                  claimableRoiEwc,
                )}{" "}
                EWC
              </strong>
            </div>
          </div>

          <div
            className={
              styles.stat
            }
          >
            <ShieldCheck
              size={18}
            />

            <div>
              <span>
                Network
              </span>

              <strong>
                BNB Smart Chain
              </strong>
            </div>
          </div>
        </div>

        {/* WALLET BALANCES */}

        <div
          className={
            styles.statsGrid
          }
        >
          <div
            className={
              styles.stat
            }
          >
            <CircleDollarSign
              size={18}
            />

            <div>
              <span>
                USDT Balance
              </span>

              <strong>
                {!isConnected
                  ? "—"
                  : balanceLoading
                    ? "Loading..."
                    : `${formatToken(
                        usdtBalance,
                      )} USDT`}
              </strong>
            </div>
          </div>

          <div
            className={
              styles.stat
            }
          >
            <Coins size={18} />

            <div>
              <span>
                EWC Balance
              </span>

              <strong>
                {!isConnected
                  ? "—"
                  : balanceLoading
                    ? "Loading..."
                    : `${formatToken(
                        ewcBalance,
                      )} EWC`}
              </strong>
            </div>
          </div>

          <div
            className={
              styles.stat
            }
          >
            <Wallet size={18} />

            <div>
              <span>
                Wallet Status
              </span>

              <strong>
                {!isConnected
                  ? "Not Connected"
                  : walletMatches
                    ? "Verified"
                    : "Wallet Mismatch"}
              </strong>
            </div>
          </div>
        </div>

        {/* WALLET ADDRESSES */}

        <div
          className={
            styles.walletSection
          }
        >
          <div>
            <span>
              Registered Wallet
            </span>

            <strong>
              {shortAddress(
                registeredWallet,
              )}
            </strong>
          </div>

          <div>
            <span>
              Connected Wallet
            </span>

            <strong>
              {isConnected
                ? shortAddress(
                    address,
                  )
                : "Not connected"}
            </strong>
          </div>
        </div>

        {/* CLAIM HISTORY TOTALS */}

        <div
          className={
            styles.statsGrid
          }
        >
          <div
            className={
              styles.stat
            }
          >
            <BanknoteArrowDown
              size={18}
            />

            <div>
              <span>
                Claimed USDT
              </span>

              <strong>
                {formatUsd(
                  usdtClaimed,
                )}
              </strong>
            </div>
          </div>

          <div
            className={
              styles.stat
            }
          >
            <Coins size={18} />

            <div>
              <span>
                Claimed EWC
              </span>

              <strong>
                {formatEwc(
                  roiEwcClaimed,
                )}{" "}
                EWC
              </strong>
            </div>
          </div>

          <div
            className={
              styles.stat
            }
          >
            <ShieldCheck
              size={18}
            />

            <div>
              <span>
                Claim Status
              </span>

              <strong>
                {hasClaimable
                  ? "Available"
                  : "Up to Date"}
              </strong>
            </div>
          </div>
        </div>

        {/* WALLET WARNING */}

        {isConnected &&
          !walletMatches && (
            <div
              className={
                styles.warningBox
              }
            >
              Connected wallet does
              not match the wallet
              registered with this
              account.
            </div>
          )}

        {/* ERROR */}

        {error && (
          <div
            className={
              styles.errorBox
            }
          >
            <AlertCircle
              size={15}
            />

            <span>
              {error}
            </span>
          </div>
        )}

        {/* TRANSACTION STATUS */}

        {status && (
          <div
            className={`${styles.txStatus} ${
              status.startsWith(
                "Claim successful",
              )
                ? styles.txSuccess
                : styles.txPending
            }`}
          >
            <div
              className={
                styles.txStatusIcon
              }
            >
              {status.startsWith(
                "Claim successful",
              ) ? (
                <CheckCircle2
                  size={20}
                />
              ) : (
                <div
                  className={
                    styles.txSpinner
                  }
                />
              )}
            </div>

            <div
              className={
                styles.txStatusContent
              }
            >
              <strong>
                {status.startsWith(
                  "Claim successful",
                )
                  ? "Claim Successful"
                  : status.includes(
                        "approve",
                      )
                    ? "Wallet Confirmation Required"
                    : "Transaction Processing"}
              </strong>

              <span>
                {status}
              </span>
            </div>

            {txHash && (
              <a
                className={
                  styles.txLink
                }
                href={`https://bscscan.com/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View Transaction
                <span>↗</span>
              </a>
            )}
          </div>
        )}

        {/* CLAIM BUTTON */}

        <button
          className={
            styles.claimButton
          }
          onClick={
            handleClaim
          }
          disabled={
            claiming ||
            (isConnected &&
              (!walletMatches ||
                !info?.merkleAvailable ||
                !hasClaimable))
          }
        >
          <BanknoteArrowDown
            size={18}
          />

          {claiming
            ? "Processing..."
            : !isConnected
              ? "Connect Wallet & Claim"
              : hasClaimable
                ? "Claim Earnings"
                : "Nothing to Claim"}
        </button>

        <p
          className={
            styles.claimNote
          }
        >
          Direct, Rank and Salary
          earnings are paid in USDT.
          ROI rewards are paid in EWC.
        </p>
      </section>
    </UserLayout>
  );
};

export default Withdrawal;