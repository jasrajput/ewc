
import { useEffect, useState } from "react";
import {
  Wallet as WalletIcon,
  ShieldCheck,
  TriangleAlert,
  CheckCircle2,
  Link2,
} from "lucide-react";

import { isAddress, isAddressEqual } from "viem";
import { useAccount } from "wagmi";

import UserLayout from "../../components/layout/UserLayout";
import api from "../../services/api";
import styles from "./Wallet.module.css";

const Wallet = () => {
  // =========================================================
  // CONNECTED WALLET - WAGMI
  // =========================================================

  const {
    address: connectedAddress,
    isConnected,
    chainId,
  } = useAccount();

  // =========================================================
  // STATES
  // =========================================================

  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [manuallyEdited, setManuallyEdited] = useState(false);

  // =========================================================
  // LOAD ACCOUNT
  // =========================================================

  const loadAccount = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/account/profile");
      const data = response.data.data;

      setProfile(data);

      // Registered wallets must always show the
      // address saved in the database.
      if (data.walletRegistered && data.wallet) {
        setWallet(data.wallet);
      } else if (data.wallet) {
        // Preserve an existing unregistered draft.
        setWallet((previous) => previous || data.wallet);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to load wallet information."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  const walletRegistered = Boolean(profile?.walletRegistered);

  // =========================================================
  // DETECT CONNECTED WALLET
  // =========================================================

  useEffect(() => {
    if (
      loading ||
      walletRegistered ||
      manuallyEdited ||
      confirming ||
      !isConnected ||
      !connectedAddress
    ) {
      return;
    }

    // Automatically prefill only if no address was
    // already entered or loaded from the profile.
    setWallet((previous) => {
      if (previous?.trim()) {
        return previous;
      }

      return connectedAddress;
    });
  }, [
    loading,
    walletRegistered,
    manuallyEdited,
    confirming,
    isConnected,
    connectedAddress,
  ]);

  // =========================================================
  // CONNECTED WALLET HELPERS
  // =========================================================

  const hasConnectedWallet =
    isConnected && Boolean(connectedAddress);

  const isBscMainnet = chainId === 56;

  const isUsingConnectedWallet =
    hasConnectedWallet &&
    isAddress(wallet.trim()) &&
    isAddressEqual(wallet.trim(), connectedAddress);

  const useConnectedWallet = () => {
    if (!hasConnectedWallet) {
      setError("No wallet is currently connected.");
      return;
    }

    setWallet(connectedAddress);
    setManuallyEdited(false);
    setError("");
    setSuccess("");
  };

  // =========================================================
  // REQUEST CONFIRMATION
  // =========================================================

  const requestConfirmation = (e) => {
    e.preventDefault();

    if (saving) return;

    setError("");
    setSuccess("");

    const value = wallet.trim();

    if (!value) {
      setError("Enter your wallet address.");
      return;
    }

    if (!isAddress(value)) {
      setError("Enter a valid EVM wallet address.");
      return;
    }

    setWallet(value);
    setConfirming(true);
  };

  // =========================================================
  // REGISTER WALLET
  // =========================================================

  const registerWallet = async () => {
    if (saving || walletRegistered) {
      return;
    }

    const value = wallet.trim();

    if (!isAddress(value)) {
      setError("Invalid wallet address.");
      setConfirming(false);
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await api.put("/account/wallet", {
        wallet: value,
      });

      setConfirming(false);

      await loadAccount();

      setSuccess(
        response.data.message ||
        "Wallet registered successfully."
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to register wallet address."
      );

      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <UserLayout
        title="Wallet"
        subtitle="Manage your withdrawal wallet"
      >
        <div className={styles.loading}>
          Loading wallet information...
        </div>
      </UserLayout>
    );
  }

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <UserLayout
      title="Wallet"
      subtitle="Manage your withdrawal wallet"
    >
      <div className={styles.container}>
        <section className={styles.walletCard}>

          {/* =============================================== */}
          {/* HEADER */}
          {/* =============================================== */}

          <div className={styles.cardHeader}>
            <div className={styles.iconBox}>
              <WalletIcon size={22} />
            </div>

            <div>
              <h2>Withdrawal Wallet</h2>

              <p>
                This wallet will be used for your EWC
                presale investments and reward claims.
              </p>
            </div>
          </div>

          {/* =============================================== */}
          {/* ALREADY REGISTERED */}
          {/* =============================================== */}

          {walletRegistered ? (
            <>
              <div className={styles.registeredStatus}>
                <CheckCircle2 size={19} />

                <div>
                  <strong>Wallet Registered</strong>

                  <span>
                    Your wallet is permanently registered.
                  </span>
                </div>
              </div>

              <div className={styles.walletDisplay}>
                <span>Registered Wallet</span>

                <strong>{profile.wallet}</strong>
              </div>

              <div className={styles.lockedInfo}>
                <ShieldCheck size={18} />

                <p>
                  This wallet address cannot be changed.
                  It is used for EWC presale account
                  verification and reward entitlement.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* =========================================== */}
              {/* IMPORTANT WARNING */}
              {/* =========================================== */}

              <div className={styles.warning}>
                <TriangleAlert size={19} />

                <div>
                  <strong>Important</strong>

                  <p>
                    Your wallet can only be registered
                    once. Make sure the address is
                    correct before submitting it.
                    It cannot be changed later.
                  </p>
                </div>
              </div>

              {/* =========================================== */}
              {/* CONNECTED WALLET SUGGESTION */}
              {/* =========================================== */}

              {hasConnectedWallet && (
                <div
                  style={{
                    marginTop: "20px",
                    marginBottom: "20px",
                    padding: "18px",
                    borderRadius: "14px",
                    background: "rgba(212,175,55,0.06)",
                    border:
                      "1px solid rgba(212,175,55,0.30)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      marginBottom: "12px",
                      color: "#e9c45a",
                      fontWeight: 600,
                      fontSize: "15px",
                    }}
                  >
                    <Link2 size={19} />
                    Connected Wallet Detected
                  </div>

                  <p
                    style={{
                      color: "#aeb4bf",
                      fontSize: "13px",
                      lineHeight: 1.6,
                      marginBottom: "12px",
                    }}
                  >
                    You already have a wallet connected.
                    Would you like to use this wallet
                    address for your EWC account?
                  </p>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "9px",
                      background: "#14171d",
                      color: "#fff",
                      fontSize: "13px",
                      overflowWrap: "anywhere",
                      marginBottom: "12px",
                    }}
                  >
                    {connectedAddress}
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: isBscMainnet
                        ? "#69d79a"
                        : "#e9c45a",
                      marginBottom: "14px",
                    }}
                  >
                    {isBscMainnet
                      ? "BNB Smart Chain Mainnet"
                      : "Connected wallet is not currently on BSC Mainnet"}
                  </div>

                  {isUsingConnectedWallet ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#69d79a",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={17} />
                      Connected wallet selected
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={useConnectedWallet}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        border: "none",
                        borderRadius: "9px",
                        cursor: "pointer",
                        background:
                          "linear-gradient(135deg, #d4af37, #b98c22)",
                        color: "#111",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      Yes, Use This Wallet
                    </button>
                  )}
                </div>
              )}

              {/* =========================================== */}
              {/* MESSAGES */}
              {/* =========================================== */}

              {error && (
                <div className={styles.errorMessage}>
                  {error}
                </div>
              )}

              {success && (
                <div className={styles.successMessage}>
                  {success}
                </div>
              )}

              {/* =========================================== */}
              {/* WALLET FORM */}
              {/* =========================================== */}

              <form onSubmit={requestConfirmation}>
                <div className={styles.formGroup}>
                  <label>Wallet Address</label>

                  <input
                    type="text"
                    value={wallet}
                    onChange={(e) => {
                      setWallet(e.target.value);
                      setManuallyEdited(true);
                      setError("");
                      setSuccess("");
                    }}
                    placeholder="0x..."
                    autoComplete="off"
                    spellCheck={false}
                  />

                  <small>
                    {isUsingConnectedWallet
                      ? "Your connected wallet is selected. Confirm to register it permanently."
                      : "Enter a BNB Smart Chain compatible wallet address."}
                  </small>
                </div>

                <button
                  type="submit"
                  className={styles.registerButton}
                  disabled={saving}
                >
                  <WalletIcon size={17} />
                  Register Wallet
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {/* ================================================= */}
      {/* CONFIRM REGISTRATION MODAL */}
      {/* ================================================= */}

      {confirming && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModal}>

            <div className={styles.modalWarning}>
              <TriangleAlert size={25} />
            </div>

            <h3>Confirm Wallet Address</h3>

            <p>
              Please verify this address carefully.
              Once registered, it cannot be changed.
            </p>

            <div className={styles.confirmAddress}>
              {wallet}
            </div>

            {isUsingConnectedWallet && (
              <p
                style={{
                  color: "#69d79a",
                  fontSize: "12px",
                  marginTop: "12px",
                }}
              >
                This is your currently connected wallet.
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setConfirming(false)}
                disabled={saving}
              >
                Go Back
              </button>

              <button
                type="button"
                className={styles.confirmButton}
                onClick={registerWallet}
                disabled={saving}
              >
                {saving
                  ? "Registering..."
                  : "Yes, Register Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </UserLayout>
  );
};

export default Wallet;
