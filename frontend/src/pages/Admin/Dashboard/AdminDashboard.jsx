import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  Coins,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import adminApi from "../../../services/adminApi";
import AdminLayout from "../../../components/admin/layout/AdminLayout";

import styles from "./AdminDashboard.module.css";

const AdminDashboard = () => {
  const navigate = useNavigate();

  const [dashboard, setDashboard] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let active = true;

    const fetchDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const response =
          await adminApi.get(
            "/admin/dashboard"
          );

        if (active) {
          setDashboard(
            response.data.data || null
          );
        }
      } catch (err) {
        console.error(
          "Admin dashboard error:",
          err
        );

        if (
          err.response?.status === 401 ||
          err.response?.status === 403
        ) {
          localStorage.removeItem(
            "ewc_admin_token"
          );

          localStorage.removeItem(
            "ewc_admin_user"
          );

          sessionStorage.removeItem(
            "ewc_admin_token"
          );

          sessionStorage.removeItem(
            "ewc_admin_user"
          );

          navigate(
            "/admin/login",
            { replace: true }
          );

          return;
        }

        if (active) {
          setError(
            err.response?.data?.message ||
              "Unable to load dashboard."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDashboard();

    return () => {
      active = false;
    };
  }, [navigate]);

  const overview =
    dashboard?.overview || {};

  const income =
    dashboard?.income || {};

  const withdrawals =
    dashboard?.withdrawals || {};

  const recentMembers =
    dashboard?.recentMembers || [];

  const recentTransactions =
    dashboard?.recentTransactions || [];

  const rankDistribution =
    dashboard?.rankDistribution || [];

  const formatUsd = (value) =>
    new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(Number(value || 0));

  const formatNumber = (value) =>
    new Intl.NumberFormat(
      "en-US"
    ).format(Number(value || 0));

  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleString(
      "en-US",
      {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  const maxRankTotal = useMemo(() => {
    if (!rankDistribution.length) {
      return 1;
    }

    return Math.max(
      ...rankDistribution.map(
        (item) =>
          Number(item.total || 0)
      ),
      1
    );
  }, [rankDistribution]);

  if (loading) {
    return (
      <AdminLayout
        title="Dashboard"
        subtitle="EWC platform overview and administration"
      >
        <div className={styles.loadingState}>
          <span
            className={styles.spinner}
          />

          <span>
            Loading administration data...
          </span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="EWC platform overview and administration"
    >
      {error && (
        <div className={styles.errorBox}>
          {error}
        </div>
      )}

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>
            EWC ADMINISTRATION
          </span>

          <h2>
            Platform Control Center
          </h2>

          <p>
            Monitor members, business,
            earnings and platform activity
            from one place.
          </p>
        </div>

        <div className={styles.heroStatus}>
          <span
            className={styles.statusDot}
          />

          <div>
            <span>System Status</span>
            <strong>Operational</strong>
          </div>
        </div>
      </section>

      <section className={styles.statsGrid}>
        <StatCard
          icon={Users}
          label="Total Members"
          value={formatNumber(
            overview.totalMembers
          )}
          detail={`${formatNumber(
            overview.todayRegistrations
          )} joined today`}
        />

        <StatCard
          icon={CircleDollarSign}
          label="Total Business"
          value={formatUsd(
            overview.totalBusiness
          )}
          detail={`${formatNumber(
            overview.activatedMembers
          )} activated members`}
        />

        <StatCard
          icon={Coins}
          label="Total Earnings"
          value={formatUsd(
            overview.totalIncome
          )}
          detail="Platform income distributed"
        />

        <StatCard
          icon={Clock3}
          label="Pending Withdrawals"
          value={formatUsd(
            withdrawals.pendingAmount
          )}
          detail={`${formatNumber(
            withdrawals.pendingRequests
          )} pending requests`}
          warning={
            Number(
              withdrawals.pendingRequests ||
                0
            ) > 0
          }
        />
      </section>

      <section
        className={styles.secondaryStats}
      >
        <SmallStat
          icon={UserCheck}
          label="Active"
          value={overview.activeMembers}
        />

        <SmallStat
          icon={ShieldAlert}
          label="Blocked"
          value={overview.blockedMembers}
        />

        <SmallStat
          icon={WalletCards}
          label="Wallets Registered"
          value={
            overview.walletRegistered
          }
        />

        <SmallStat
          icon={TrendingUp}
          label="Approved Withdrawals"
          value={
            withdrawals.approvedRequests
          }
        />
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <PanelHeader
            eyebrow="FINANCIAL OVERVIEW"
            title="Income Distribution"
          />

          <div className={styles.incomeGrid}>
            <IncomeItem
              label="Direct Income"
              value={income.direct}
            />

            <IncomeItem
              label="Rank Income"
              value={income.rank}
            />

            <IncomeItem
              label="Rank Salary"
              value={income.salary}
            />

            <IncomeItem
              label="Reward Income"
              value={income.reward}
            />
          </div>

          <div className={styles.incomeTotal}>
            <div>
              <Activity size={18} />

              <span>
                Total Distributed
              </span>
            </div>

            <strong>
              {formatUsd(income.total)}
            </strong>
          </div>
        </section>

        <section className={styles.panel}>
          <PanelHeader
            eyebrow="NETWORK STATUS"
            title="Rank Distribution"
          />

          {rankDistribution.length === 0 ? (
            <div className={styles.empty}>
              No ranked members yet.
            </div>
          ) : (
            <div className={styles.rankList}>
              {rankDistribution.map(
                (rank) => (
                  <div
                    className={
                      styles.rankRow
                    }
                    key={rank.level}
                  >
                    <div
                      className={
                        styles.rankInfo
                      }
                    >
                      <span>
                        {rank.name}
                      </span>

                      <strong>
                        {formatNumber(
                          rank.total
                        )}
                      </strong>
                    </div>

                    <div
                      className={
                        styles.rankTrack
                      }
                    >
                      <span
                        style={{
                          width: `${Math.max(
                            4,
                            (Number(
                              rank.total
                            ) /
                              maxRankTotal) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <PanelHeader
          eyebrow="MEMBERS"
          title="Recent Registrations"
          action="View All Members"
          onAction={() =>
            navigate("/admin/members")
          }
        />

        <div className={styles.tableWrapper}>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Username</th>
                <th>Package</th>
                <th>Rank</th>
                <th>Wallet</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>

            <tbody>
              {recentMembers.map(
                (member) => (
                  <tr key={member.id}>
                    <td>
                      <div
                        className={
                          styles.memberCell
                        }
                      >
                        <div
                          className={
                            styles.memberAvatar
                          }
                        >
                          {String(
                            member.name ||
                              member.user_id ||
                              "U"
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {member.name ||
                              "—"}
                          </strong>

                          <span>
                            {member.email ||
                              "—"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      {member.user_id}
                    </td>

                    <td>
                      {Number(
                        member.package_choose
                      ) >= 2
                        ? formatUsd(
                            member.package_amount
                          )
                        : "Not Active"}
                    </td>

                    <td>
                      <span
                        className={
                          styles.rankBadge
                        }
                      >
                        {member.rank}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          member.walletRegistered
                            ? styles.yes
                            : styles.no
                        }
                      >
                        {member.walletRegistered
                          ? "Registered"
                          : "Not Set"}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          Number(
                            member.status
                          ) === 0
                            ? styles.activeBadge
                            : styles.blockedBadge
                        }
                      >
                        {Number(
                          member.status
                        ) === 0
                          ? "Active"
                          : "Blocked"}
                      </span>
                    </td>

                    <td>
                      {formatDate(
                        member.joined_at
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <PanelHeader
          eyebrow="ACTIVITY"
          title="Recent Earnings"
          action="View Transactions"
          onAction={() =>
            navigate(
              "/admin/transactions"
            )
          }
        />

        <div
          className={
            styles.transactionList
          }
        >
          {recentTransactions.length ===
          0 ? (
            <div className={styles.empty}>
              No recent transactions.
            </div>
          ) : (
            recentTransactions.map(
              (transaction) => (
                <div
                  className={
                    styles.transaction
                  }
                  key={transaction.id}
                >
                  <div
                    className={
                      styles.transactionIcon
                    }
                  >
                    <Coins size={17} />
                  </div>

                  <div
                    className={
                      styles.transactionInfo
                    }
                  >
                    <strong>
                      {transaction.type}
                    </strong>

                    <span>
                      {transaction.username ||
                        transaction.name ||
                        "Unknown Member"}
                    </span>
                  </div>

                  <div
                    className={
                      styles.transactionRight
                    }
                  >
                    <strong>
                      +
                      {formatUsd(
                        transaction.amount
                      )}
                    </strong>

                    <span>
                      {formatDate(
                        transaction.created_at
                      )}
                    </span>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </section>
    </AdminLayout>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  detail,
  warning = false,
}) => (
  <div className={styles.statCard}>
    <div
      className={`${styles.statIcon} ${
        warning ? styles.warningIcon : ""
      }`}
    >
      <Icon
        size={20}
        strokeWidth={1.8}
      />
    </div>

    <div className={styles.statContent}>
      <span>{label}</span>

      <strong>{value}</strong>

      <small>{detail}</small>
    </div>
  </div>
);

const SmallStat = ({
  icon: Icon,
  label,
  value,
}) => (
  <div className={styles.smallStat}>
    <Icon size={17} />

    <div>
      <span>{label}</span>

      <strong>
        {new Intl.NumberFormat(
          "en-US"
        ).format(Number(value || 0))}
      </strong>
    </div>
  </div>
);

const IncomeItem = ({
  label,
  value,
}) => (
  <div className={styles.incomeItem}>
    <span>{label}</span>

    <strong>
      {new Intl.NumberFormat(
        "en-US",
        {
          style: "currency",
          currency: "USD",
        }
      ).format(Number(value || 0))}
    </strong>
  </div>
);

const PanelHeader = ({
  eyebrow,
  title,
  action,
  onAction,
}) => (
  <div className={styles.panelHeader}>
    <div>
      <span className={styles.eyebrow}>
        {eyebrow}
      </span>

      <h3>{title}</h3>
    </div>

    {action && (
      <button
        type="button"
        onClick={onAction}
        className={styles.panelAction}
      >
        {action}

        <ArrowRight size={14} />
      </button>
    )}
  </div>
);

export default AdminDashboard;