import { useEffect, useState } from "react";
import { Wallet as WalletIcon, ShieldCheck, TriangleAlert, CheckCircle2 } from "lucide-react";
import { isAddress } from "viem";

import UserLayout from "../../components/layout/UserLayout";
import api from "../../services/api";
import styles from "./Wallet.module.css";

const Wallet = () => {
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadAccount = async () => {
    try {
      setLoading(true);

      const response = await api.get("/account/profile");
      const data = response.data.data;

      setProfile(data);

      if (data.wallet) {
        setWallet(data.wallet);
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

  const walletRegistered = profile?.walletRegistered;

  const requestConfirmation = (e) => {
    e.preventDefault();

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

    setConfirming(true);
  };

  const registerWallet = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await api.put("/account/wallet", {
        wallet: wallet.trim(),
      });

      setSuccess(response.data.message);
      setConfirming(false);

      await loadAccount();
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

  return (
    <UserLayout
      title="Wallet"
      subtitle="Manage your withdrawal wallet"
    >
      <div className={styles.container}>
        <section className={styles.walletCard}>
          <div className={styles.cardHeader}>
            <div className={styles.iconBox}>
              <WalletIcon size={22} />
            </div>

            <div>
              <h2>Withdrawal Wallet</h2>
              <p>
                This wallet will be used for your EWC
                reward claims.
              </p>
            </div>
          </div>

          {walletRegistered ? (
            <>
              <div className={styles.registeredStatus}>
                <CheckCircle2 size={19} />

                <div>
                  <strong>Wallet Registered</strong>
                  <span>
                    Your withdrawal wallet is permanently
                    registered.
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
                  It is used when generating your Merkle
                  reward entitlement.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className={styles.warning}>
                <TriangleAlert size={19} />

                <div>
                  <strong>Important</strong>

                  <p>
                    Your wallet can only be registered
                    once. Make sure the address is correct
                    before submitting it. It cannot be
                    changed later.
                  </p>
                </div>
              </div>

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

              <form onSubmit={requestConfirmation}>
                <div className={styles.formGroup}>
                  <label>Wallet Address</label>

                  <input
                    type="text"
                    value={wallet}
                    onChange={(e) => {
                      setWallet(e.target.value);
                      setError("");
                    }}
                    placeholder="0x..."
                    autoComplete="off"
                  />

                  <small>
                    Enter a BNB Smart Chain compatible
                    wallet address.
                  </small>
                </div>

                <button
                  type="submit"
                  className={styles.registerButton}
                >
                  <WalletIcon size={17} />
                  Register Wallet
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {confirming && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.modalWarning}>
              <TriangleAlert size={25} />
            </div>

            <h3>Confirm Wallet Address</h3>

            <p>
              Please verify this address carefully. Once
              registered, it cannot be changed.
            </p>

            <div className={styles.confirmAddress}>
              {wallet}
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setConfirming(false)}
                disabled={saving}
              >
                Go Back
              </button>

              <button
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