import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";

import UserLayout from "../../components/layout/UserLayout";
import api from "../../services/api";
import styles from "./Security.module.css";

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

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));

    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (
      !form.currentPassword ||
      !form.newPassword ||
      !form.confirmPassword
    ) {
      setError("All password fields are required.");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    try {
      setSaving(true);

      const response = await api.put(
        "/account/password",
        form
      );

      setSuccess(response.data.message);

      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to update password."
      );
    } finally {
      setSaving(false);
    }
  };

  const PasswordInput = ({
    label,
    name,
    visible,
    toggle,
  }) => (
    <div className={styles.formGroup}>
      <label>{label}</label>

      <div className={styles.passwordInput}>
        <input
          type={visible ? "text" : "password"}
          name={name}
          value={form[name]}
          onChange={handleChange}
          autoComplete="off"
        />

        <button type="button" onClick={toggle}>
          {visible ? (
            <EyeOff size={17} />
          ) : (
            <Eye size={17} />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <UserLayout
      title="Security"
      subtitle="Manage your account security"
    >
      <div className={styles.container}>
        <section className={styles.settingsCard}>
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

          <div className={styles.securityNote}>
            <ShieldCheck size={18} />

            <span>
              Your current password is required before a
              new password can be set.
            </span>
          </div>

          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}

          {success && (
            <div className={styles.successMessage}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <PasswordInput
              label="Current Password"
              name="currentPassword"
              visible={show.current}
              toggle={() =>
                setShow((prev) => ({
                  ...prev,
                  current: !prev.current,
                }))
              }
            />

            <PasswordInput
              label="New Password"
              name="newPassword"
              visible={show.new}
              toggle={() =>
                setShow((prev) => ({
                  ...prev,
                  new: !prev.new,
                }))
              }
            />

            <PasswordInput
              label="Confirm New Password"
              name="confirmPassword"
              visible={show.confirm}
              toggle={() =>
                setShow((prev) => ({
                  ...prev,
                  confirm: !prev.confirm,
                }))
              }
            />

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