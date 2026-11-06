
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await api.post(
        "/auth/password-reset/forgot",
        { email }
      );

      setMessage(response.data.message);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to process request."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.brand}>EWC</div>

        <h2 style={styles.title}>Forgot Password?</h2>

        <p style={styles.subtitle}>
          Enter your registered email address and we'll send
          you a secure password reset link.
        </p>

        {message && (
          <div style={styles.success}>{message}</div>
        )}

        {error && (
          <div style={styles.error}>{error}</div>
        )}

        <label htmlFor="email" style={styles.label}>
          Email Address
        </label>

        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter registered email"
          required
          autoComplete="email"
          style={styles.input}
        />

        <button
          type="submit"
          disabled={loading}
          style={styles.button}
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        <Link to="/login" style={styles.link}>
          Back to Login
        </Link>
      </form>
    </main>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#0b101b",
    padding: 20,
    color: "#fff",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 32,
    background: "#141d2e",
    border: "1px solid #293247",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  brand: {
    color: "#e8c76a",
    fontSize: 24,
    fontWeight: 800,
  },
  title: {
    margin: 0,
    fontSize: 26,
  },
  subtitle: {
    color: "#a8b1c4",
    lineHeight: 1.6,
  },
  label: {
    fontSize: 14,
  },
  input: {
    padding: 14,
    borderRadius: 8,
    border: "1px solid #374158",
    background: "#0b1220",
    color: "#fff",
    fontSize: 15,
  },
  button: {
    padding: 14,
    borderRadius: 9,
    background: "#e8c76a",
    color: "#151515",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },
  link: {
    textAlign: "center",
    color: "#e8c76a",
    textDecoration: "none",
  },
  success: {
    color: "#86efac",
  },
  error: {
    color: "#fca5a5",
  },
};

export default ForgotPassword;
