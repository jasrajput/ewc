import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Network,
  Search,
  UserCheck,
  UserX,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./Network.module.css";

const LevelGenealogy = () => {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [levelMembers, setLevelMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [search, setSearch] = useState("");

  // =====================================================
  // FETCH LEVEL SUMMARY
  // =====================================================

  useEffect(() => {
    const fetchLevels = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/team/levels");
        setLevels(response.data.data || []);
      } catch (err) {
        console.error("Level genealogy error:", err);

        setError(
          err.response?.data?.message ||
          "Failed to load level genealogy."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchLevels();
  }, []);

  // =====================================================
  // TOTAL SUMMARY
  // =====================================================

  const summary = useMemo(() => {
    return levels.reduce(
      (total, level) => {
        total.members += Number(level.total_team || 0);
        total.active += Number(level.active_team || 0);
        total.inactive += Number(level.inactive_team || 0);
        total.investment += Number(level.total_investment || 0);

        return total;
      },
      {
        members: 0,
        active: 0,
        inactive: 0,
        investment: 0,
      }
    );
  }, [levels]);

  // =====================================================
  // OPEN LEVEL MEMBERS
  // =====================================================

  const openLevelMembers = async (level) => {
    setSelectedLevel(level);
    setModalOpen(true);
    setSearch("");
    setLevelMembers([]);
    setMembersError("");
    setMembersLoading(true);

    try {
      const response = await api.get(`/team/levels/${level}`);
      setLevelMembers(response.data.data || []);
    } catch (err) {
      console.error("Level members error:", err);

      setMembersError(
        err.response?.data?.message ||
        "Failed to load level members."
      );
    } finally {
      setMembersLoading(false);
    }
  };

  // =====================================================
  // CLOSE MODAL
  // =====================================================

  const closeModal = () => {
    setModalOpen(false);
    setSelectedLevel(null);
    setLevelMembers([]);
    setMembersError("");
    setSearch("");
  };

  // =====================================================
  // FILTER MEMBERS
  // =====================================================

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return levelMembers;

    const keyword = search.toLowerCase();

    return levelMembers.filter((member) => {
      return (
        member.user_id?.toLowerCase().includes(keyword) ||
        member.name?.toLowerCase().includes(keyword) ||
        member.real_sponsor_id?.toLowerCase().includes(keyword)
      );
    });
  }, [levelMembers, search]);

  // =====================================================
  // SELECTED LEVEL SUMMARY
  // =====================================================

  const selectedLevelData = levels.find(
    (item) => Number(item.level) === Number(selectedLevel)
  );

  // =====================================================
  // FORMATTERS
  // =====================================================

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
    <UserLayout
      title="Level Genealogy"
      subtitle="Level-wise community overview"
    >
      {/* =================================================
          PAGE HEADER
      ================================================= */}

      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>MY TEAM</span>
          <h2>Level Genealogy</h2>
          <p>
            Track your community growth and investment across each level.
          </p>
        </div>
      </section>

      {/* =================================================
          SUMMARY
      ================================================= */}

      <section className={styles.levelStats}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Users size={20} />
          </div>

          <div>
            <span>Total Team</span>
            <strong>{summary.members}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <UserCheck size={20} />
          </div>

          <div>
            <span>Active Team</span>
            <strong>{summary.active}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <UserX size={20} />
          </div>

          <div>
            <span>Inactive Team</span>
            <strong>{summary.inactive}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <WalletCards size={20} />
          </div>

          <div>
            <span>Total Investment</span>
            <strong>{formatUsd(summary.investment)}</strong>
          </div>
        </div>
      </section>

      {/* =================================================
          LEVEL CARDS
      ================================================= */}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>LEVEL BREAKDOWN</span>
            <h3>Your Community by Level</h3>
          </div>

          <span className={styles.levelCount}>
            {levels.length} Levels
          </span>
        </div>

        {error && (
          <div className={styles.errorBox}>
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>
            <span className={styles.spinner} />
            <span>Loading levels...</span>
          </div>
        ) : levels.length === 0 ? (
          <div className={styles.emptyState}>
            <Network size={28} />
            <strong>No level data yet</strong>
            <span>Your level-wise community will appear here.</span>
          </div>
        ) : (
          <div className={styles.levelGrid}>
            {levels.map((item) => (
              <div className={styles.levelCard} key={item.level}>
                <div className={styles.levelCardTop}>
                  <div>
                    <span>TEAM LEVEL</span>
                    <strong>Level {item.level}</strong>
                  </div>

                  <div className={styles.levelNumber}>
                    {item.level}
                  </div>
                </div>

                <div className={styles.levelMembers}>
                  <Users size={17} />

                  <div>
                    <strong>{item.total_team}</strong>
                    <span>Total Members</span>
                  </div>
                </div>

                <div className={styles.levelDetails}>
                  <div>
                    <span>Active</span>
                    <strong className={styles.activeText}>
                      {item.active_team}
                    </strong>
                  </div>

                  <div>
                    <span>Inactive</span>
                    <strong>{item.inactive_team}</strong>
                  </div>

                  <div>
                    <span>Investment</span>
                    <strong>
                      {formatUsd(item.total_investment)}
                    </strong>
                  </div>
                </div>

                <button
                  className={styles.viewLevelButton}
                  onClick={() => openLevelMembers(item.level)}
                >
                  View Members
                  <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* =================================================
          LEVEL MEMBERS MODAL
      ================================================= */}

      {modalOpen && (
        <div
          className={styles.modalOverlay}
          onMouseDown={closeModal}
        >
          <div
            className={styles.membersModal}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* HEADER */}

            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>
                  LEVEL DETAILS
                </span>

                <h3>Level {selectedLevel} Members</h3>

                <p>
                  {selectedLevelData?.total_team || 0} members
                  <span>•</span>
                  {formatUsd(
                    selectedLevelData?.total_investment || 0
                  )}{" "}
                  total investment
                </p>
              </div>

              <button
                className={styles.modalClose}
                onClick={closeModal}
              >
                <X size={18} />
              </button>
            </div>

            {/* MINI STATS */}

            <div className={styles.modalStats}>
              <div>
                <span>Total Members</span>
                <strong>
                  {selectedLevelData?.total_team || 0}
                </strong>
              </div>

              <div>
                <span>Active</span>
                <strong className={styles.activeText}>
                  {selectedLevelData?.active_team || 0}
                </strong>
              </div>

              <div>
                <span>Inactive</span>
                <strong>
                  {selectedLevelData?.inactive_team || 0}
                </strong>
              </div>

              <div>
                <span>Investment</span>
                <strong>
                  {formatUsd(
                    selectedLevelData?.total_investment || 0
                  )}
                </strong>
              </div>
            </div>

            {/* SEARCH */}

            <div className={styles.modalToolbar}>
              <div className={styles.searchBox}>
                <Search size={15} />

                <input
                  type="text"
                  placeholder="Search ID, name or sponsor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {!membersLoading && (
                <span className={styles.resultCount}>
                  {filteredMembers.length} members
                </span>
              )}
            </div>

            {/* CONTENT */}

            <div className={styles.modalContent}>
              {membersError && (
                <div className={styles.errorBox}>
                  {membersError}
                </div>
              )}

              {membersLoading ? (
                <div className={styles.emptyState}>
                  <span className={styles.spinner} />
                  <span>Loading members...</span>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className={styles.emptyState}>
                  <Users size={28} />
                  <strong>No members found</strong>
                  <span>
                    No members match your current search.
                  </span>
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Partner ID</th>
                        <th>Name</th>
                        <th>Sponsor</th>
                        <th>Package</th>
                        <th>Status</th>
                        <th>Date Joined</th>
                        <th>Activation Date</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredMembers.map((member, index) => {
                        const active =
                          Number(member.status) === 1;

                        return (
                          <tr
                            key={`${member.from_id}-${member.level}`}
                          >
                            <td>#{index + 1}</td>

                            <td>
                              <strong
                                className={styles.partnerId}
                              >
                                {member.user_id}
                              </strong>
                            </td>

                            <td>
                              {member.name || "—"}
                            </td>

                            <td>
                              {member.real_sponsor_id || "—"}
                            </td>

                            <td>
                              {formatUsd(
                                member.package_amount
                              )}
                            </td>

                            <td>
                              <span
                                className={
                                  active
                                    ? styles.activeStatus
                                    : styles.inactiveStatus
                                }
                              >
                                {active
                                  ? "Active"
                                  : "Inactive"}
                              </span>
                            </td>

                            <td>
                              {formatDate(
                                member.dateOfJoining
                              )}
                            </td>

                            <td>
                              {formatDate(
                                member.date_of_activation
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </UserLayout>
  );
};

export default LevelGenealogy;