
import { useEffect, useState } from "react";
import {
  Award,
  Check,
  CircleDollarSign,
  Crown,
  Target,
  Trophy,
  UsersRound,
  Wallet,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./Rank.module.css";

const RANK_REQUIREMENTS = [
  { level: 1, personal: 50, direct: 1000, team: 1000, requiredRank: 0, count: 0 },
  { level: 2, personal: 50, direct: 1500, team: 3000, requiredRank: 1, count: 2 },
  { level: 3, personal: 50, direct: 5000, team: 10000, requiredRank: 2, count: 2 },
  { level: 4, personal: 100, direct: 15000, team: 30000, requiredRank: 3, count: 2 },
  { level: 5, personal: 200, direct: 50000, team: 100000, requiredRank: 4, count: 2 },
  { level: 6, personal: 300, direct: 150000, team: 300000, requiredRank: 5, count: 2 },
  { level: 7, personal: 500, direct: 500000, team: 1000000, requiredRank: 6, count: 2 },
  { level: 8, personal: 750, direct: 1500000, team: 3000000, requiredRank: 7, count: 2 },
  { level: 9, personal: 1500, direct: 5000000, team: 10000000, requiredRank: 8, count: 2 },
  { level: 10, personal: 3000, direct: 15000000, team: 30000000, requiredRank: 9, count: 2 },
  { level: 11, personal: 5000, direct: 50000000, team: 100000000, requiredRank: 10, count: 2 },
  { level: 12, personal: 10000, direct: 250000000, team: 500000000, requiredRank: 11, count: 2 },
];

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
    Math.max(0, (Number(current || 0) / Number(required)) * 100)
  );
};

const ProgressRow = ({
  label,
  current,
  required,
  completed,
  isMoney = true,
}) => (
  <div className={styles.requirement} style={{ marginTop: 12 }}>
    <div className={styles.requirementTop}>
      <span>{label}</span>
      <strong>
        {isMoney ? formatUsd(current) : current}
        {" / "}
        {isMoney ? formatUsd(required) : required}
      </strong>
    </div>

    <div className={styles.progressTrack}>
      <div
        className={styles.progressFill}
        style={{
          width: `${percentage(current, required)}%`,
          ...(completed ? { background: "#e9c45a" } : {}),
        }}
      />
    </div>
  </div>
);

const PathCard = ({ title, qualified, children }) => (
  <div
    style={{
      padding: 14,
      borderRadius: 10,
      border: qualified
        ? "1px solid rgba(233,196,90,0.55)"
        : "1px solid rgba(255,255,255,0.10)",
      background: qualified
        ? "rgba(233,196,90,0.07)"
        : "rgba(255,255,255,0.02)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <strong style={{ color: "#e9c45a", fontSize: 13 }}>
        {title}
      </strong>

      {qualified && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "#e9c45a",
            fontSize: 12,
          }}
        >
          <Check size={14} />
          Complete
        </span>
      )}
    </div>

    {children}
  </div>
);

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

  const personalInvestment =
    data?.personalInvestment ??
    data?.packageAmount ??
    null;

  return (
    <UserLayout
      title="Rank & Progress"
      subtitle="Track your EWC rank progression"
    >
      {error && (
        <div className={styles.errorBox}>{error}</div>
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
                <Wallet size={21} />
              </div>
              <div>
                <span>Personal Investment</span>
                <strong>
                  {personalInvestment === null
                    ? "Unavailable"
                    : formatUsd(personalInvestment)}
                </strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <CircleDollarSign size={21} />
              </div>
              <div>
                <span>Direct Business</span>
                <strong>{formatUsd(data.directBusiness)}</strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <UsersRound size={21} />
              </div>
              <div>
                <span>Community Business</span>
                <strong>{formatUsd(data.teamBusiness)}</strong>
              </div>
            </div>
          </div>

          <div className={styles.sectionHeader}>
            <div>
              <span>ELEVATOR RANKS</span>
              <h2>Rank Requirements</h2>
            </div>
            <p>
              Personal investment is mandatory. Then qualify
              through Direct Business OR Community Business
              with the required E-rank direct members.
            </p>
          </div>

          <div className={styles.rankGrid}>
            {(data.ranks || []).map((rank) => {
              const req = RANK_REQUIREMENTS.find(
                (r) => r.level === Number(rank.level)
              );

              if (!req) return null;

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

              const personalCurrent =
                personalInvestment === null
                  ? null
                  : Number(personalInvestment);

              const personalQualified =
                personalCurrent !== null &&
                personalCurrent >= req.personal;

              const directQualified =
                directCurrent >= req.direct;

              const communityQualified =
                teamCurrent >= req.team &&
                membersCurrent >= req.count;

              const requirementsMet =
                personalQualified &&
                (directQualified || communityQualified);

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
                      <strong>{rank.teamPercentage}%</strong>
                      <span>Team Income</span>
                    </div>
                  </div>

                  {rank.achieved && (
                    <div className={styles.achievedBadge}>
                      <Check size={13} />
                      Achieved
                    </div>
                  )}

                  <div style={{ marginTop: 18 }}>
                    <PathCard
                      title="Mandatory — Personal Investment"
                      qualified={personalQualified}
                    >
                      {personalCurrent === null ? (
                        <p style={{ fontSize: 12, color: "#f5b971" }}>
                          Personal investment data is not available
                          from the rank API.
                        </p>
                      ) : (
                        <ProgressRow
                          label="Your Investment"
                          current={personalCurrent}
                          required={req.personal}
                          completed={personalQualified}
                        />
                      )}
                    </PathCard>
                  </div>

                  <div
                    style={{
                      textAlign: "center",
                      color: "#9ca3af",
                      fontSize: 12,
                      margin: "14px 0",
                      fontWeight: 600,
                    }}
                  >
                    AND COMPLETE ONE OF THESE PATHS
                  </div>

                  <PathCard
                    title="Path 1 — Direct Business"
                    qualified={directQualified}
                  >
                    <ProgressRow
                      label="Direct Business"
                      current={directCurrent}
                      required={req.direct}
                      completed={directQualified}
                    />
                  </PathCard>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      margin: "14px 0",
                    }}
                  >
                    <div
                      style={{
                        height: 1,
                        flex: 1,
                        background: "rgba(255,255,255,0.1)",
                      }}
                    />
                    <strong
                      style={{
                        color: "#e9c45a",
                        fontSize: 12,
                        letterSpacing: 2,
                      }}
                    >
                      OR
                    </strong>
                    <div
                      style={{
                        height: 1,
                        flex: 1,
                        background: "rgba(255,255,255,0.1)",
                      }}
                    />
                  </div>

                  <PathCard
                    title="Path 2 — Community Business + E-Members"
                    qualified={communityQualified}
                  >
                    <ProgressRow
                      label="Community Business"
                      current={teamCurrent}
                      required={req.team}
                      completed={teamCurrent >= req.team}
                    />

                    {req.count > 0 ? (
                      <ProgressRow
                        label={`E-${String(req.requiredRank).padStart(2, "0")}+ Direct Members`}
                        current={membersCurrent}
                        required={req.count}
                        completed={membersCurrent >= req.count}
                        isMoney={false}
                      />
                    ) : (
                      <div className={styles.firstRankNote}>
                        No ranked direct members required
                      </div>
                    )}
                  </PathCard>

                  {requirementsMet && !rank.achieved && (
                    <div
                      style={{
                        marginTop: 14,
                        color: "#e9c45a",
                        textAlign: "center",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      All qualification requirements met
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
