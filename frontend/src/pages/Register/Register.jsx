
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
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
  ShieldCheck,
  RefreshCw,
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
  const redirectTimerRef = useRef(null);

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
  // OTP REGISTRATION STATES
  // =========================================================

  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [pendingData, setPendingData] = useState(null);
  const [registrationToken, setRegistrationToken] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

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

      countryOrder: [
        "in",
        "us",
        "gb",
        "ae",
        "ca",
        "au",
        "pk",
        "bd",
      ],

      loadUtils: () => import("intl-tel-input/utils"),
    });

    itiRef.current = iti;

    return () => {
      iti.destroy();
      itiRef.current = null;
    };
  }, []);

  // =========================================================
  // RESEND OTP COUNTDOWN
  // =========================================================

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setTimeout(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // =========================================================
  // CLEANUP REDIRECT TIMER
  // =========================================================

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
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
        message:
          err.response?.data?.message || "Invalid referral ID",
      });

      return false;
    }
  };

  // =========================================================
  // CHECK USERNAME
  // =========================================================

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
        message:
          "Use 4-20 letters, numbers, or underscores.",
      });

      return false;
    }

    setUsernameStatus({
      checking: true,
      valid: false,
      message: "Checking username...",
    });

    try {
      const response = await api.post(
        "/auth/check-availability",
        {
          type: "username",
          value: username,
        }
      );

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
        message:
          err.response?.data?.message ||
          "Unable to check username.",
      });

      return false;
    }
  };

  // =========================================================
  // CHECK EMAIL
  // =========================================================

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
      const response = await api.post(
        "/auth/check-availability",
        {
          type: "email",
          value: email,
        }
      );

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
        message:
          err.response?.data?.message ||
          "Unable to check email.",
      });

      return false;
    }
  };

  // =========================================================
  // AUTO-CHECK REFERRAL
  // =========================================================

  useEffect(() => {
    if (formData.ref_id && !otpStep) {
      checkReferral();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.ref_id, otpStep]);

  // =========================================================
  // SUBMIT REGISTRATION FORM
  // SEND OTP INSTEAD OF CREATING ACCOUNT
  // =========================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    const {
      username,
      name,
      email,
      password,
      confirmPassword,
      ref_id,
    } = formData;

    // =======================================================
    // REQUIRED FIELDS
    // =======================================================

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
        "Username must be 4-20 characters and contain only letters, numbers, or underscores."
      );
      return;
    }

    // =======================================================
    // EMAIL
    // =======================================================

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError("Please enter a valid email address.");
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

    const countryData = itiRef.current.getSelectedCountry();

    if (!countryData?.iso2) {
      setError("Please select a valid country.");
      return;
    }

    const country = countryData.iso2;

    // =======================================================
    // VALIDATE USERNAME
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
    // VALIDATE EMAIL
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
    // VALIDATE REFERRAL
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
    // PREPARE REGISTRATION DATA
    // =======================================================

    const registrationData = {
      username: username.trim(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      country,
      mobile_no: fullMobileNumber,
      password,
      confirmPassword,
      ref_id: ref_id.trim(),
    };

    // =======================================================
    // SEND REGISTRATION OTP
    // =======================================================

    setLoading(true);

    try {
      const response = await api.post(
        "/auth/register/send-otp",
        {
          email: registrationData.email,
        }
      );

      setPendingData(registrationData);
      setOtp("");
      setRegistrationToken("");

      setOtpMessage(
        response.data.message ||
          "A verification code has been sent to your email."
      );

      setResendCooldown(
        response.data.resendAfterSeconds || 60
      );

      setOtpStep(true);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to send verification code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // VERIFY OTP AND COMPLETE REGISTRATION
  // =========================================================

  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();

    if (!pendingData || loading || success) return;

    if (
      !registrationToken &&
      !/^\d{6}$/.test(otp)
    ) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let proof = registrationToken;

      // =====================================================
      // VERIFY EMAIL OTP
      // =====================================================

      if (!proof) {
        const verifyResponse = await api.post(
          "/auth/register/verify-otp",
          {
            email: pendingData.email,
            otp,
          }
        );

        proof = verifyResponse.data.registrationToken;

        if (!proof) {
          throw new Error(
            "Verification token was not received."
          );
        }

        setRegistrationToken(proof);

        setOtpMessage(
          "Email verified successfully. Completing registration..."
        );
      }

      // =====================================================
      // CREATE ACCOUNT
      // BACKEND REQUIRES VERIFIED TOKEN
      // =====================================================

      const response = await api.post(
        "/auth/register",
        {
          ...pendingData,
          registrationToken: proof,
        }
      );

      setSuccess(
        response.data.message ||
          "Registration completed successfully."
      );

      setOtpMessage("");
      setRegistrationToken("");
      setPendingData(null);

      redirectTimerRef.current = setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to complete registration. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // RESEND OTP
  // =========================================================

  const resendOtp = async () => {
    if (
      !pendingData ||
      sendingOtp ||
      loading ||
      success ||
      resendCooldown > 0
    ) {
      return;
    }

    setSendingOtp(true);
    setError("");
    setOtpMessage("");

    try {
      const response = await api.post(
        "/auth/register/send-otp",
        {
          email: pendingData.email,
        }
      );

      setOtp("");
      setRegistrationToken("");

      setOtpMessage(
        response.data.message ||
          "A new verification code has been sent."
      );

      setResendCooldown(
        response.data.resendAfterSeconds || 60
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to resend verification code."
      );
    } finally {
      setSendingOtp(false);
    }
  };

  // =========================================================
  // EDIT REGISTRATION DETAILS
  // =========================================================

  const editRegistration = () => {
    if (loading || sendingOtp || success) return;

    setOtpStep(false);
    setOtp("");
    setRegistrationToken("");
    setPendingData(null);
    setError("");
    setSuccess("");
    setOtpMessage("");
    setResendCooldown(0);
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className={styles.page}>
      <div className={styles.grid}></div>
      <div className={styles.glowOne}></div>
      <div className={styles.glowTwo}></div>

      <div className={styles.container}>
        {/* ===============================================
            BRAND
        =============================================== */}

        <div className={styles.brand}>
          <div>
            <img
              src="/logo.png"
              alt="EWC Logo"
              style={{
                width: 140,
                height: 100,
                objectFit: "cover",
              }}
            />
          </div>
        </div>

        {/* ===============================================
            REGISTRATION CARD
        =============================================== */}

        <div className={styles.card}>
          <div className={styles.goldLine}></div>

          {/* =============================================
              CARD HEADER
          ============================================= */}

          <div className={styles.header}>
            <h1>
              {otpStep
                ? success
                  ? "Account Created"
                  : "Verify Your Email"
                : "Create Account"}
            </h1>

            <p>
              {otpStep
                ? success
                  ? "Your EWC account is ready."
                  : "Enter the verification code to complete your registration."
                : "Join the EWC community and start your journey."}
            </p>
          </div>

          {/* =============================================
              ORIGINAL REGISTRATION FORM

              Keep mounted when OTP screen is active,
              otherwise intl-tel-input would be destroyed.
          ============================================= */}

          <form
            className={styles.form}
            onSubmit={handleSubmit}
            style={{
              display: otpStep ? "none" : undefined,
            }}
          >
            {/* ===========================================
                REFERRAL
            =========================================== */}

            <div className={styles.field}>
              <label htmlFor="ref_id">
                Referral ID
              </label>

              <div
                className={`${styles.inputWrap} ${
                  refStatus.valid
                    ? styles.validInput
                    : ""
                }`}
              >
                <UsersRound size={19} />

                <input
                  id="ref_id"
                  type="text"
                  name="ref_id"
                  placeholder="Enter referral ID"
                  value={formData.ref_id}
                  onChange={handleChange}
                  onBlur={checkReferral}
                  autoComplete="off"
                />

                {refStatus.checking && (
                  <span className={styles.smallLoader}></span>
                )}

                {!refStatus.checking &&
                  refStatus.valid && (
                    <CheckCircle2
                      size={19}
                      className={styles.validIcon}
                    />
                  )}

                {!refStatus.checking &&
                  refStatus.message &&
                  !refStatus.valid && (
                    <XCircle
                      size={19}
                      className={styles.invalidIcon}
                    />
                  )}
              </div>

              {refStatus.message && (
                <div
                  className={
                    refStatus.valid
                      ? styles.refSuccess
                      : styles.refError
                  }
                >
                  {refStatus.message}
                </div>
              )}
            </div>

            {/* ===========================================
                USERNAME
            =========================================== */}

            <div className={styles.field}>
              <label htmlFor="username">
                Username
              </label>

              <div
                className={`${styles.inputWrap} ${
                  usernameStatus.valid
                    ? styles.validInput
                    : ""
                }`}
              >
                <AtSign size={19} />

                <input
                  id="username"
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

                {!usernameStatus.checking &&
                  usernameStatus.valid && (
                    <CheckCircle2
                      size={19}
                      className={styles.validIcon}
                    />
                  )}

                {!usernameStatus.checking &&
                  usernameStatus.message &&
                  !usernameStatus.valid && (
                    <XCircle
                      size={19}
                      className={styles.invalidIcon}
                    />
                  )}
              </div>

              {usernameStatus.message && (
                <div
                  className={
                    usernameStatus.valid
                      ? styles.refSuccess
                      : styles.refError
                  }
                >
                  {usernameStatus.message}
                </div>
              )}
            </div>

            {/* ===========================================
                FULL NAME
            =========================================== */}

            <div className={styles.field}>
              <label htmlFor="name">
                Full Name
              </label>

              <div className={styles.inputWrap}>
                <BadgeCheck size={19} />

                <input
                  id="name"
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  autoComplete="name"
                />
              </div>
            </div>

            {/* ===========================================
                EMAIL
            =========================================== */}

            <div className={styles.field}>
              <label htmlFor="email">
                Email Address
              </label>

              <div
                className={`${styles.inputWrap} ${
                  emailStatus.valid
                    ? styles.validInput
                    : ""
                }`}
              >
                <Mail size={19} />

                <input
                  id="email"
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

                {!emailStatus.checking &&
                  emailStatus.valid && (
                    <CheckCircle2
                      size={19}
                      className={styles.validIcon}
                    />
                  )}

                {!emailStatus.checking &&
                  emailStatus.message &&
                  !emailStatus.valid && (
                    <XCircle
                      size={19}
                      className={styles.invalidIcon}
                    />
                  )}
              </div>

              {emailStatus.message && (
                <div
                  className={
                    emailStatus.valid
                      ? styles.refSuccess
                      : styles.refError
                  }
                >
                  {emailStatus.message}
                </div>
              )}
            </div>

            {/* ===========================================
                COUNTRY / MOBILE
            =========================================== */}

            <div className={styles.field}>
              <label htmlFor="mobile_no">
                Mobile Number
              </label>

              <div className={styles.phoneWrap}>
                <input
                  id="mobile_no"
                  ref={mobileInputRef}
                  type="tel"
                  name="mobile_no"
                  className={styles.phoneInput}
                  autoComplete="tel"
                />
              </div>

              <div className={styles.countryHint}>
                <Globe2 size={14} />
                Country is detected from your selected
                phone flag.
              </div>
            </div>

            {/* ===========================================
                PASSWORD
            =========================================== */}

            <div className={styles.field}>
              <label htmlFor="password">
                Password
              </label>

              <div className={styles.inputWrap}>
                <KeyRound size={19} />

                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  name="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className={styles.eyeButton}
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

            {/* ===========================================
                CONFIRM PASSWORD
            =========================================== */}

            <div className={styles.field}>
              <label htmlFor="confirmPassword">
                Confirm Password
              </label>

              <div className={styles.inputWrap}>
                <LockKeyhole size={19} />

                <input
                  id="confirmPassword"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  name="confirmPassword"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className={styles.eyeButton}
                  onClick={() =>
                    setShowConfirmPassword(
                      (prev) => !prev
                    )
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
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

            {/* ===========================================
                ERROR MESSAGE
            =========================================== */}

            {error && (
              <div
                className={styles.error}
                role="alert"
              >
                {error}
              </div>
            )}

            {/* ===========================================
                SUBMIT - SEND VERIFICATION CODE
            =========================================== */}

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? (
                "Sending Verification Code..."
              ) : (
                <>
                  Send Verification Code
                  <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>

          {/* =============================================
              OTP VERIFICATION SCREEN
          ============================================= */}

          {otpStep && (
            <form
              className={styles.form}
              onSubmit={handleVerifyAndRegister}
            >
              {/* =========================================
                  SUCCESS SCREEN
              ========================================= */}

              {success ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <CheckCircle2
                      size={56}
                      color="#4ade80"
                      strokeWidth={1.5}
                    />
                  </div>

                  <div
                    className={styles.success}
                    style={{
                      textAlign: "center",
                      lineHeight: 1.7,
                    }}
                  >
                    {success}
                  </div>

                  <p
                    style={{
                      color: "#929aa5",
                      textAlign: "center",
                      fontSize: 13,
                    }}
                  >
                    Redirecting you to the login page...
                  </p>

                  <Link
                    to="/login"
                    className={styles.loginButton}
                  >
                    Continue to Sign In
                    <ArrowRight size={17} />
                  </Link>
                </>
              ) : (
                <>
                  {/* =====================================
                      EMAIL DISPLAY
                  ===================================== */}

                  <div className={styles.otpEmailCard}>
                    <Mail size={22} />

                    <span>
                      We sent a 6-digit verification
                      code to
                    </span>

                    <strong>
                      {pendingData?.email}
                    </strong>
                  </div>

                  {/* =====================================
                      SUCCESS / INFO MESSAGE
                  ===================================== */}

                  {otpMessage && (
                    <div className={styles.otpHint}>
                      {otpMessage}
                    </div>
                  )}

                  {/* =====================================
                      OTP INPUT
                  ===================================== */}

                  {!registrationToken && (
                    <div className={styles.field}>
                      <label htmlFor="registrationOtp">
                        Verification Code
                      </label>

                      <div className={styles.inputWrap}>
                        <LockKeyhole size={19} />

                        <input
                          id="registrationOtp"
                          type="text"
                          value={otp}
                          onChange={(e) => {
                            const cleanCode =
                              e.target.value
                                .replace(/\D/g, "")
                                .slice(0, 6);

                            setOtp(cleanCode);
                            setError("");
                          }}
                          placeholder="Enter 6-digit OTP"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          required
                          autoFocus
                          style={{
                            textAlign: "center",
                            letterSpacing: "5px",
                            fontSize: "20px",
                            fontWeight: 700,
                          }}
                        />
                      </div>

                      <div
                        className={styles.countryHint}
                      >
                        <ShieldCheck size={14} />
                        Code expires after 5 minutes.
                      </div>
                    </div>
                  )}

                  {/* =====================================
                      EMAIL VERIFIED MESSAGE
                  ===================================== */}

                  {registrationToken && (
                    <div className={styles.success}>
                      <CheckCircle2
                        size={16}
                        style={{
                          verticalAlign: "middle",
                          marginRight: 7,
                        }}
                      />

                      Email verified successfully.
                      Complete your registration below.
                    </div>
                  )}

                  {/* =====================================
                      ERROR
                  ===================================== */}

                  {error && (
                    <div
                      className={styles.error}
                      role="alert"
                    >
                      {error}
                    </div>
                  )}

                  {/* =====================================
                      VERIFY / REGISTER BUTTON
                  ===================================== */}

                  <button
                    type="submit"
                    className={styles.submitButton}
                    disabled={
                      loading ||
                      (!registrationToken &&
                        otp.length !== 6)
                    }
                  >
                    {loading ? (
                      "Please wait..."
                    ) : registrationToken ? (
                      <>
                        Complete Registration
                        <ArrowRight size={19} />
                      </>
                    ) : (
                      <>
                        Verify & Create Account
                        <ArrowRight size={19} />
                      </>
                    )}
                  </button>

                  {/* =====================================
                      RESEND / EDIT DETAILS
                  ===================================== */}

                  <div className={styles.otpActions}>
                    {!registrationToken && (
                      <button
                        type="button"
                        onClick={resendOtp}
                        disabled={
                          sendingOtp ||
                          loading ||
                          resendCooldown > 0
                        }
                      >
                        <RefreshCw
                          size={14}
                          style={{
                            verticalAlign: "middle",
                            marginRight: 5,
                          }}
                        />

                        {sendingOtp
                          ? "Sending..."
                          : resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : "Resend Code"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={editRegistration}
                      disabled={
                        loading || sendingOtp
                      }
                    >
                      <ArrowLeft
                        size={14}
                        style={{
                          verticalAlign: "middle",
                          marginRight: 5,
                        }}
                      />

                      Edit Details
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* =============================================
              LOGIN LINK
          ============================================= */}

          {!success && (
            <>
              <div className={styles.divider}>
                <span></span>
                <p>ALREADY A MEMBER?</p>
                <span></span>
              </div>

              <Link
                to="/login"
                className={styles.loginButton}
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* ===============================================
            FOOTER
        =============================================== */}

        <div className={styles.footer}>
          © {new Date().getFullYear()} Elevate World
          Community
        </div>
      </div>
    </div>
  );
};

export default Register;
