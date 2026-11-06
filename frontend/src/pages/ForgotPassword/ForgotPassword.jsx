import { useState } from "react";
import { Link } from "react-router-dom";
import {
  UserRound,
  Mail,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
} from "lucide-react";

import api from "../../services/api";
import styles from "./ForgotPassword.module.css";

const ForgotPassword = () => {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [maskedEmail, setMaskedEmail] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const value = identifier.trim();

    if (!value) {
      setError("Please enter your username or email address.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");
    setMaskedEmail(null);

    try {
      const response = await api.post("/auth/password-reset/forgot", {
        identifier: value,
      });

      setMessage(
        response.data.message ||
          "If an account exists with those details, a password reset link will be sent to its registered email.",
      );

      setMaskedEmail(response.data.maskedEmail || null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to process your request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.forgotPage}>
      {/* BACKGROUND */}
      <div className={styles.gridBackground} />
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />

      <div className={styles.pageContent}>
        {/* EWC LOGO */}
        <Link to="/" className={styles.brand}>
          <img
            src="/logo.png"
            alt="Elevate World Community"
            className={styles.logo}
          />
        </Link>

        <section className={styles.forgotCard}>
          <div className={styles.cardAccent} />

          {message ? (
            // =========================================
            // SUCCESS SCREEN
            // =========================================
            <div className={styles.resultState}>
              <div className={styles.successIcon}>
                <CheckCircle2 size={27} />
              </div>

              <h1>Check Your Email</h1>
              {maskedEmail && (
                <div className={styles.maskedEmailBox}>
                  <Mail size={20} />

                  <span>Password reset email requested for</span>

                  <strong>{maskedEmail}</strong>
                </div>
              )}

              <p className={styles.resultDescription}>{message}</p>

              <div className={styles.emailNotice}>
                <Mail size={19} />
                <span>
                  Check your inbox and spam folder for a message from EWC
                  Support. The reset link expires in 15 minutes.
                </span>
              </div>

              <div className={styles.securityInfo}>
                <ShieldCheck size={17} />

                <span>
                  Password reset links expire after 15 minutes and can only be
                  used once.
                </span>
              </div>

              <Link to="/login" className={styles.primaryButton}>
                <span>Back to Sign In</span>
                <ArrowRight size={19} />
              </Link>

              <button
                type="button"
                className={styles.tryAgainButton}
                onClick={() => {
                  setIdentifier("");
                  setMessage("");
                  setError("");
                  setMaskedEmail(null);
                }}
              >
                Try another username or email
              </button>
            </div>
          ) : (
            <>
              {/* HEADER */}
              <div className={styles.cardHeader}>
                <div className={styles.headerIcon}>
                  <KeyRound size={22} />
                </div>

                <h1>Forgot Password?</h1>

                <p>
                  Enter your EWC username or registered email address. We'll
                  send a secure password reset link to your registered email.
                </p>
              </div>

              {/* FORM */}
              <form className={styles.form} onSubmit={handleSubmit}>
                {error && (
                  <div className={styles.errorMessage} role="alert">
                    <AlertCircle size={17} />
                    <span>{error}</span>
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label htmlFor="identifier">Username or Email</label>

                  <div className={styles.inputWrapper}>
                    <UserRound
                      className={styles.inputIcon}
                      size={19}
                      strokeWidth={1.8}
                    />

                    <input
                      id="identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);

                        if (error) {
                          setError("");
                        }
                      }}
                      placeholder="Enter username or email"
                      autoComplete="username"
                      maxLength={254}
                      required
                    />
                  </div>
                </div>

                <div className={styles.securityInfo}>
                  <ShieldCheck size={17} />

                  <span>
                    For your security, the reset link will only be sent to the
                    registered email address of your EWC account.
                  </span>
                </div>

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={loading}
                >
                  <span>
                    {loading ? "Sending Reset Link..." : "Send Reset Link"}
                  </span>

                  {!loading && <ArrowRight size={19} strokeWidth={2.2} />}
                </button>
              </form>

              {/* BACK TO LOGIN */}
              <div className={styles.divider}>
                <span />
                <p>REMEMBER YOUR PASSWORD?</p>
                <span />
              </div>

              <Link to="/login" className={styles.backLink}>
                <ArrowLeft size={16} />
                Back to Sign In
              </Link>
            </>
          )}

          {/* SECURITY FOOTER */}
          <div className={styles.securityNote}>
            <span className={styles.securityDot} />
            Secure access to the EWC community platform
          </div>
        </section>

        <p className={styles.footer}>
          © {new Date().getFullYear()} Elevate World Community. All rights
          reserved.
        </p>
      </div>
    </main>
  );
};

export default ForgotPassword;
