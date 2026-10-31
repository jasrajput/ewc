
import { useEffect, useState } from "react";
import {
  Award,
  Check,
  CircleDollarSign,
  Crown,
  Target,
  Trophy,
  UsersRound,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./Rank.module.css";

// Updated EWC rank requirements.
// Qualification:
// Path 1: Direct Business
// OR
// Path 2: Community Business + required E-rank direct members.

const RANK_REQUIREMENTS = [
  { level: 1, directBusiness: 1000, teamBusiness: 1000, requiredRank: 0, requiredCount: 0 },
  { level: 2, directBusiness: 1500, teamBusiness: 3000, requiredRank: 1, requiredCount: 2 },
  { level: 3, directBusiness: 5000, teamBusiness: 10000, requiredRank: 2, requiredCount: 2 },
  { level: 4, directBusiness: 15000, teamBusiness: 30000, requiredRank: 3, requiredCount: 2 },
  { level: 5, directBusiness: 50000, teamBusiness: 100000, requiredRank: 4, requiredCount: 2 },
  { level: 6, directBusiness: 150000, teamBusiness: 300000, requiredRank: 5, requiredCount: 2 },
  { level: 7, directBusiness: 500000, teamBusiness: 1000000, requiredRank: 6, requiredCount: 2 },
  { level: 8, directBusiness: 1500000, teamBusiness: 3000000, requiredRank: 7, requiredCount: 2 },
  { level: 9, directBusiness: 5000000, teamBusiness: 10000000, requiredRank: 8, requiredCount: 2 },
  { level: 10, directBusiness: 15000000, teamBusiness: 30000000, requiredRank: 9, requiredCount: 2 },
  { level: 11, directBusiness: 50000000, teamBusiness: 100000000, requiredRank: 10, requiredCount: 2 },
  { level: 12, directBusiness: 250000000, teamBusiness: 500000000, requiredRank: 11, requiredCount: 2 },
];

const Rank = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchRankProgress = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/rank/progress");

        setData(response.data.data);
      } catch (err) {
        console.error("Rank progress error:", err);

        setError(
          err.response?.data?.message ||
          "Unable to load rank progress."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchRankProgress();
  }, []);

  const formatUsd = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const percentage = (current, required) => {
    if (!required) return 100;

    return Math.min(
      100,
      Math.round((Number(current || 0) / Number(required)) * 100)
    );
  };

  if (loading) {
    return (
      <UserLayout
        title="Rank & Progress"
        subtitle="Track your EWC rank progression"
      >
        <div className={styles.loading}>
          Loading rank progress...
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout
      title="Rank & Progress"
      subtitle="Track your EWC rank progression"
    >
      {error && (
        <div className={styles.errorBox}>
          {error}
        </div>
      )}

      {data && (
        <>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <Trophy size={21} />
              </div>

              <div>
                <span>Current Rank</span>
                <strong>
                  {data.currentRank?.name || "Unranked"}
                </strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <Target size={21} />
              </div>

              <div>
                <span>Next Rank</span>
                <strong>
                  {data.nextRank?.name || "Maximum Rank"}
                </strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <CircleDollarSign size={21} />
              </div>

              <div>
                <span>Direct Business</span>
                <strong>
                  {formatUsd(data.directBusiness)}
                </strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <UsersRound size={21} />
              </div>

              <div>
                <span>Community Business</span>
                <strong>
                  {formatUsd(data.teamBusiness)}
                </strong>
              </div>
            </div>
          </div>

          <div className={styles.sectionHeader}>
            <div>
              <span>ELEVATOR RANKS</span>
              <h2>Rank Requirements</h2>
            </div>

            <p>
              Qualify through Direct Business OR Community Business
              with the required E-rank members.
            </p>
          </div>

          <div className={styles.rankGrid}>
            {data.ranks.map((rank) => {
              const requirements = RANK_REQUIREMENTS.find(
                (item) => item.level === Number(rank.level)
              );

              if (!requirements) return null;

              const directCurrent = Number(
                rank.progress?.directBusiness?.current ??
                data.directBusiness ??
                0
              );

              const teamCurrent = Number(
                rank.progress?.teamBusiness?.current ??
                data.teamBusiness ??
                0
              );

              const membersCurrent = Number(
                rank.progress?.rankMembers?.current ?? 0
              );

              const {
                directBusiness: directRequired,
                teamBusiness: teamRequired,
                requiredRank,
                requiredCount,
              } = requirements;

              const directPercent = percentage(
                directCurrent,
                directRequired
              );

              const teamPercent = percentage(
                teamCurrent,
                teamRequired
              );

              const membersPercent = percentage(
                membersCurrent,
                requiredCount
              );

              const directQualified =
                directCurrent >= directRequired;

              const communityQualified =
                teamCurrent >= teamRequired &&
                membersCurrent >= requiredCount;

              const qualified =
                directQualified || communityQualified;

              const progressBar = (value, completed) => ({
                width: `${value}%`,
                ...(completed
                  ? { background: "#e9c45a" }
                  : {}),
              });

              return (
                <div
                  key={rank.level}
                  className={`${styles.rankCard} ${
                    rank.achieved ? styles.achievedCard : ""
                  }`}
                >
                  <div className={styles.rankHeader}>
                    <div className={styles.rankTitle}>
                      <div className={styles.rankIcon}>
                        {rank.level >= 11 ? (
                          <Crown size={21} />
                        ) : (
                          <Award size={21} />
                        )}
                      </div>

                      <div>
                        <span>Elevator Rank</span>
                        <h3>{rank.name}</h3>
                      </div>
                    </div>

                    <div className={styles.rankRight}>
                      <strong>
                        {rank.teamPercentage}%
                      </strong>
                      <span>Team Income</span>
                    </div>
                  </div>

                  {rank.achieved && (
                    <div className={styles.achievedBadge}>
                      <Check size={13} />
                      Achieved
                    </div>
                  )}

                  {/* PATH 1: DIRECT BUSINESS */}

                  <div
                    style={{
                      marginTop: 18,
                      padding: 14,
                      border: directQualified
                        ? "1px solid rgba(233,196,90,0.55)"
                        : "1px solid rgba(255,255,255,0.09)",
                      borderRadius: 10,
                      background: directQualified
                        ? "rgba(233,196,90,0.07)"
                        : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <strong
                        style={{
                          color: "#e9c45a",
                          fontSize: 13,
                        }}
                      >
                        Path 1 — Direct Business
                      </strong>

                      {directQualified && (
                        <span
                          style={{
                            color: "#e9c45a",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Check size={14} />
                          Qualified
                        </span>
                      )}
                    </div>

                    <div className={styles.requirement}>
                      <div className={styles.requirementTop}>
                        <span>Direct Business</span>

                        <strong>
                          {formatUsd(directCurrent)}
                          {" / "}
                          {formatUsd(directRequired)}
                        </strong>
                      </div>

                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          style={progressBar(
                            directPercent,
                            directQualified
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* OR SEPARATOR */}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      margin: "16px 0",
                    }}
                  >
                    <div
                      style={{
                        height: 1,
                        flex: 1,
                        background: "rgba(255,255,255,0.1)",
                      }}
                    />

                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#e9c45a",
                        letterSpacing: 1.5,
                      }}
                    >
                      OR
                    </span>

                    <div
                      style={{
                        height: 1,
                        flex: 1,
                        background: "rgba(255,255,255,0.1)",
                      }}
                    />
                  </div>

                  {/* PATH 2: COMMUNITY + E-MEMBERS */}

                  <div
                    style={{
                      padding: 14,
                      border: communityQualified
                        ? "1px solid rgba(233,196,90,0.55)"
                        : "1px solid rgba(255,255,255,0.09)",
                      borderRadius: 10,
                      background: communityQualified
                        ? "rgba(233,196,90,0.07)"
                        : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <strong
                        style={{
                          color: "#e9c45a",
                          fontSize: 13,
                        }}
                      >
                        Path 2 — Community Business
                      </strong>

                      {communityQualified && (
                        <span
                          style={{
                            color: "#e9c45a",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Check size={14} />
                          Qualified
                        </span>
                      )}
                    </div>

                    <div className={styles.requirement}>
                      <div className={styles.requirementTop}>
                        <span>Community Business</span>

                        <strong>
                          {formatUsd(teamCurrent)}
                          {" / "}
                          {formatUsd(teamRequired)}
                        </strong>
                      </div>

                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          style={progressBar(
                            teamPercent,
                            teamCurrent >= teamRequired
                          )}
                        />
                      </div>
                    </div>

                    {requiredCount > 0 ? (
                      <div
                        className={styles.requirement}
                        style={{ marginTop: 14 }}
                      >
                        <div className={styles.requirementTop}>
                          <span>
                            E-{String(requiredRank).padStart(2, "0")}+
                            {" "}Direct Members
                          </span>

                          <strong>
                            {membersCurrent}
                            {" / "}
                            {requiredCount}
                          </strong>
                        </div>

                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={progressBar(
                              membersPercent,
                              membersCurrent >= requiredCount
                            )}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className={styles.firstRankNote}>
                        No ranked direct members required
                      </div>
                    )}
                  </div>

                  {qualified && !rank.achieved && (
                    <div
                      style={{
                        marginTop: 12,
                        color: "#e9c45a",
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      Qualification requirements met
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </UserLayout>
  );
};

export default Rank;
