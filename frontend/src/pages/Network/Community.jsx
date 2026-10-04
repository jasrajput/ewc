import { useEffect, useMemo, useState } from "react";
import { Network, Search, Users } from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./Network.module.css";

const Community = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCommunity = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/team/community");
        setMembers(response.data.data || []);
      } catch (err) {
        console.error("Community error:", err);
        setError(err.response?.data?.message || "Failed to load community.");
      } finally {
        setLoading(false);
      }
    };

    fetchCommunity();
  }, []);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;

    const keyword = search.toLowerCase();

    return members.filter((item) =>
      item.user_id?.toLowerCase().includes(keyword) ||
      item.name?.toLowerCase().includes(keyword) ||
      item.real_sponsor_id?.toLowerCase().includes(keyword)
    );
  }, [members, search]);

  const totalLevels = members.length
    ? Math.max(...members.map((item) => Number(item.level || 0)))
    : 0;

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
    <UserLayout title="Community" subtitle="Your complete EWC downline">
      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>MY TEAM</span>
          <h2>Community</h2>
          <p>View all members within your referral team.</p>
        </div>
      </section>

      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><Users size={20} /></div>
          <div>
            <span>Total Community</span>
            <strong>{members.length}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}><Network size={20} /></div>
          <div>
            <span>TEAM Levels</span>
            <strong>{totalLevels}</strong>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>DOWNLINE</span>
            <h3>Community Members</h3>
          </div>

          <div className={styles.searchBox}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>
            <span className={styles.spinner} />
            <span>Loading community...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className={styles.emptyState}>
            <Network size={28} />
            <strong>No community members found</strong>
            <span>Your downline members will appear here.</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Partner ID</th>
                  <th>Package</th>
                  <th>Level</th>
                  <th>Date Joined</th>
                  <th>Activation Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredMembers.map((member, index) => (
                  <tr key={`${member.from_id}-${member.level}`}>
                    <td>#{index + 1}</td>
                    <td><strong className={styles.partnerId}>{member.user_id}</strong></td>
                    <td>{formatUsd(member.package_amount)}</td>
                    <td><span className={styles.levelBadge}>Level {member.level}</span></td>
                    <td>{formatDate(member.dateOfJoining)}</td>
                    <td>{formatDate(member.date_of_activation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </UserLayout>
  );
};

export default Community;