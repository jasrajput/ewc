
import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Crown,
  History,
  Trophy,
  Wallet,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./MonthlyAllowance.module.css";

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const dateText = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export default function MonthlyAllowance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await api.get("/monthly-allowance");

        if (!response.data?.success) {
          throw new Error("Unable to load allowance");
        }

        if (mounted) setData(response.data.data);
      } catch (err) {
        if (mounted) {
          setError(
            err.response?.data?.message ||
              err.message ||
              "Unable to load monthly allowance"
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <UserLayout
        title="Monthly Performance Allowance"
        subtitle="Your rank-based monthly rewards"
      >
        <div className={styles.loading}>
          Loading allowance details...
        </div>
      </UserLayout>
    );
  }

  const currentRank = Number(data?.currentRank || 0);
  const progress =
    Number(data?.maxPayments || 0) > 0
      ? Math.min(
          100,
          (Number(data?.paymentsAtRank || 0) /
            Number(data.maxPayments)) *
            100
        )
      : 0;

  return (
    <UserLayout
      title="Monthly Performance Allowance"
      subtitle="Track your rank-based monthly rewards"
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
                <strong>{data.currentRankName}</strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <Wallet size={21} />
              </div>
              <div>
                <span>Monthly Allowance</span>
                <strong>{money(data.monthlyAmount)}</strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <CalendarClock size={21} />
              </div>
              <div>
                <span>Next Payment</span>
                <strong>{dateText(data.nextPaymentAt)}</strong>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <CheckCircle2 size={21} />
              </div>
              <div>
                <span>Total Received</span>
                <strong>{money(data.totalEarned)}</strong>
              </div>
            </div>
          </div>

          <div className={styles.mainGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span>YOUR ALLOWANCE</span>
                  <h2>Current Eligibility</h2>
                </div>

                <span
                  className={`${styles.status} ${
                    data.status === "active"
                      ? styles.active
                      : styles.inactive
                  }`}
                >
                  {data.status === "active"
                    ? "Active"
                    : data.status === "completed"
                    ? "Period Completed"
                    : data.status === "pending_activation"
                    ? "Pending Activation"
                    : "Not Qualified"}
                </span>
              </div>

              <div className={styles.allowanceAmount}>
                {money(data.monthlyAmount)}
                <span> / month</span>
              </div>

              <p className={styles.description}>
                {currentRank < 2
                  ? "Achieve E-02 or higher to become eligible for the Monthly Performance Allowance."
                  : data.status === "completed"
                  ? "Your allowance period at this rank is complete. Advance to a higher rank to qualify again."
                  : "Your next payment uses your eligible rank on the scheduled payment date. Promotion does not restart the countdown."}
              </p>

              <div className={styles.progressHeader}>
                <span>Payments at Current Rank</span>
                <strong>
                  {data.paymentsAtRank} / {data.maxPayments}
                </strong>
              </div>

              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className={styles.details}>
                <div>
                  <span>Rank Achieved</span>
                  <strong>{dateText(data.rankStartedAt)}</strong>
                </div>
                <div>
                  <span>Remaining Payments</span>
                  <strong>{data.remainingPayments}</strong>
                </div>
                <div>
                  <span>Next Scheduled Payment</span>
                  <strong>{dateText(data.nextPaymentAt)}</strong>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span>PAYMENT RULES</span>
                  <h2>How It Works</h2>
                </div>
                <Clock3 size={20} className={styles.goldIcon} />
              </div>

              <div className={styles.rules}>
                <div>
                  <span className={styles.ruleNumber}>01</span>
                  <p>
                    First payment is due after completing
                    one month of eligibility.
                  </p>
                </div>
                <div>
                  <span className={styles.ruleNumber}>02</span>
                  <p>
                    E-02 to E-06 receive up to three
                    monthly payments at the same rank.
                  </p>
                </div>
                <div>
                  <span className={styles.ruleNumber}>03</span>
                  <p>
                    E-07 to E-12 receive up to six
                    monthly payments at the same rank.
                  </p>
                </div>
                <div>
                  <span className={styles.ruleNumber}>04</span>
                  <p>
                    When promoted, the next payment uses
                    the new rank amount without resetting
                    the existing countdown.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className={styles.sectionHeading}>
            <div>
              <span>ELEVATOR BENEFITS</span>
              <h2>Monthly Allowance Structure</h2>
            </div>
          </div>

          <div className={styles.rankGrid}>
            {(data.ranks || []).map((rank) => {
              const isCurrent = rank.level === currentRank;
              const isAchieved = rank.level < currentRank;

              return (
                <div
                  key={rank.level}
                  className={`${styles.rankCard} ${
                    isCurrent ? styles.currentRankCard : ""
                  }`}
                >
                  <div className={styles.rankTop}>
                    <div className={styles.rankName}>
                      {rank.level >= 11 ? (
                        <Crown size={19} />
                      ) : (
                        <Trophy size={19} />
                      )}
                      <strong>{rank.name}</strong>
                    </div>

                    {isCurrent && (
                      <span className={styles.currentBadge}>
                        Current
                      </span>
                    )}

                    {isAchieved && (
                      <CheckCircle2
                        size={16}
                        className={styles.achievedIcon}
                      />
                    )}
                  </div>

                  <div className={styles.rankAmount}>
                    {money(rank.monthlyAmount)}
                    <span> / month</span>
                  </div>

                  <div className={styles.rankBottom}>
                    <span>Maximum Duration</span>
                    <strong>
                      {rank.maxPayments === 0
                        ? "Not Eligible"
                        : `${rank.maxPayments} Months`}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.sectionHeading}>
            <div>
              <span>YOUR TRANSACTIONS</span>
              <h2>Allowance Payment History</h2>
            </div>
            <History size={19} className={styles.goldIcon} />
          </div>

          <div className={styles.historyPanel}>
            {!data.payments?.length ? (
              <div className={styles.emptyHistory}>
                <History size={28} />
                <strong>No payments yet</strong>
                <span>
                  Your monthly allowance payments will
                  appear here once credited.
                </span>
              </div>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Rank</th>
                      <th>Payment #</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{dateText(payment.paid_at)}</td>
                        <td>
                          E-
                          {String(payment.rank_level).padStart(
                            2,
                            "0"
                          )}
                        </td>
                        <td>
                          #{payment.payment_number_at_rank}
                        </td>
                        <td className={styles.amountCell}>
                          +{money(payment.amount)}
                        </td>
                        <td>
                          <span className={styles.paidBadge}>
                            <CheckCircle2 size={13} />
                            Paid
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </UserLayout>
  );
}
