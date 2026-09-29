import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  AtSign,
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LockKeyhole,
  Mail,
  UsersRound,
  XCircle,
} from "lucide-react";

import intlTelInput from "intl-tel-input";
import "intl-tel-input/styles";

import api from "../../services/api";
import styles from "./Register.module.css";

const Register = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const mobileInputRef = useRef(null);
  const itiRef = useRef(null);

  const [formData, setFormData] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    ref_id: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [refStatus, setRefStatus] = useState({
    checking: false,
    valid: false,
    message: "",
  });

  const [usernameStatus, setUsernameStatus] = useState({
    checking: false,
    valid: false,
    message: "",
  });

  const [emailStatus, setEmailStatus] = useState({
    checking: false,
    valid: false,
    message: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // =========================================================
  // REFERRAL FROM URL
  // /register?ref=username
  // =========================================================

  useEffect(() => {
    const referral = searchParams.get("ref");

    if (referral) {
      setFormData((prev) => ({
        ...prev,
        ref_id: referral,
      }));
    }
  }, [searchParams]);

  // =========================================================
  // INTERNATIONAL MOBILE INPUT
  // =========================================================

  useEffect(() => {
    if (!mobileInputRef.current) return;

    const input = mobileInputRef.current;

    const iti = intlTelInput(input, {
      initialCountry: "in",
      separateDialCode: true,
      nationalMode: true,
      autoPlaceholder: "polite",
      formatOnDisplay: true,

      countryOrder: ["in", "us", "gb", "ae", "ca", "au", "pk", "bd"],

      loadUtils: () => import("intl-tel-input/utils"),
    });

    itiRef.current = iti;

    return () => {
      iti.destroy();
      itiRef.current = null;
    };
  }, []);

  // =========================================================
  // HANDLE NORMAL INPUTS
  // =========================================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");

    if (name === "username") {
      setUsernameStatus({
        checking: false,
        valid: false,
        message: "",
      });
    }

    if (name === "email") {
      setEmailStatus({
        checking: false,
        valid: false,
        message: "",
      });
    }

    if (name === "ref_id") {
      setRefStatus({
        checking: false,
        valid: false,
        message: "",
      });
    }
  };

  // =========================================================
  // CHECK REFERRAL
  // =========================================================

  const checkReferral = async () => {
    const referral = formData.ref_id.trim();

    if (!referral) {
      setRefStatus({
        checking: false,
        valid: false,
        message: "",
      });

      return false;
    }

    setRefStatus({
      checking: true,
      valid: false,
      message: "Checking referral...",
    });

    try {
      const response = await api.post("/auth/check-referral", {
        ref_id: referral,
      });

      setRefStatus({
        checking: false,
        valid: true,
        message: response.data.message || "Valid referral ID",
      });

      return true;
    } catch (err) {
      setRefStatus({
        checking: false,
        valid: false,
        message: err.response?.data?.message || "Invalid referral ID",
      });

      return false;
    }
  };

  const checkUsername = async () => {
    const username = formData.username.trim();

    if (!username) {
      setUsernameStatus({
        checking: false,
        valid: false,
        message: "",
      });

      return false;
    }

    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      setUsernameStatus({
        checking: false,
        valid: false,
        message: "Use 4-20 letters, numbers, or underscores.",
      });

      return false;
    }

    setUsernameStatus({
      checking: true,
      valid: false,
      message: "Checking username...",
    });

    try {
      const response = await api.post("/auth/check-availability", {
        type: "username",
        value: username,
      });

      const available = response.data.available === true;

      setUsernameStatus({
        checking: false,
        valid: available,
        message: response.data.message,
      });

      return available;
    } catch (err) {
      setUsernameStatus({
        checking: false,
        valid: false,
        message: err.response?.data?.message || "Unable to check username.",
      });

      return false;
    }
  };

  const checkEmail = async () => {
    const email = formData.email.trim().toLowerCase();

    if (!email) {
      setEmailStatus({
        checking: false,
        valid: false,
        message: "",
      });

      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setEmailStatus({
        checking: false,
        valid: false,
        message: "Please enter a valid email address.",
      });

      return false;
    }

    setEmailStatus({
      checking: true,
      valid: false,
      message: "Checking email...",
    });

    try {
      const response = await api.post("/auth/check-availability", {
        type: "email",
        value: email,
      });

      const available = response.data.available === true;

      setEmailStatus({
        checking: false,
        valid: available,
        message: response.data.message,
      });

      return available;
    } catch (err) {
      setEmailStatus({
        checking: false,
        valid: false,
        message: err.response?.data?.message || "Unable to check email.",
      });

      return false;
    }
  };

  // Validate referral automatically from referral link
  useEffect(() => {
    if (formData.ref_id) {
      checkReferral();
    }

    // We only want this triggered when referral initially changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.ref_id]);

  // =========================================================
  // REGISTER
  // =========================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    const { username, name, email, password, confirmPassword, ref_id } =
      formData;

    if (
      !username.trim() ||
      !name.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword ||
      !ref_id.trim()
    ) {
      setError("Please fill in all fields.");
      return;
    }

    // =======================================================
    // USERNAME
    // =======================================================

    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username.trim())) {
      setError(
        "Username must be 4-20 characters and contain only letters, numbers, or underscores.",
      );
      return;
    }

    // =======================================================
    // PASSWORD
    // =======================================================

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // =======================================================
    // MOBILE
    // =======================================================

    if (!itiRef.current) {
      setError("Mobile input is not ready.");
      return;
    }

    if (!itiRef.current.isValidNumber()) {
      setError("Please enter a valid mobile number.");
      mobileInputRef.current?.focus();
      return;
    }

    const fullMobileNumber = itiRef.current.getNumber();

    // Selected country ISO code: in, us, ae, gb, etc.
    const countryData = itiRef.current.getSelectedCountry();

    if (!countryData?.iso2) {
      setError("Please select a valid country.");
      return;
    }

    const country = countryData.iso2;

    if (!country) {
      setError("Please select a valid country.");
      return;
    }

    // =======================================================
    // USERNAME AVAILABILITY
    // =======================================================

    let usernameValid = usernameStatus.valid;

    if (!usernameValid) {
      usernameValid = await checkUsername();
    }

    if (!usernameValid) {
      setError("Please choose an available username.");
      return;
    }

    // =======================================================
    // EMAIL AVAILABILITY
    // =======================================================

    let emailValid = emailStatus.valid;

    if (!emailValid) {
      emailValid = await checkEmail();
    }

    if (!emailValid) {
      setError("Please use an available email address.");
      return;
    }

    // =======================================================
    // REFERRAL
    // =======================================================

    let referralValid = refStatus.valid;

    if (!referralValid) {
      referralValid = await checkReferral();
    }

    if (!referralValid) {
      setError("Please enter a valid referral ID.");
      return;
    }

    // =======================================================
    // REGISTER
    // =======================================================

    setLoading(true);

    try {
      const response = await api.post("/auth/register", {
        username: username.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),

        country,
        mobile_no: fullMobileNumber,

        password,
        confirmPassword,
        ref_id: ref_id.trim(),
      });

      setSuccess(response.data.message || "Registration successful.");

      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (err) {
      setError(
        err.response?.data?.message || "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.grid}></div>
      <div className={styles.glowOne}></div>
      <div className={styles.glowTwo}></div>

      <div className={styles.container}>
        {/* =================================================
            BRAND
        ================================================= */}

        <div className={styles.brand}>
          <div className={styles.logoMark}>E</div>

          <div>
            <div className={styles.brandName}>EWC</div>

            <div className={styles.brandSub}>ELEVATE WORLD COMMUNITY</div>
          </div>
        </div>

        {/* =================================================
            CARD
        ================================================= */}

        <div className={styles.card}>
          <div className={styles.goldLine}></div>

          <div className={styles.header}>
            <h1>Create Account</h1>

            <p>Join the EWC community and start your journey.</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {/* =============================================
                REFERRAL
            ============================================= */}

            <div className={styles.field}>
              <label>Referral ID</label>

              <div
                className={`${styles.inputWrap} ${
                  refStatus.valid ? styles.validInput : ""
                }`}
              >
                <UsersRound size={19} />

                <input
                  type="text"
                  name="ref_id"
                  placeholder="Enter referral ID"
                  value={formData.ref_id}
                  onChange={handleChange}
                  onBlur={checkReferral}
                />

                {refStatus.checking && (
                  <span className={styles.smallLoader}></span>
                )}

                {!refStatus.checking && refStatus.valid && (
                  <CheckCircle2 size={19} className={styles.validIcon} />
                )}

                {!refStatus.checking &&
                  refStatus.message &&
                  !refStatus.valid && (
                    <XCircle size={19} className={styles.invalidIcon} />
                  )}
              </div>

              {refStatus.message && (
                <div
                  className={
                    refStatus.valid ? styles.refSuccess : styles.refError
                  }
                >
                  {refStatus.message}
                </div>
              )}
            </div>

            {/* =============================================
                USERNAME
            ============================================= */}

            <div className={styles.field}>
              <label>Username</label>

              <div
                className={`${styles.inputWrap} ${
                  usernameStatus.valid ? styles.validInput : ""
                }`}
              >
                <AtSign size={19} />

                <input
                  type="text"
                  name="username"
                  placeholder="Choose your username"
                  value={formData.username}
                  onChange={handleChange}
                  onBlur={checkUsername}
                  autoComplete="username"
                />

                {usernameStatus.checking && (
                  <span className={styles.smallLoader}></span>
                )}

                {!usernameStatus.checking && usernameStatus.valid && (
                  <CheckCircle2 size={19} className={styles.validIcon} />
                )}

                {!usernameStatus.checking &&
                  usernameStatus.message &&
                  !usernameStatus.valid && (
                    <XCircle size={19} className={styles.invalidIcon} />
                  )}
              </div>

              {usernameStatus.message && (
                <div
                  className={
                    usernameStatus.valid ? styles.refSuccess : styles.refError
                  }
                >
                  {usernameStatus.message}
                </div>
              )}
            </div>

            {/* =============================================
                FULL NAME
            ============================================= */}

            <div className={styles.field}>
              <label>Full Name</label>

              <div className={styles.inputWrap}>
                <BadgeCheck size={19} />

                <input
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  autoComplete="name"
                />
              </div>
            </div>

            {/* =============================================
                EMAIL
            ============================================= */}

            <div className={styles.field}>
              <label>Email Address</label>

              <div
                className={`${styles.inputWrap} ${
                  emailStatus.valid ? styles.validInput : ""
                }`}
              >
                <Mail size={19} />

                <input
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={checkEmail}
                  autoComplete="email"
                />

                {emailStatus.checking && (
                  <span className={styles.smallLoader}></span>
                )}

                {!emailStatus.checking && emailStatus.valid && (
                  <CheckCircle2 size={19} className={styles.validIcon} />
                )}

                {!emailStatus.checking &&
                  emailStatus.message &&
                  !emailStatus.valid && (
                    <XCircle size={19} className={styles.invalidIcon} />
                  )}
              </div>

              {emailStatus.message && (
                <div
                  className={
                    emailStatus.valid ? styles.refSuccess : styles.refError
                  }
                >
                  {emailStatus.message}
                </div>
              )}
            </div>

            {/* =============================================
                COUNTRY / MOBILE
            ============================================= */}

            <div className={styles.field}>
              <label>Mobile Number</label>

              <div className={styles.phoneWrap}>
                <input
                  ref={mobileInputRef}
                  type="tel"
                  name="mobile_no"
                  className={styles.phoneInput}
                  autoComplete="tel"
                />
              </div>

              <div className={styles.countryHint}>
                <Globe2 size={14} />
                Country is detected from your selected phone flag.
              </div>
            </div>

            {/* =============================================
                PASSWORD
            ============================================= */}

            <div className={styles.field}>
              <label>Password</label>

              <div className={styles.inputWrap}>
                <KeyRound size={19} />

                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className={styles.eyeButton}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            {/* =============================================
                CONFIRM PASSWORD
            ============================================= */}

            <div className={styles.field}>
              <label>Confirm Password</label>

              <div className={styles.inputWrap}>
                <LockKeyhole size={19} />

                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className={styles.eyeButton}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {/* =============================================
                MESSAGES
            ============================================= */}

            {error && <div className={styles.error}>{error}</div>}

            {success && <div className={styles.success}>{success}</div>}

            {/* =============================================
                SUBMIT
            ============================================= */}

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? (
                "Creating Account..."
              ) : (
                <>
                  Create Account
                  <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>

          <div className={styles.divider}>
            <span></span>
            <p>ALREADY A MEMBER?</p>
            <span></span>
          </div>

          <Link to="/login" className={styles.loginButton}>
            Sign In
          </Link>
        </div>

        <div className={styles.footer}>
          © {new Date().getFullYear()} Elevate World Community
        </div>
      </div>
    </div>
  );
};

export default Register;
