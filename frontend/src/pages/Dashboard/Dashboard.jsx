import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  Coins,
  TrendingUp,
  Trophy,
  Copy,
  Check,
  ExternalLink,
  Package,
  HandCoins,
  Network,
  Link2,
  ShieldCheck,
  Clock3,
  ArrowUpRight,
  ChevronRight,
  Users,
  UserPlus,
  Award,
  BadgeDollarSign,
  Layers3,
  CircleDollarSign,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./Dashboard.module.css";

const Dashboard = () => {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  const token =
    localStorage.getItem("ewc_token") ||
    sessionStorage.getItem("ewc_token");

  // =========================================================
  // FETCH DASHBOARD
  // =========================================================

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const fetchDashboard = async () => {
      try {
        const response = await api.get("/dashboard");
        setDashboard(response.data.data);
      } catch (err) {
        console.error("Dashboard error:", err);

        if (
          err.response?.status === 401 ||
          err.response?.status === 403
        ) {
          localStorage.removeItem("ewc_token");
          localStorage.removeItem("ewc_user");
          sessionStorage.removeItem("ewc_token");
          sessionStorage.removeItem("ewc_user");

          navigate("/login", { replace: true });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [navigate, token]);

  // =========================================================
  // HELPERS
  // =========================================================

  const copyText = async (text, type) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);

      setTimeout(() => {
        setCopied("");
      }, 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const formatUsd = (value = 0) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const formatNumber = (value = 0) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const referralLink = useMemo(() => {
    if (!dashboard?.user?.user_id) return "";

    return `${window.location.origin}/register?ref=${dashboard.user.user_id}`;
  }, [dashboard]);

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingBrand}>E</div>
        <div className={styles.loader} />
        <p>Preparing your dashboard...</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingBrand}>E</div>
        <h3>Unable to load dashboard</h3>
        <p>Please refresh the page and try again.</p>

        <button
          className={styles.retryButton}
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );
  }

  const {
    user,
    stats = {},
    income = {},
    token: tokenInfo = {},
    rank = {},
    recentTransactions = [],
  } = dashboard;

  const firstName = user?.name?.split(" ")[0] || "Member";

  const incomeCards = [
    {
      key: "reward",
      title: "Reward Income",
      value: income?.reward || 0,
      icon: TrendingUp,
      path: "/earnings/reward",
    },
    {
      key: "direct",
      title: "Direct Income",
      value: income?.direct || 0,
      icon: UserPlus,
      path: "/earnings/direct",
    },
    {
      key: "rank",
      title: "Rank Income",
      value: income?.rank || 0,
      icon: Trophy,
      path: "/earnings/rank",
    },
    {
      key: "salary",
      title: "Salary Income",
      value: income?.salary || 0,
      icon: Award,
      path: "/earnings/salary",
    },
  ];

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <UserLayout
      user={user}
      title="Dashboard"
      subtitle={`Welcome back, ${firstName}`}
    >
      {/* =====================================================
          HERO
      ===================================================== */}

      <section className={styles.hero}>
        <div className={styles.heroGlow} />

        <div className={styles.heroContent}>
          <div className={styles.heroLabel}>
            <Sparkles size={14} />
            EWC MEMBER PORTAL
          </div>

          <h1>
            Welcome back, <span>{firstName}</span>
          </h1>

          <p>
            Your investment, earnings and community performance
            in one place.
          </p>

          <div className={styles.heroActions}>
            <button
              className={styles.primaryButton}
              onClick={() => navigate("/investment")}
            >
              <Package size={17} />
              Invest Now
            </button>

            <button
              className={styles.secondaryButton}
              onClick={() => navigate("/withdrawal")}
            >
              <HandCoins size={17} />
              Claim Rewards
            </button>
          </div>
        </div>

        <div className={styles.heroAccount}>
          <div className={styles.heroAccountTop}>
            <div className={styles.heroAccountIcon}>
              <ShieldCheck size={21} />
            </div>

            <div>
              <span>Account Status</span>
              <strong>Active Member</strong>
            </div>
          </div>

          <div className={styles.heroAccountDivider} />

          <div className={styles.heroAccountRow}>
            <span>Member ID</span>
            <strong>@{user?.user_id}</strong>
          </div>

          <div className={styles.heroAccountRow}>
            <span>Current Rank</span>
            <strong>{rank?.current || "Unranked"}</strong>
          </div>

          <div className={styles.heroAccountRow}>
            <span>Wallet</span>
            <strong>
              {user?.walletRegistered ? "Registered" : "Not Registered"}
            </strong>
          </div>
        </div>
      </section>

      {/* =====================================================
          MAIN MONEY STATS
      ===================================================== */}

      <section className={styles.moneyGrid}>
        <div className={`${styles.moneyCard} ${styles.moneyPrimary}`}>
          <div className={styles.moneyCardHeader}>
            <div className={styles.moneyIcon}>
              <Wallet size={20} />
            </div>

            <span>Total Investment</span>
          </div>

          <strong className={styles.moneyValue}>
            {formatUsd(stats?.totalInvestment)}
          </strong>

          <div className={styles.moneyBottom}>
            <span>Current investment value</span>

            <button onClick={() => navigate("/investment")}>
              Details <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        <div className={styles.moneyCard}>
          <div className={styles.moneyCardHeader}>
            <div className={styles.moneyIcon}>
              <CircleDollarSign size={20} />
            </div>

            <span>Total Earnings</span>
          </div>

          <strong className={styles.moneyValue}>
            {formatUsd(stats?.totalEarnings)}
          </strong>

          <div className={styles.moneyBottom}>
            <span>All income combined</span>

            <button onClick={() => navigate("/earnings/reward")}>
              Earnings <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        <div className={styles.moneyCard}>
          <div className={styles.moneyCardHeader}>
            <div className={styles.moneyIcon}>
              <HandCoins size={20} />
            </div>

            <span>Claimable</span>
          </div>

          <strong className={styles.moneyValue}>
            {formatUsd(stats?.claimable)}
          </strong>

          <div className={styles.moneyBottom}>
            <span>Available for claim</span>

            <button onClick={() => navigate("/withdrawal")}>
              Claim <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        <div className={styles.moneyCard}>
          <div className={styles.moneyCardHeader}>
            <div className={styles.moneyIcon}>
              <Coins size={20} />
            </div>

            <span>EWC Allocation</span>
          </div>

          <strong className={styles.moneyValue}>
            {formatNumber(stats?.ewcAllocation)}{" "}
            <small>EWC</small>
          </strong>

          <div className={styles.moneyBottom}>
            <span>Allocated EWC tokens</span>
          </div>
        </div>
      </section>

      {/* =====================================================
          INCOME OVERVIEW
      ===================================================== */}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>EARNINGS</span>
            <h2>Income Overview</h2>
            <p>
              Breakdown of your earnings across all income sources.
            </p>
          </div>

          <button
            className={styles.sectionAction}
            onClick={() => navigate("/earnings/reward")}
          >
            View Earnings
            <ChevronRight size={16} />
          </button>
        </div>

        <div className={styles.incomeGrid}>
          {incomeCards.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.key}
                className={styles.incomeCard}
                onClick={() => navigate(item.path)}
              >
                <div className={styles.incomeTop}>
                  <div className={styles.incomeIcon}>
                    <Icon size={19} />
                  </div>

                  <ArrowUpRight
                    size={16}
                    className={styles.incomeArrow}
                  />
                </div>

                <span>{item.title}</span>

                <strong>{formatUsd(item.value)}</strong>

                <div className={styles.incomeFooter}>
                  View history
                  <ChevronRight size={13} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* =====================================================
          INVESTMENT + RANK
      ===================================================== */}

      <section className={styles.featureGrid}>
        {/* INVESTMENT */}

        <div className={`${styles.panel} ${styles.investmentPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>INVESTMENT</span>
              <h2>Active Investment</h2>
            </div>

            <button
              className={styles.panelLink}
              onClick={() => navigate("/investment")}
            >
              View Details
              <ChevronRight size={15} />
            </button>
          </div>

          {stats?.activeInvestment ? (
            <div className={styles.activeInvestment}>
              <div className={styles.investmentMain}>
                <span>Current Investment</span>

                <strong>
                  {formatUsd(stats.activeInvestment.amount)}
                </strong>

              </div>

              <div className={styles.investmentStats}>
                <div>
                  <span>Monthly Reward</span>
                  <strong>
                    {stats.activeInvestment.monthlyReward || 2}%
                  </strong>
                </div>

                <div>
                  <span>Days Remaining</span>
                  <strong>
                    {stats.activeInvestment.daysRemaining ?? "--"}
                  </strong>
                </div>

                <div>
                  <span>Progress</span>
                  <strong>
                    {stats.activeInvestment.progress || 0}%
                  </strong>
                </div>
              </div>

              <div className={styles.progressArea}>
                <div className={styles.progressLabels}>
                  <span>Investment period</span>
                  <strong>
                    {stats.activeInvestment.progress || 0}%
                  </strong>
                </div>

                <div className={styles.progressTrack}>
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        stats.activeInvestment.progress || 0
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyInvestment}>
              <div className={styles.emptyIcon}>
                <Package size={28} />
              </div>

              <div>
                <h3>No Active Investment</h3>

                <p>
                  Start an EWC investment to activate your rewards
                  and community benefits.
                </p>
              </div>

              <button onClick={() => navigate("/investment")}>
                Explore Investment
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>

        {/* RANK */}

        <div className={`${styles.panel} ${styles.rankPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>RANK</span>
              <h2>Your Progress</h2>
            </div>

            <div className={styles.headerIcon}>
              <Trophy size={20} />
            </div>
          </div>

          <div className={styles.rankHero}>
            <div className={styles.rankMedal}>
              <Trophy size={27} />
            </div>

            <div>
              <span>Current Rank</span>
              <strong>{rank?.current || "Unranked"}</strong>

              {rank?.teamPercentage > 0 && (
                <small>
                  {rank.teamPercentage}% Team Income
                </small>
              )}
            </div>
          </div>

          <div className={styles.rankMetrics}>
            <div>
              <span>Community Sales</span>
              <strong>{formatUsd(rank?.communitySales)}</strong>
            </div>

            <div>
              <span>Direct Sales</span>
              <strong>{formatUsd(rank?.directSales)}</strong>
            </div>

            <div>
              <span>Next Rank</span>
              <strong>{rank?.next || "Maximum"}</strong>
            </div>
          </div>

          {rank?.next && (
            <div className={styles.rankProgress}>
              <div className={styles.progressLabels}>
                <span>Overall Progress</span>
                <strong>{rank?.progress || 0}%</strong>
              </div>

              <div className={styles.progressTrack}>
                <span
                  style={{
                    width: `${Math.min(100, rank?.progress || 0)}%`,
                  }}
                />
              </div>

              <button onClick={() => navigate("/rank")}>
                View Rank Requirements
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          COMMUNITY
      ===================================================== */}

      <section className={styles.communityGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>TEAM</span>
              <h2>Community Overview</h2>
            </div>

            <div className={styles.headerIcon}>
              <Network size={20} />
            </div>
          </div>

          <div className={styles.communityStats}>
            <button onClick={() => navigate("/network/directs")}>
              <div className={styles.communityIcon}>
                <UserPlus size={20} />
              </div>

              <div>
                <span>Direct Partners</span>
                <strong>{formatNumber(stats?.directPartners)}</strong>
              </div>

              <ChevronRight size={17} />
            </button>

            <button onClick={() => navigate("/network/community")}>
              <div className={styles.communityIcon}>
                <Users size={20} />
              </div>

              <div>
                <span>Total Community</span>
                <strong>{formatNumber(stats?.totalCommunity)}</strong>
              </div>

              <ChevronRight size={17} />
            </button>

            <div className={styles.communityMetric}>
              <span>Direct Business</span>
              <strong>{formatUsd(stats?.directSales)}</strong>
            </div>

            <div className={styles.communityMetric}>
              <span>Community Business</span>
              <strong>{formatUsd(stats?.communitySales)}</strong>
            </div>
          </div>
        </div>

        {/* REFERRAL */}

        <div className={`${styles.panel} ${styles.referralPanel}`}>
          <div className={styles.referralGlow} />

          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>REFERRAL PROGRAM</span>
              <h2>Invite & Earn</h2>
            </div>

            <div className={styles.headerIcon}>
              <Link2 size={20} />
            </div>
          </div>

          <div className={styles.referralReward}>
            <span>Direct Referral Reward</span>
            <strong>10%</strong>
            <small>on qualifying direct investments</small>
          </div>

          <p className={styles.referralDescription}>
            Share your unique referral link with your team and
            grow your EWC community.
          </p>

          <div className={styles.referralBox}>
            <span>{referralLink}</span>

            <button
              onClick={() => copyText(referralLink, "referral")}
              aria-label="Copy referral link"
            >
              {copied === "referral" ? (
                <Check size={17} />
              ) : (
                <Copy size={17} />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================
          ACTIVITY
      ===================================================== */}

      <section className={styles.activityGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>ACTIVITY</span>
              <h2>Recent Earnings</h2>
            </div>

            <BadgeDollarSign size={21} />
          </div>

          <div className={styles.activityList}>
            {recentTransactions?.length > 0 ? (
              recentTransactions.map((transaction) => (
                <div
                  className={styles.activityItem}
                  key={transaction.id}
                >
                  <div className={styles.activityIcon}>
                    <TrendingUp size={17} />
                  </div>

                  <div className={styles.activityInfo}>
                    <strong>{transaction.type}</strong>
                    <span>{transaction.date}</span>
                  </div>

                  <div className={styles.activityAmount}>
                    <strong>
                      +{formatUsd(transaction.amount)}
                    </strong>

                    <span>{transaction.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyActivity}>
                <Clock3 size={23} />
                <strong>No earnings yet</strong>
                <span>
                  Your latest income transactions will appear here.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* TOKEN */}

        <div className={`${styles.panel} ${styles.tokenCard}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>EWC TOKEN</span>
              <h2>Token Details</h2>
            </div>

            <div className={styles.headerIcon}>
              <Coins size={20} />
            </div>
          </div>

          <div className={styles.tokenIdentity}>
            <div className={styles.tokenLogo}>E</div>

            <div>
              <strong>{tokenInfo?.name || "EWC Token"}</strong>
              <span>
                {tokenInfo?.symbol || "EWC"} ·{" "}
                {tokenInfo?.network || "BNB Smart Chain"}
              </span>
            </div>
          </div>

          <div className={styles.tokenDetails}>
            <div>
              <span>Decimals</span>
              <strong>{tokenInfo?.decimals ?? 18}</strong>
            </div>

            <div>
              <span>Total Supply</span>
              <strong>
                {formatNumber(tokenInfo?.totalSupply)} EWC
              </strong>
            </div>
          </div>

          <div className={styles.contractBox}>
            <div>
              <span>Contract Address</span>

              <strong>
                {tokenInfo?.contractAddress
                  ? `${tokenInfo.contractAddress.slice(
                      0,
                      10
                    )}...${tokenInfo.contractAddress.slice(-8)}`
                  : "Not configured"}
              </strong>
            </div>

            {tokenInfo?.contractAddress && (
              <div className={styles.contractActions}>
                <button
                  onClick={() =>
                    copyText(tokenInfo.contractAddress, "contract")
                  }
                >
                  {copied === "contract" ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>

                {tokenInfo?.explorerUrl && (
                  <a
                    href={tokenInfo.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================
          QUICK LINKS
      ===================================================== */}

      <section className={styles.quickLinks}>
        <button onClick={() => navigate("/investment")}>
          <Package size={18} />
          <span>
            <strong>Investment</strong>
            <small>Manage your package</small>
          </span>
          <ChevronRight size={17} />
        </button>

        <button onClick={() => navigate("/rank")}>
          <Trophy size={18} />
          <span>
            <strong>Rank Progress</strong>
            <small>View requirements</small>
          </span>
          <ChevronRight size={17} />
        </button>

        <button onClick={() => navigate("/network/tree")}>
          <Layers3 size={18} />
          <span>
            <strong>Team Genealogy</strong>
            <small>Explore your community</small>
          </span>
          <ChevronRight size={17} />
        </button>

        <button onClick={() => navigate("/withdrawal")}>
          <HandCoins size={18} />
          <span>
            <strong>Withdrawal</strong>
            <small>Claim your earnings</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </section>
    </UserLayout>
  );
};

export default Dashboard;