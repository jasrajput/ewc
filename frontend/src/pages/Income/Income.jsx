import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Coins, Search, TrendingUp } from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./Income.module.css";

const INCOME_TYPES = {
  direct: {
    title: "Direct Income",
    subtitle: "Income earned from your direct referrals",
  },
  reward: {
    title: "Reward Income",
    subtitle: "Rewards earned from your EWC investments",
  },
  rank: {
    title: "Rank Income",
    subtitle: "Income earned from your rank",
  },
  salary: {
    title: "Rank Salary",
    subtitle: "Monthly salary earned from your rank",
  },
};

const Income = () => {
  const { type } = useParams();
  const navigate = useNavigate();

  const [income, setIncome] = useState([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const config = INCOME_TYPES[type];

  useEffect(() => {
    if (!config) {
      navigate("/dashboard", { replace: true });
      return;
    }

    const fetchIncome = async () => {
  setLoading(true);
  setError("");

  try {
    const token =
      localStorage.getItem("ewc_token") ||
      sessionStorage.getItem("ewc_token");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const response = await api.get(`/income/${type}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    setIncome(response.data.data || []);
    setTotalIncome(Number(response.data.total || 0));
  } catch (err) {
    console.error("Income fetch error:", err);

    if (err.response?.status === 401) {
      navigate("/login", { replace: true });
      return;
    }

    setError(err.response?.data?.message || "Failed to load income.");
  } finally {
    setLoading(false);
  }
};

    fetchIncome();
  }, [type, config, navigate]);

  const filteredIncome = useMemo(() => {
    if (!search.trim()) return income;

    const keyword = search.toLowerCase();

    return income.filter((item) =>
      item.description?.toLowerCase().includes(keyword)
    );
  }, [income, search]);

  const formatUsd = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!config) return null;

  return (
    <UserLayout title={config.title} subtitle={config.subtitle}>
      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>EWC EARNINGS</span>
          <h2>{config.title}</h2>
          <p>{config.subtitle}</p>
        </div>
      </section>

      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><Coins size={20} /></div>
          <div>
            <span>Total {config.title}</span>
            <strong>{formatUsd(totalIncome)}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}><TrendingUp size={20} /></div>
          <div>
            <span>Total Records</span>
            <strong>{income.length}</strong>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>HISTORY</span>
            <h3>{config.title} History</h3>
          </div>

          <div className={styles.searchBox}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>
            <span className={styles.spinner} />
            <span>Loading income...</span>
          </div>
        ) : filteredIncome.length === 0 ? (
          <div className={styles.emptyState}>
            <Coins size={27} />
            <strong>No {config.title.toLowerCase()} yet</strong>
            <span>Your income history will appear here.</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Income</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredIncome.map((item, index) => (
                  <tr key={item.id || index}>
                    <td>#{index + 1}</td>
                    <td><strong className={styles.amount}>+{formatUsd(item.credit)}</strong></td>
                    <td>{item.description || "—"}</td>
                    <td>{formatDate(item.created_at)}</td>
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

export default Income;