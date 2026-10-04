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
              Complete the required direct business,
              community performance and rank structure.
            </p>
          </div>

          <div className={styles.rankGrid}>
            {data.ranks.map((rank) => {
              const directPercent = percentage(
                rank.progress.directBusiness.current,
                rank.progress.directBusiness.required
              );

              const teamPercent = percentage(
                rank.progress.teamBusiness.current,
                rank.progress.teamBusiness.required
              );

              const rankPercent =
                rank.requiredRankCount === 0
                  ? 100
                  : percentage(
                      rank.progress.rankMembers.current,
                      rank.progress.rankMembers.required
                    );

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

                  <div className={styles.requirement}>
                    <div className={styles.requirementTop}>
                      <span>Direct Business</span>

                      <strong>
                        {formatUsd(
                          rank.progress.directBusiness.current
                        )}
                        {" / "}
                        {formatUsd(
                          rank.progress.directBusiness.required
                        )}
                      </strong>
                    </div>

                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${directPercent}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className={styles.requirement}>
                    <div className={styles.requirementTop}>
                      <span>Community Business</span>

                      <strong>
                        {formatUsd(
                          rank.progress.teamBusiness.current
                        )}
                        {" / "}
                        {formatUsd(
                          rank.progress.teamBusiness.required
                        )}
                      </strong>
                    </div>

                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${teamPercent}%`,
                        }}
                      />
                    </div>
                  </div>

                  {rank.requiredRankCount > 0 && (
                    <div className={styles.requirement}>
                      <div className={styles.requirementTop}>
                        <span>
                          {rank.progress.rankMembers.requiredRank}+
                          Members
                        </span>

                        <strong>
                          {rank.progress.rankMembers.current}
                          {" / "}
                          {rank.progress.rankMembers.required}
                        </strong>
                      </div>

                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          style={{
                            width: `${rankPercent}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {rank.requiredRankCount === 0 && (
                    <div className={styles.firstRankNote}>
                      No ranked direct members required
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