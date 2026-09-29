import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, UserRound, ArrowRight } from "lucide-react";
import api from "../../services/api";
import styles from "./Login.module.css";

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    identifier: "",
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

    const identifier = formData.identifier.trim();
    const password = formData.password;

    if (!identifier || !password) {
      setError("Please enter your username/email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/login", {
        identifier,
        password,
      });

      const { token, user } = response.data;

      if (formData.remember) {
        localStorage.setItem("ewc_token", token);
        localStorage.setItem("ewc_user", JSON.stringify(user));
      } else {
        sessionStorage.setItem("ewc_token", token);
        sessionStorage.setItem("ewc_user", JSON.stringify(user));
      }

      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      {/* Background decoration */}
      <div className={styles.gridBackground} />
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />

      <div className={styles.pageContent}>
        {/* Brand */}
        <Link to="/" className={styles.brand}>
          <div className={styles.logoMark}>
            <span>E</span>
          </div>

          <div className={styles.brandText}>
            <strong>EWC</strong>
            <span>ELEVATE WORLD COMMUNITY</span>
          </div>
        </Link>

        {/* Login Card */}
        <section className={styles.loginCard}>
          <div className={styles.cardAccent} />

          <div className={styles.cardHeader}>
            <div className={styles.headerIcon}>
              <LockKeyhole size={22} />
            </div>

            <h1>Welcome Back</h1>
            <p>Sign in to access your EWC account.</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {error && (
              <div className={styles.errorMessage} role="alert">
                {error}
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
                  name="identifier"
                  value={formData.identifier}
                  onChange={handleChange}
                  placeholder="Enter username or email"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password</label>

              <div className={styles.inputWrapper}>
                <LockKeyhole
                  className={styles.inputIcon}
                  size={19}
                  strokeWidth={1.8}
                />

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
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
                <span className={styles.customCheckbox} />
                <span>Remember me</span>
              </label>

              <Link to="/forgot-password" className={styles.forgotPassword}>
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              className={styles.loginButton}
              disabled={loading}
            >
              <span>{loading ? "Signing In..." : "Sign In"}</span>

              {!loading && <ArrowRight size={19} strokeWidth={2.2} />}
            </button>
          </form>

          <div className={styles.divider}>
            <span />
            <p>NEW TO EWC?</p>
            <span />
          </div>

          <p className={styles.registerText}>
            Don't have an account? <Link to="/register">Create Account</Link>
          </p>

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

export default Login;
