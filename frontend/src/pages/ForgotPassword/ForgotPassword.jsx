
import { useState } from "react";
import { Link } from "react-router-dom";
import {
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
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await api.post(
        "/auth/password-reset/forgot",
        { email: email.trim() }
      );

      setMessage(
        response.data.message ||
          "If an account exists with that email, a password reset link will be sent."
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to process your request. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.forgotPage}>
      {/* Background */}
      <div className={styles.gridBackground} />
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />

      <div className={styles.pageContent}>
        {/* Brand */}
        <Link to="/" className={styles.brand}>
          <img
            src="/logo.png"
            alt="Elevate World Community"
            className={styles.logo}
          />
        </Link>

        {/* Forgot Password Card */}
        <section className={styles.forgotCard}>
          <div className={styles.cardAccent} />

          {message ? (
            <div className={styles.resultState}>
              <div className={styles.successIcon}>
                <CheckCircle2 size={27} />
              </div>

              <h1>Check Your Email</h1>

              <p className={styles.resultDescription}>
                {message}
              </p>

              <div className={styles.emailNotice}>
                <Mail size={19} />
                <span>
                  Check your inbox and spam folder for an
                  email from EWC Support.
                </span>
              </div>

              <div className={styles.securityInfo}>
                <ShieldCheck size={17} />
                <span>
                  Password reset links expire after 15
                  minutes.
                </span>
              </div>

              <Link
                to="/login"
                className={styles.primaryButton}
              >
                <span>Back to Sign In</span>
                <ArrowRight size={19} />
              </Link>

              <button
                type="button"
                className={styles.tryAgainButton}
                onClick={() => {
                  setMessage("");
                  setError("");
                }}
              >
                Try another email address
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={styles.cardHeader}>
                <div className={styles.headerIcon}>
                  <KeyRound size={22} />
                </div>

                <h1>Forgot Password?</h1>

                <p>
                  No worries! Enter your registered email
                  address and we'll send you a secure link
                  to reset your password.
                </p>
              </div>

              {/* Form */}
              <form
                className={styles.form}
                onSubmit={handleSubmit}
              >
                {error && (
                  <div
                    className={styles.errorMessage}
                    role="alert"
                  >
                    <AlertCircle size={17} />
                    <span>{error}</span>
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label htmlFor="email">
                    Email Address
                  </label>

                  <div className={styles.inputWrapper}>
                    <Mail
                      className={styles.inputIcon}
                      size={19}
                      strokeWidth={1.8}
                    />

                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);

                        if (error) {
                          setError("");
                        }
                      }}
                      placeholder="Enter your registered email"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className={styles.securityInfo}>
                  <ShieldCheck size={17} />
                  <span>
                    We'll send a secure password reset link
                    valid for 15 minutes.
                  </span>
                </div>

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={loading}
                >
                  <span>
                    {loading
                      ? "Sending Reset Link..."
                      : "Send Reset Link"}
                  </span>

                  {!loading && (
                    <ArrowRight
                      size={19}
                      strokeWidth={2.2}
                    />
                  )}
                </button>
              </form>

              <div className={styles.divider}>
                <span />
                <p>REMEMBER YOUR PASSWORD?</p>
                <span />
              </div>

              <Link
                to="/login"
                className={styles.backLink}
              >
                <ArrowLeft size={16} />
                Back to Sign In
              </Link>
            </>
          )}

          <div className={styles.securityNote}>
            <span className={styles.securityDot} />
            Secure access to the EWC community platform
          </div>
        </section>

        <p className={styles.footer}>
          © {new Date().getFullYear()} Elevate World
          Community. All rights reserved.
        </p>
      </div>
    </main>
  );
};

export default ForgotPassword;
