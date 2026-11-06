
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../services/api";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
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
        "Unable to reset password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}>EWC</div>

        <h2 style={{ margin: 0 }}>
          {success ? "Password Updated" : "Reset Password"}
        </h2>

        {success ? (
          <>
            <p style={styles.muted}>
              Your password has been changed successfully.
            </p>

            <Link to="/login" style={styles.link}>
              Go to Login
            </Link>
          </>
        ) : !token ? (
          <>
            <p style={styles.error}>
              Password reset link is missing or invalid.
            </p>

            <Link to="/forgot-password" style={styles.link}>
              Request New Link
            </Link>
          </>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={styles.form}
          >
            <p style={styles.muted}>
              Choose a new password for your EWC account.
            </p>

            {error && (
              <div style={styles.error}>{error}</div>
            )}

            <label htmlFor="newPassword">
              New Password
            </label>

            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />

            <label htmlFor="confirmPassword">
              Confirm New Password
            </label>

            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={styles.input}
            />

            <button
              type="submit"
              disabled={loading}
              style={styles.button}
            >
              {loading ? "Updating..." : "Reset Password"}
            </button>

            <Link to="/login" style={styles.link}>
              Back to Login
            </Link>
          </form>
        )}
      </div>
    </main>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "#0b101b",
    color: "#fff",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 32,
    borderRadius: 16,
    background: "#141d2e",
    border: "1px solid #293247",
  },
  brand: {
    color: "#e8c76a",
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 20,
  },
  muted: {
    color: "#a8b1c4",
    lineHeight: 1.6,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginTop: 16,
  },
  input: {
    padding: 14,
    border: "1px solid #374158",
    borderRadius: 8,
    background: "#0b1220",
    color: "#fff",
    fontSize: 15,
  },
  button: {
    background: "#e8c76a",
    color: "#151515",
    fontWeight: 700,
    padding: 14,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  link: {
    display: "block",
    color: "#e8c76a",
    textAlign: "center",
    textDecoration: "none",
    marginTop: 16,
  },
  error: {
    color: "#fca5a5",
  },
};

export default ResetPassword;
