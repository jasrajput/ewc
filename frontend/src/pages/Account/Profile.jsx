import { useEffect, useState } from "react";
import { Mail, Phone, MapPin, UserRound, CalendarDays, Save } from "lucide-react";

import UserLayout from "../../components/layout/UserLayout";
import api from "../../services/api";
import styles from "./Profile.module.css";

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile_no: "",
    country: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/account/profile");
      const data = response.data.data;

      setProfile(data);

      setForm({
        name: data.name || "",
        email: data.email || "",
        mobile_no: data.mobile_no || "",
        country: data.country || "",
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to load profile."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await api.put(
        "/account/profile",
        form
      );

      setSuccess(response.data.message);
      await loadProfile();
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to update profile."
      );
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <UserLayout
        title="Profile"
        subtitle="Manage your personal information"
      >
        <div className={styles.loading}>
          Loading profile...
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout
      title="Profile"
      subtitle="Manage your personal information"
    >
      <div className={styles.pageGrid}>
        <section className={styles.profileCard}>
          <div className={styles.profileTop}>
            <div className={styles.avatar}>
              {profile?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            <div>
              <h2>{profile?.name}</h2>
              <span>@{profile?.user_id}</span>
            </div>
          </div>

          <div className={styles.infoList}>
            <div className={styles.infoItem}>
              <Mail size={18} />
              <div>
                <span>Email</span>
                <strong>{profile?.email || "—"}</strong>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Phone size={18} />
              <div>
                <span>Mobile</span>
                <strong>{profile?.mobile_no || "—"}</strong>
              </div>
            </div>

            <div className={styles.infoItem}>
              <MapPin size={18} />
              <div>
                <span>Country</span>
                <strong>
                  {profile?.country?.toUpperCase() || "—"}
                </strong>
              </div>
            </div>

            <div className={styles.infoItem}>
              <CalendarDays size={18} />
              <div>
                <span>Joined</span>
                <strong>
                  {formatDate(profile?.dateOfJoining)}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.editCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <UserRound size={20} />
            </div>

            <div>
              <h3>Personal Information</h3>
              <p>Update your account information.</p>
            </div>
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
            <div className={styles.formGroup}>
              <label>Username</label>

              <input
                value={profile?.user_id || ""}
                disabled
              />

              <small>Username cannot be changed.</small>
            </div>

            <div className={styles.formGroup}>
              <label>Full Name</label>

              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter your name"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Email Address</label>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Enter email address"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Mobile Number</label>

              <input
                type="text"
                name="mobile_no"
                value={form.mobile_no}
                onChange={handleChange}
                placeholder="+91..."
              />
            </div>

            <div className={styles.formGroup}>
              <label>Country</label>

              <input
                type="text"
                name="country"
                value={form.country}
                onChange={handleChange}
                placeholder="Country"
              />
            </div>

            <button
              type="submit"
              className={styles.saveButton}
              disabled={saving}
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </section>
      </div>
    </UserLayout>
  );
};

export default Profile;