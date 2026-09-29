import { ArrowLeft, Save } from "lucide-react";

import { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import adminApi from "../../../services/adminApi";

import AdminLayout from "../../../components/admin/layout/AdminLayout";
import AdminButton from "../../../components/admin/ui/AdminButton";
import AdminFormField from "../../../components/admin/ui/AdminFormField";
import AdminLoader from "../../../components/admin/ui/AdminLoader";
import AdminStatusBadge from "../../../components/admin/ui/AdminStatusBadge";

import styles from "./AdminEditMember.module.css";

const AdminEditMember = () => {
  const { id } = useParams();

  const navigate = useNavigate();

  const [member, setMember] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile_no: "",
    country: "",
    trx: "",
  });

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  // ========================================
  // LOAD
  // ========================================

  useEffect(() => {
    const loadMember = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await adminApi.get(`/admin/members/${id}`);

        const loadedMember = response.data.data.member;

        setMember(loadedMember);

        setForm({
          name: loadedMember.name || "",
          email: loadedMember.email || "",
          mobile_no: loadedMember.mobile_no || "",
          country: loadedMember.country || "",
          trx: loadedMember.trx || "",
        });
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          navigate("/admin/login", { replace: true });

          return;
        }

        setError(err.response?.data?.message || "Unable to load member.");
      } finally {
        setLoading(false);
      }
    };

    loadMember();
  }, [id, navigate]);

  // ========================================
  // FORM
  // ========================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await adminApi.patch(`/admin/members/${id}/profile`, form);

      setSuccess("Member profile updated successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update member.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Edit Member" subtitle="Member administration">
        <div className={styles.loading}>
          <AdminLoader text="Loading member..." />
        </div>
      </AdminLayout>
    );
  }

  if (!member) {
    return (
      <AdminLayout title="Edit Member" subtitle="Member administration">
        <div className={styles.error}>{error || "Member not found."}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Edit Member"
      subtitle={`${member.user_id} • Profile administration`}
    >
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate(`/admin/members/${id}`)}
      >
        <ArrowLeft size={16} />
        Member Details
      </button>

      <section className={styles.hero}>
        <div className={styles.avatar}>
          {String(member.name || member.user_id)
            .charAt(0)
            .toUpperCase()}
        </div>

        <div>
          <h2>{member.name || member.user_id}</h2>

          <div className={styles.identity}>
            <span>{member.user_id}</span>

            <AdminStatusBadge variant={member.blocked ? "danger" : "success"}>
              {member.blocked ? "Blocked" : "Active"}
            </AdminStatusBadge>
          </div>
        </div>
      </section>

      <div className={styles.layout}>
        <form className={styles.formPanel} onSubmit={handleSubmit}>
          <div className={styles.formHeading}>
            <span>PROFILE INFORMATION</span>

            <h3>Edit User</h3>

            <p>Update ordinary profile information for this member.</p>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {success && <div className={styles.success}>{success}</div>}

          <div className={styles.formGrid}>
            <AdminFormField
              label="Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Member name"
            />

            <AdminFormField
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Email address"
            />

            <AdminFormField
              label="Mobile Number"
              name="mobile_no"
              value={form.mobile_no}
              onChange={handleChange}
              placeholder="Mobile number"
            />

            <AdminFormField
              label="Country"
              name="country"
              value={form.country}
              onChange={handleChange}
              placeholder="Country"
            />

            <div className={styles.walletField}>
              <AdminFormField
                label="BEP-20 Withdrawal Wallet"
                name="trx"
                value={form.trx}
                onChange={handleChange}
                placeholder="0x..."
              />

              <span className={styles.fieldHint}>
                BNB Smart Chain wallet address. Each wallet can only belong to
                one member.
              </span>
            </div>
          </div>

          <div className={styles.formActions}>
            <AdminButton
              variant="secondary"
              type="button"
              disabled={saving}
              onClick={() => navigate(`/admin/members/${id}`)}
            >
              Cancel
            </AdminButton>

            <AdminButton
              variant="primary"
              type="submit"
              icon={Save}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </AdminButton>
          </div>
        </form>

        {/* =================================
            PROTECTED FIELDS
        ================================= */}

        <aside className={styles.protectedPanel}>
          <span className={styles.protectedEyebrow}>PROTECTED INFORMATION</span>

          <h3>Managed Separately</h3>

          <p>
            These values cannot be changed through the normal member profile
            form.
          </p>

          <ProtectedRow label="User ID" value={member.user_id} />

          <ProtectedRow
            label="Sponsor"
            value={member.sponsor?.user_id || "—"}
          />

          <ProtectedRow
            label="Package"
            value={
              member.activated
                ? `Package ${member.package_choose}`
                : "Not Activated"
            }
          />

          <ProtectedRow label="Rank" value={member.rank} />

          <ProtectedRow
  label="Withdrawal Wallet"
  value={
    member.trx
      ? `${member.trx.slice(0, 8)}...${member.trx.slice(-6)}`
      : "Not registered"
  }
/>

          <div className={styles.protectedNote}>
            Account access, ROI, wallet, package, sponsor,
rank and password require separate administrative operations.
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
};

const ProtectedRow = ({ label, value }) => (
  <div className={styles.protectedRow}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

export default AdminEditMember;
