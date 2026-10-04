import { useEffect, useMemo, useState } from "react";
import { Search, Users, UserCheck } from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./Network.module.css";

const DirectPartners = () => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/team/directs");
        setPartners(response.data.data || []);
      } catch (err) {
        console.error("Direct partners error:", err);
        setError(err.response?.data?.message || "Failed to load direct partners.");
      } finally {
        setLoading(false);
      }
    };

    fetchPartners();
  }, []);

  const filteredPartners = useMemo(() => {
    if (!search.trim()) return partners;

    const keyword = search.toLowerCase();

    return partners.filter((item) =>
      item.user_id?.toLowerCase().includes(keyword) ||
      item.name?.toLowerCase().includes(keyword)
    );
  }, [partners, search]);

  const activePartners = partners.filter((item) => Number(item.package_choose) !== 1).length;

  const formatUsd = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  return (
    <UserLayout title="Direct Partners" subtitle="Members directly referred by you">
      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>MY TEAM</span>
          <h2>Direct Partners</h2>
          <p>View members who registered directly under your referral.</p>
        </div>
      </section>

      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><Users size={20} /></div>
          <div>
            <span>Total Direct Partners</span>
            <strong>{partners.length}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}><UserCheck size={20} /></div>
          <div>
            <span>Active Partners</span>
            <strong>{activePartners}</strong>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>DIRECT TEAM</span>
            <h3>Partner List</h3>
          </div>

          <div className={styles.searchBox}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search partner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>
            <span className={styles.spinner} />
            <span>Loading direct partners...</span>
          </div>
        ) : filteredPartners.length === 0 ? (
          <div className={styles.emptyState}>
            <Users size={28} />
            <strong>No direct partners found</strong>
            <span>Your directly referred members will appear here.</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Partner ID</th>
                  <th>Name</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Date Joined</th>
                  <th>Activation Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredPartners.map((partner, index) => {
                  const active = Number(partner.package_choose) !== 1;

                  return (
                    <tr key={partner.id}>
                      <td>#{index + 1}</td>
                      <td><strong className={styles.partnerId}>{partner.user_id}</strong></td>
                      <td>{partner.name || "—"}</td>
                      <td>{formatUsd(partner.package_amount)}</td>
                      <td>
                        <span className={active ? styles.activeStatus : styles.inactiveStatus}>
                          {active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{formatDate(partner.dateOfJoining)}</td>
                      <td>{formatDate(partner.date_of_activation)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </UserLayout>
  );
};

export default DirectPartners;