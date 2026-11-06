import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LockKeyhole,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import api from "../../services/api";
import styles from "./ResetPassword.module.css";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [verifying, setVerifying] = useState(true);
  const [validLink, setValidLink] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const verifyToken = async () => {
      if (!token) {
        setValidLink(false);
        setVerifying(false);
        return;
      }

      try {
        await api.get("/auth/password-reset/verify", {
          params: { token },
        });

        if (!cancelled) {
          setValidLink(true);
        }
      } catch (err) {
        if (!cancelled) {
          setValidLink(false);
          setError(
            err.response?.data?.message ||
              "This reset link is invalid or expired.",
          );
        }
      } finally {
        if (!cancelled) {
          setVerifying(false);
        }
      }
    };

    verifyToken();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!token) {
      setError("Invalid password reset link.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/auth/password-reset/reset", {
        token,
        password,
        confirmPassword,
      });

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to reset password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.resetPage}>
      <div className={styles.gridBackground} />
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />

      <div className={styles.pageContent}>
        {/* BRAND */}
        <Link to="/" className={styles.brand}>
          <img
            src="/logo.png"
            alt="Elevate World Community"
            className={styles.logo}
          />
        </Link>

        <section className={styles.resetCard}>
          <div className={styles.cardAccent} />

          {verifying ? (
            <div className={styles.resultState}>
              <h1>Verifying Link...</h1>
              <p className={styles.resultDescription}>
                Checking your password reset link.
              </p>
            </div>
          ) : success ? (
            <div className={styles.resultState}>
              <div className={styles.successIcon}>
                <CheckCircle2 size={27} />
              </div>

              <h1>Password Updated!</h1>

              <p className={styles.resultDescription}>
                Your password has been successfully reset. You can now sign in
                to your EWC account using your new password.
              </p>

              <div className={styles.successBox}>
                <ShieldCheck size={19} />
                <span>Your new password is now active.</span>
              </div>

              <Link to="/login" className={styles.primaryButton}>
                <span>Back to Sign In</span>
                <ArrowRight size={19} />
              </Link>
            </div>
          ) : !validLink ? (
            <div className={styles.resultState}>
              <div className={styles.errorIcon}>
                <AlertCircle size={26} />
              </div>

              <h1>Invalid Reset Link</h1>

              <p className={styles.resultDescription}>
                {error ||
                  "This password reset link has expired or already been used."}
              </p>

              <Link to="/forgot-password" className={styles.primaryButton}>
                <span>Request New Link</span>
                <ArrowRight size={19} />
              </Link>

              <Link to="/login" className={styles.backLink}>
                <ArrowLeft size={16} />
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              {/* HEADER */}
              <div className={styles.cardHeader}>
                <div className={styles.headerIcon}>
                  <LockKeyhole size={22} />
                </div>

                <h1>Reset Password</h1>

                <p>Create a new secure password for your EWC account.</p>
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
                  <label htmlFor="newPassword">New Password</label>

                  <div className={styles.inputWrapper}>
                    <LockKeyhole
                      className={styles.inputIcon}
                      size={19}
                      strokeWidth={1.8}
                    />

                    <input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />

                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="confirmPassword">Confirm New Password</label>

                  <div className={styles.inputWrapper}>
                    <LockKeyhole
                      className={styles.inputIcon}
                      size={19}
                      strokeWidth={1.8}
                    />

                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />

                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={
                        showConfirmPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={19} />
                      ) : (
                        <Eye size={19} />
                      )}
                    </button>
                  </div>
                </div>

                <div className={styles.passwordHint}>
                  <ShieldCheck size={16} />
                  <span>Use at least 8 characters for your new password.</span>
                </div>

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={loading}
                >
                  <span>
                    {loading ? "Updating Password..." : "Reset Password"}
                  </span>

                  {!loading && <ArrowRight size={19} strokeWidth={2.2} />}
                </button>
              </form>

              <div className={styles.divider}>
                <span />
                <p>ACCOUNT SECURITY</p>
                <span />
              </div>

              <Link to="/login" className={styles.backLink}>
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
          © {new Date().getFullYear()} Elevate World Community. All rights
          reserved.
        </p>
      </div>
    </main>
  );
};

export default ResetPassword;
