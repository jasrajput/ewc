import { useEffect, useMemo, useState } from "react";
import { BanknoteArrowDown, Search } from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./WithdrawalHistory.module.css";

const WithdrawalHistory = () => {
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/withdrawal/history");
        setHistory(response.data.data || []);
      } catch (err) {
        console.error("Withdrawal history error:", err);
        setError(err.response?.data?.message || "Unable to load withdrawal history.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const filteredHistory = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return history;

    return history.filter((item) =>
      String(item.txn_id || "").toLowerCase().includes(query)
    );
  }, [history, search]);

  const formatAmount = (amount) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

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

  return (
    <UserLayout title="Withdrawal History" subtitle="View your previous withdrawals">
      <section className={styles.summaryCard}>
        <div className={styles.summaryIcon}>
          <BanknoteArrowDown size={21} />
        </div>

        <div>
          <span>Total Withdrawals</span>
          <strong>{history.length}</strong>
        </div>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h2>Withdrawal History</h2>
            <p>Your withdrawal and claim transaction records.</p>
          </div>

          <div className={styles.searchBox}>
            <Search size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transaction..."
            />
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.tableWrapper}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Amount</th>
                <th>Transaction ID</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className={styles.emptyState}>Loading withdrawals...</td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="5" className={styles.emptyState}>No withdrawal records found.</td>
                </tr>
              ) : (
                filteredHistory.map((item, index) => (
                  <tr key={`${item.txn_id}-${index}`}>
                    <td>{index + 1}</td>
                    <td className={styles.amount}>${formatAmount(item.amount)}</td>
                    <td>
                      <span className={styles.txHash}>{item.txn_id || "—"}</span>
                    </td>
                    <td>
                      <span className={item.status === 1 ? styles.approved : styles.pending}>
                        {item.status_text}
                      </span>
                    </td>
                    <td>{formatDate(item.date_of_withdrawal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </UserLayout>
  );
};

export default WithdrawalHistory;