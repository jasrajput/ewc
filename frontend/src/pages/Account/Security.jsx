
import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";

import UserLayout from "../../components/layout/UserLayout";
import api from "../../services/api";
import styles from "./Security.module.css";

// ======================================================
// PASSWORD INPUT
// Defined outside Security to prevent input focus loss.
// ======================================================

const PasswordInput = ({
  label,
  name,
  value,
  visible,
  toggle,
  onChange,
}) => (
  <div className={styles.formGroup}>
    <label htmlFor={name}>{label}</label>

    <div className={styles.passwordInput}>
      <input
        id={name}
        type={visible ? "text" : "password"}
        name={name}
        value={value}
        onChange={onChange}
        autoComplete={
          name === "currentPassword"
            ? "current-password"
            : "new-password"
        }
        required
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff size={17} />
        ) : (
          <Eye size={17} />
        )}
      </button>
    </div>
  </div>
);

// ======================================================
// SECURITY PAGE
// ======================================================

const Security = () => {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [show, setShow] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ====================================================
  // HANDLE INPUT CHANGE
  // ====================================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  // ====================================================
  // TOGGLE PASSWORD VISIBILITY
  // ====================================================

  const toggleVisibility = (field) => {
    setShow((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // ====================================================
  // CHANGE PASSWORD
  // ====================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (saving) return;

    setError("");
    setSuccess("");

    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = form;

    // Validate required fields
    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setError("All password fields are required.");
      return;
    }

    // Validate matching passwords
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    // Prevent reusing the current password
    if (currentPassword === newPassword) {
      setError(
        "New password must be different from your current password."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await api.put(
        "/account/password",
        {
          currentPassword,
          newPassword,
          confirmPassword,
        }
      );

      if (response.data?.success === false) {
        throw new Error(
          response.data?.message ||
          "Unable to update password."
        );
      }

      setSuccess(
        response.data?.message ||
        "Password updated successfully."
      );

      // Clear fields after successful update
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      // Hide passwords after successful update
      setShow({
        current: false,
        new: false,
        confirm: false,
      });
    } catch (err) {
      console.error("Password update error:", err);

      setError(
        err.response?.data?.message ||
        err.message ||
        "Unable to update password."
      );
    } finally {
      setSaving(false);
    }
  };

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <UserLayout
      title="Security"
      subtitle="Manage your account security"
    >
      <div className={styles.container}>
        <section className={styles.settingsCard}>
          {/* HEADER */}

          <div className={styles.cardHeader}>
            <div className={styles.iconBox}>
              <KeyRound size={21} />
            </div>

            <div>
              <h2>Change Password</h2>

              <p>
                Update the password used to access your
                EWC account.
              </p>
            </div>
          </div>

          {/* SECURITY NOTICE */}

          <div className={styles.securityNote}>
            <ShieldCheck size={18} />

            <span>
              Your current password is required before a
              new password can be set.
            </span>
          </div>

          {/* ERROR MESSAGE */}

          {error && (
            <div
              className={styles.errorMessage}
              role="alert"
            >
              {error}
            </div>
          )}

          {/* SUCCESS MESSAGE */}

          {success && (
            <div
              className={styles.successMessage}
              role="status"
            >
              {success}
            </div>
          )}

          {/* PASSWORD FORM */}

          <form onSubmit={handleSubmit}>
            <PasswordInput
              label="Current Password"
              name="currentPassword"
              value={form.currentPassword}
              visible={show.current}
              onChange={handleChange}
              toggle={() =>
                toggleVisibility("current")
              }
            />

            <PasswordInput
              label="New Password"
              name="newPassword"
              value={form.newPassword}
              visible={show.new}
              onChange={handleChange}
              toggle={() =>
                toggleVisibility("new")
              }
            />

            <PasswordInput
              label="Confirm New Password"
              name="confirmPassword"
              value={form.confirmPassword}
              visible={show.confirm}
              onChange={handleChange}
              toggle={() =>
                toggleVisibility("confirm")
              }
            />

            {/* SUBMIT BUTTON */}

            <button
              type="submit"
              className={styles.saveButton}
              disabled={saving}
            >
              <KeyRound size={17} />

              {saving
                ? "Updating..."
                : "Update Password"}
            </button>
          </form>
        </section>
      </div>
    </UserLayout>
  );
};

export default Security;
