import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import adminApi from "../../../services/adminApi";
import styles from "./AdminLogin.module.css";

const AdminLogin = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    admin: "",
    password: "",
    remember: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const admin = formData.admin.trim();
    const password = formData.password;

    if (!admin || !password) {
      setError("Please enter your admin username and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await adminApi.post(
        "/admin/auth/login",
        {
          admin,
          password,
        }
      );

      const { token, admin: adminUser } = response.data;

      if (formData.remember) {
        localStorage.setItem(
          "ewc_admin_token",
          token
        );

        localStorage.setItem(
          "ewc_admin_user",
          JSON.stringify(adminUser)
        );
      } else {
        sessionStorage.setItem(
          "ewc_admin_token",
          token
        );

        sessionStorage.setItem(
          "ewc_admin_user",
          JSON.stringify(adminUser)
        );
      }

      navigate("/admin/dashboard", {
        replace: true,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      <div className={styles.gridBackground} />
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />

      <div className={styles.pageContent}>
        <div className={styles.brand}>
          <div className={styles.logoMark}>
            <span>E</span>
          </div>

          <div className={styles.brandText}>
            <strong>EWC</strong>
            <span>ELEVATE WORLD COMMUNITY</span>
          </div>
        </div>

        <section className={styles.loginCard}>
          <div className={styles.cardAccent} />

          <div className={styles.adminBadge}>
            <ShieldCheck size={14} />
            ADMINISTRATION
          </div>

          <div className={styles.cardHeader}>
            <div className={styles.headerIcon}>
              <LockKeyhole size={22} />
            </div>

            <h1>Admin Portal</h1>

            <p>
              Secure access to EWC platform
              administration.
            </p>
          </div>

          <form
            className={styles.form}
            onSubmit={handleSubmit}
          >
            {error && (
              <div
                className={styles.errorMessage}
                role="alert"
              >
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="admin">
                Administrator
              </label>

              <div className={styles.inputWrapper}>
                <UserRound
                  className={styles.inputIcon}
                  size={19}
                  strokeWidth={1.8}
                />

                <input
                  id="admin"
                  type="text"
                  name="admin"
                  value={formData.admin}
                  onChange={handleChange}
                  placeholder="Enter admin username"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="adminPassword">
                Password
              </label>

              <div className={styles.inputWrapper}>
                <LockKeyhole
                  className={styles.inputIcon}
                  size={19}
                  strokeWidth={1.8}
                />

                <input
                  id="adminPassword"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter password"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() =>
                    setShowPassword((prev) => !prev)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            <div className={styles.formOptions}>
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  name="remember"
                  checked={formData.remember}
                  onChange={handleChange}
                />

                <span
                  className={styles.customCheckbox}
                />

                <span>Remember this device</span>
              </label>
            </div>

            <button
              type="submit"
              className={styles.loginButton}
              disabled={loading}
            >
              <span>
                {loading
                  ? "Authenticating..."
                  : "Access Admin Panel"}
              </span>

              {!loading && (
                <ArrowRight
                  size={19}
                  strokeWidth={2.2}
                />
              )}
            </button>
          </form>

          <div className={styles.securityNote}>
            <ShieldCheck size={13} />

            Authorized EWC administrators only
          </div>
        </section>

        <p className={styles.footer}>
          © {new Date().getFullYear()} Elevate World
          Community. Administration System.
        </p>
      </div>
    </main>
  );
};

export default AdminLogin;