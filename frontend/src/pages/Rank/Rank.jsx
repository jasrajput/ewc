
import { useEffect, useState } from "react";
import {
  Award,
  Check,
  CheckCircle2,
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

const formatUsd = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const getPercentage = (current, required) => {
  const target = Number(required || 0);

  if (target <= 0) return 100;

  return Math.min(
    100,
    Math.max(0, (Number(current || 0) / target) * 100)
  );
};

const ProgressRow = ({
  label,
  current,
  required,
  completed,
  isMoney = true,
}) => {
  const displayValue = (value) =>
    isMoney ? formatUsd(value) : Number(value || 0);

  return (
    <div className={styles.requirement}>
      <div className={styles.requirementTop}>
        <span>{label}</span>

        <strong className={completed ? styles.completedValue : ""}>
          {displayValue(current)} / {displayValue(required)}
        </strong>
      </div>

      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{
            width: `${getPercentage(current, required)}%`,
          }}
        />
      </div>
    </div>
  );
};

const Rank = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchRankProgress = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/rank/progress");

        if (mounted) {
          setData(response.data.data);
        }
      } catch (err) {
        console.error("Rank progress error:", err);

        if (mounted) {
          setError(
            err.response?.data?.message ||
              "Unable to load rank progress."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchRankProgress();

    return () => {
      mounted = false;
    };
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

  const personalInvestment = Number(
    data?.personalInvestment || 0
  );

  const directBusiness = Number(data?.directBusiness || 0);
  const teamBusiness = Number(data?.teamBusiness || 0);

  const nextRankLevel = data?.nextRank?.level ?? null;

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
          {/* ==========================================
              SUMMARY
          ========================================== */}

          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <Trophy size={21} />
              </div>

              <div className={styles.summaryInfo}>
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

              <div className={styles.summaryInfo}>
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

              <div className={styles.summaryInfo}>
                <span>Personal Investment</span>
                <strong>{formatUsd(personalInvestment)}</strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <CircleDollarSign size={21} />
              </div>

              <div className={styles.summaryInfo}>
                <span>Direct Business</span>
                <strong>{formatUsd(directBusiness)}</strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <UsersRound size={21} />
              </div>

              <div className={styles.summaryInfo}>
                <span>Community Business</span>
                <strong>{formatUsd(teamBusiness)}</strong>
              </div>
            </div>
          </div>

          {/* ==========================================
              SECTION HEADER
          ========================================== */}

          <div className={styles.sectionHeader}>
            <div>
              <span>ELEVATOR RANKS</span>
              <h2>Rank Requirements</h2>
            </div>

            <p>
              Personal investment is mandatory. Qualify through
              Direct Business or Community Business with
              the required E-rank members.
            </p>
          </div>

          {/* ==========================================
              RANK CARDS
          ========================================== */}

          <div className={styles.rankGrid}>
            {(data.ranks || []).map((rank) => {
              const personalRequired = Number(
                rank.personalInvestment ??
                  rank.progress?.personalInvestment?.required ??
                  0
              );

              const personalCurrent = Number(
                rank.progress?.personalInvestment?.current ??
                  personalInvestment
              );

              const directRequired = Number(
                rank.progress?.directBusiness?.required ??
                  rank.directBusiness ??
                  0
              );

              const directCurrent = Number(
                rank.progress?.directBusiness?.current ??
                  directBusiness
              );

              const teamRequired = Number(
                rank.progress?.teamBusiness?.required ??
                  rank.teamBusiness ??
                  0
              );

              const teamCurrent = Number(
                rank.progress?.teamBusiness?.current ??
                  teamBusiness
              );

              const requiredRankCount = Number(
                rank.progress?.rankMembers?.required ??
                  rank.requiredRankCount ??
                  0
              );

              const rankMembersCurrent = Number(
                rank.progress?.rankMembers?.current ?? 0
              );

              const requiredRankLevel = Number(
                rank.requiredRank || 0
              );

              const personalCompleted =
                personalCurrent >= personalRequired;

              const directCompleted =
                directCurrent >= directRequired;

              const teamCompleted =
                teamCurrent >= teamRequired;

              const rankMembersCompleted =
                requiredRankCount === 0 ||
                rankMembersCurrent >= requiredRankCount;

              const communityCompleted =
                teamCompleted && rankMembersCompleted;

              const eligible =
                personalCompleted &&
                (directCompleted || communityCompleted);

              const isNextRank =
                Number(rank.level) === Number(nextRankLevel);

              const directProgress = getPercentage(
                directCurrent,
                directRequired
              );

              const teamProgress = getPercentage(
                teamCurrent,
                teamRequired
              );

              const personalProgress = getPercentage(
                personalCurrent,
                personalRequired
              );

              const nextProgress =
                Math.max(directProgress, teamProgress);

              return (
                <div
                  key={rank.level}
                  className={[
                    styles.rankCard,
                    rank.achieved ? styles.achievedCard : "",
                    isNextRank ? styles.nextRankCard : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* HEADER */}

                  <div className={styles.rankHeader}>
                    <div className={styles.rankTitle}>
                      <div className={styles.rankIcon}>
                        {Number(rank.level) >= 11 ? (
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

                  {/* ACHIEVED */}

                  {rank.achieved && (
                    <div className={styles.achievedBadge}>
                      <Check size={13} />
                      Rank Achieved
                    </div>
                  )}

                  {/* MANDATORY PERSONAL INVESTMENT */}

                  <div className={styles.personalRequirement}>
                    <div className={styles.personalTop}>
                      <div className={styles.personalLabel}>
                        {personalCompleted ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <Wallet size={16} />
                        )}

                        <span>Personal Investment</span>

                        <small>Required</small>
                      </div>

                      <strong>
                        {formatUsd(personalCurrent)}
                        {" / "}
                        {formatUsd(personalRequired)}
                      </strong>
                    </div>

                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${personalProgress}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* PATH 1 */}

                  <div className={styles.businessSection}>
                    <ProgressRow
                      label="Direct Business"
                      current={directCurrent}
                      required={directRequired}
                      completed={directCompleted}
                    />
                  </div>

                  {/* OR SEPARATOR */}

                  <div className={styles.orSeparator}>
                    <span>OR</span>
                  </div>

                  {/* PATH 2 */}

                  <div className={styles.businessSection}>
                    <ProgressRow
                      label="Community Business"
                      current={teamCurrent}
                      required={teamRequired}
                      completed={teamCompleted}
                    />

                    <div className={styles.membersRow}>
                      {requiredRankCount > 0 ? (
                        <>
                          <span>
                            E-
                            {String(requiredRankLevel).padStart(
                              2,
                              "0"
                            )}
                            + Direct Members
                          </span>

                          <strong
                            className={
                              rankMembersCompleted
                                ? styles.completedValue
                                : ""
                            }
                          >
                            {rankMembersCurrent} /{" "}
                            {requiredRankCount}
                          </strong>
                        </>
                      ) : (
                        <>
                          <span>E-rank Members</span>
                          <strong>Not Required</strong>
                        </>
                      )}
                    </div>

                    {requiredRankCount > 0 && (
                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          style={{
                            width: `${getPercentage(
                              rankMembersCurrent,
                              requiredRankCount
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* FOOTER */}

                  {isNextRank && !rank.achieved && (
                    <div className={styles.nextRankFooter}>
                      {eligible ? (
                        <>
                          <CheckCircle2 size={14} />
                          Qualification requirements met
                        </>
                      ) : !personalCompleted ? (
                        <>
                          <Target size={14} />
                          Personal investment required to advance
                        </>
                      ) : (
                        <>
                          <Target size={14} />
                          Next Rank ·{" "}
                          {Math.round(nextProgress)}% business progress
                        </>
                      )}
                    </div>
                  )}

                  {!isNextRank && eligible && !rank.achieved && (
                    <div className={styles.eligibleFooter}>
                      <CheckCircle2 size={14} />
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
