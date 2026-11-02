import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine, CheckCircle2, CircleDollarSign, Clock3, Eye,
  ReceiptText, RefreshCw, Search, UserRound, Wallet, X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../../components/admin/layout/AdminLayout";
import adminApi from "../../../services/adminApi";
import styles from "./AdminWithdrawals.module.css";

const money = (v) => `${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`;
const dateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};
const short = (v, a = 7, b = 5) => !v ? "—" : String(v).length < a + b + 4 ? String(v) : `${String(v).slice(0, a)}…${String(v).slice(-b)}`;
const statusText = (w) => Number(w.status) === 1 ? "Paid" : "Pending";

export default function AdminWithdrawals() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [blockchain, setBlockchain] = useState("");
  const [sort, setSort] = useState("newest");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [requestedFrom, setRequestedFrom] = useState("");
  const [requestedTo, setRequestedTo] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const authError = useCallback((err) => {
    if (![401, 403].includes(err?.response?.status)) return false;
    ["ewc_admin_token", "ewc_admin_user"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    navigate("/admin/login", { replace: true });
    return true;
  }, [navigate]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await adminApi.get("/admin/withdrawals/summary");
      setSummary(res.data?.data || null);
    } catch (err) { authError(err); }
  }, [authError]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const res = await adminApi.get("/admin/withdrawals/merkle-overview");
      setOverview(res.data?.data || null);
    } catch (err) {
      if (!authError(err)) setOverviewError(err.response?.data?.message || "Unable to load published Merkle claims.");
    } finally { setOverviewLoading(false); }
  }, [authError]);

  const loadWithdrawals = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: 20, sort };
      Object.entries({ search, status, blockchain, minAmount, maxAmount, requestedFrom, requestedTo })
        .forEach(([key, value]) => { if (value !== "") params[key] = value; });
      const res = await adminApi.get("/admin/withdrawals", { params });
      setWithdrawals(res.data?.data?.withdrawals || []);
      setPagination(res.data?.data?.pagination || { page: 1, total: 0, totalPages: 0 });
    } catch (err) {
      if (!authError(err)) {
        setError(err.response?.data?.message || "Unable to load withdrawals.");
        setWithdrawals([]);
      }
    } finally { setLoading(false); }
  }, [search, status, blockchain, minAmount, maxAmount, requestedFrom, requestedTo, sort, authError]);

  useEffect(() => { loadSummary(); loadOverview(); }, [loadSummary, loadOverview]);
  useEffect(() => { loadWithdrawals(1); }, [loadWithdrawals]);

  const refresh = () => { loadSummary(); loadOverview(); loadWithdrawals(pagination.page); };
  const reset = () => {
    setSearchInput(""); setSearch(""); setStatus(""); setBlockchain("");
    setMinAmount(""); setMaxAmount(""); setRequestedFrom(""); setRequestedTo(""); setSort("newest");
  };
  const openDetails = async (id) => {
    setSelectedId(id);
    setDetails(null);
    setDetailsLoading(true);
    try {
      const res = await adminApi.get(`/admin/withdrawals/${id}`);
      setDetails(res.data?.data || null);
    } catch (err) { if (!authError(err)) setError("Unable to load withdrawal details."); }
    finally { setDetailsLoading(false); }
  };

  const cards = [
    ["Total Requested", summary?.totalRequested, summary?.totalRequests, ArrowDownToLine],
    ["Pending", summary?.pendingAmount, summary?.pendingRequests, Clock3],
    ["Approved", summary?.approvedAmount, summary?.approvedRequests, CheckCircle2],
    ["Total Payable", summary?.totalPayable, null, CircleDollarSign],
  ];

  return (
    <AdminLayout>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>FINANCE</div>
            <h1>Withdrawals</h1>
            <p>Published claim eligibility, queued USDT and blockchain withdrawal history.</p>
          </div>
          <button type="button" className={styles.refreshButton} onClick={refresh}><RefreshCw size={15} /> Refresh</button>
        </div>

        <div className={styles.summaryGrid}>
          {cards.map(([label, value, count, Icon]) => (
            <div key={label} className={styles.summaryCard}>
              <div className={styles.summaryIcon}><Icon size={18} /></div>
              <div className={styles.summaryContent}>
                <span>{label}</span>
                <strong>{money(value)}</strong>
                <small>{count === null ? "Recorded payable" : `${Number(count || 0).toLocaleString()} requests`}</small>
              </div>
            </div>
          ))}
        </div>

        {/* Merkle overview is read-only. Data comes from an authenticated backend route. */}
        <section className={styles.panel} style={{ marginBottom: 18 }}>
          <div className={styles.tableHeader}>
            <div>
              <h2>Published Merkle Claims</h2>
              <p>Snapshot entitlements minus on-chain claims; queued USDT is tracked separately.</p>
            </div>
          </div>
          {overviewError && <div className={styles.error}>{overviewError}</div>}
          {overviewLoading ? <div className={styles.loading}>Loading Merkle claims…</div> : overview && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "12px 18px", fontSize: 13 }}>
                <span><b>Snapshot:</b> {overview.snapshotId}</span>
                <span><b>Eligible users:</b> {overview.users?.length || 0}</span>
                <span><b>Unclaimed:</b> {money(overview.totals?.unclaimedUsdt)}</span>
                <span><b>Queued unpaid:</b> {money(overview.totals?.queuedUsdt)}</span>
                <span><b>Root:</b> {short(overview.root, 12, 8)}</span>
              </div>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>Member</th><th>Wallet</th><th>Lifetime earned</th><th>Already claimed</th><th>Available to claim</th><th>Queued unpaid</th><th>EWC ROI</th></tr></thead>
                  <tbody>
                    {(overview.users || []).map((u) => (
                      <tr key={`${u.userId}-${u.wallet}`}>
                        <td><strong>{u.userId}</strong></td>
                        <td title={u.wallet} style={{ fontFamily: "monospace" }}>{short(u.wallet)}</td>
                        <td>{money(u.cumulativeUsdt)}</td>
                        <td>{money(u.claimedUsdt)}</td>
                        <td><strong className={styles.payable}>{money(u.unclaimedUsdt)}</strong></td>
                        <td>{money(u.queuedUsdt)}</td>
                        <td>{Number(u.cumulativeEwc || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} EWC</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.tableHeader}><div><h2>Withdrawal Transactions</h2><p>{pagination.total || 0} recorded withdrawals, including queued claims</p></div></div>
          <div className={styles.filterBar}>
            <form className={styles.searchBox} onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}>
              <Search size={15} />
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Member, wallet or transaction hash" />
              <button type="submit">Search</button>
            </form>
            <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Paid</option></select>
            <select value={blockchain} onChange={(e) => setBlockchain(e.target.value)}><option value="">All transactions</option><option value="recorded">On-chain recorded</option><option value="missing">No transaction</option></select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="amount_desc">Highest amount</option><option value="amount_asc">Lowest amount</option><option value="payable_desc">Highest payable</option><option value="payable_asc">Lowest payable</option></select>
            <button type="button" className={styles.resetButton} onClick={reset}><X size={14} /> Reset</button>
          </div>
          <div className={styles.advancedFilters}>
            <Filter label="Min amount" type="number" value={minAmount} set={setMinAmount} />
            <Filter label="Max amount" type="number" value={maxAmount} set={setMaxAmount} />
            <Filter label="From" type="date" value={requestedFrom} set={setRequestedFrom} />
            <Filter label="To" type="date" value={requestedTo} set={setRequestedTo} />
          </div>
          {error && <div className={styles.error}>{error}</div>}
          {loading ? <div className={styles.loading}>Loading withdrawals…</div> : withdrawals.length === 0 ? (
            <div className={styles.empty}><Wallet size={28} /><strong>No withdrawals found</strong></div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead><tr><th>Request</th><th>Member</th><th>Amount</th><th>Payable</th><th>Unpaid</th><th>Status</th><th>Claim type</th><th>Date</th><th>Transaction</th><th>Details</th></tr></thead>
                <tbody>{withdrawals.map((w) => {
                  const member = w.member || {};
                  const chain = w.blockchain || {};
                  const tx = chain.txnId || chain.txId || w.txn_id;
                  return <tr key={w.id}>
                    <td><strong>#{w.id}</strong></td>
                    <td><strong>{member.name || member.user_id || "—"}</strong><div>{member.user_id || ""}</div></td>
                    <td>{money(w.amount)}</td><td>{money(w.payable ?? w.amount)}</td>
                    <td>{money(w.pendingBalance)}</td>
                    <td><span className={Number(w.status) === 1 ? styles.approvedBadge : styles.pendingBadge}>{statusText(w)}</span></td>
                    <td>{Number(w.isQueued ?? w.is_queued) === 1 ? "Admin queue" : "Automatic"}</td>
                    <td>{dateTime(w.requestedAt)}</td>
                    <td>{tx ? <a href={`https://bscscan.com/tx/${tx}`} target="_blank" rel="noreferrer" title={tx}>{short(tx)}</a> : "—"}</td>
                    <td><button type="button" className={styles.refreshButton} onClick={() => openDetails(w.id)}><Eye size={14} /></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
          {!loading && pagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <button disabled={pagination.page <= 1} onClick={() => loadWithdrawals(pagination.page - 1)}>Previous</button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => loadWithdrawals(pagination.page + 1)}>Next</button>
            </div>
          )}
        </section>
      </div>

      {selectedId !== null && (
        <div className={styles.drawerOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div><span>WITHDRAWAL</span><h2>Request #{selectedId}</h2></div>
              <button type="button" className={styles.closeButton} onClick={() => setSelectedId(null)}><X size={18} /></button>
            </div>
            <div className={styles.drawerBody}>
              {detailsLoading ? "Loading…" : details?.withdrawal ? <>
                <div className={styles.detailHero}><div><span>Requested</span><strong>{money(details.withdrawal.amount)}</strong></div><b>{statusText(details.withdrawal)}</b></div>
                <Detail title="Payment" rows={[
                  ["Requested", money(details.withdrawal.amount)],
                  ["Payable", money(details.withdrawal.payable ?? details.withdrawal.amount)],
                  ["Pending", money(details.withdrawal.pendingBalance)],
                  ["Queued", Number(details.withdrawal.isQueued ?? details.withdrawal.is_queued) === 1 ? "Yes" : "No"],
                  ["Requested at", dateTime(details.withdrawal.requestedAt)],
                  ["Paid at", dateTime(details.withdrawal.approvedAt)],
                ]} />
                <Detail title="Member" rows={[
                  ["ID", details.withdrawal.member?.user_id],
                  ["Name", details.withdrawal.member?.name],
                  ["Email", details.withdrawal.member?.email],
                  ["Wallet", details.withdrawal.member?.wallet],
                ]} />
                <Detail title="Blockchain" rows={[
                  ["Claim transaction", details.withdrawal.blockchain?.txnId || details.withdrawal.blockchain?.txId],
                  ["Block", details.withdrawal.blockchain?.blockNumber],
                  ["Remarks", details.withdrawal.remarks],
                ]} />
                {details.payments?.length > 0 && <Detail title="Admin settlement transactions" rows={details.payments.map((p) => [money(p.amount), p.txn_hash])} />}
              </> : <div className={styles.error}>Unable to load details.</div>}
            </div>
            {details?.withdrawal?.member?.id && <div className={styles.drawerFooter}>
              <button onClick={() => navigate(`/admin/members/${details.withdrawal.member.id}`)}><UserRound size={14} /> Member</button>
              <button onClick={() => navigate(`/admin/earnings?member=${encodeURIComponent(details.withdrawal.member.user_id)}`)}><CircleDollarSign size={14} /> Earnings</button>
            </div>}
          </aside>
        </div>
      )}
    </AdminLayout>
  );
}

function Filter({ label, type, value, set }) {
  return <div className={styles.filterField}><label>{label}</label><input type={type} min={type === "number" ? "0" : undefined} value={value} onChange={(e) => set(e.target.value)} /></div>;
}
function Detail({ title, rows }) {
  return <section className={styles.drawerSection}>
    <div className={styles.drawerSectionHeader}><h3>{title}</h3><ReceiptText size={16} /></div>
    <div className={styles.infoGrid}>{rows.map(([label, value]) => <div key={label} className={styles.infoItem}><span>{label}</span><strong style={{ overflowWrap: "anywhere" }}>{value ?? "—"}</strong></div>)}</div>
  </section>;
}
