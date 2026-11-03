
import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  FileJson,
  GitBranch,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import AdminLayout from "../../../components/admin/layout/AdminLayout";
import adminApi from "../../../services/adminApi";
import styles from "./AdminClosingRuns.module.css";

// ======================================================
// HELPERS
// ======================================================

const formatDate = (value) => {
  if (!value) return "—";

  const dateText = String(value).slice(0, 10);
  const parts = dateText.split("-");

  if (parts.length === 3) {
    const [year, month, day] = parts;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    }
  }

  return String(value);
};

const formatDateTime = (value) => {
  if (!value) return "—";

  // Backend sends MySQL's YYYY-MM-DD HH:mm:ss.
  // Display it without assuming a timezone.
  return String(value).replace("T", " ").replace(".000Z", "");
};

const formatSlot = (slotKey) => {
  if (!slotKey) return "—";

  const match = String(slotKey).match(
    /^\d{4}-\d{2}-\d{2}_(\d{2})$/
  );

  if (!match) return String(slotKey);

  const hour = Number(match[1]);
  const endHour = (hour + 3) % 24;

  const toTime = (h) => `${String(h).padStart(2, "0")}:00`;

  return `${toTime(hour)} – ${toTime(endHour)} IST`;
};

const shorten = (value, start = 9, end = 7) => {
  if (!value) return "—";

  const text = String(value);

  if (text.length <= start + end + 3) {
    return text;
  }

  return `${text.slice(0, start)}...${text.slice(-end)}`;
};

const copyText = async (value) => {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(String(value));
  } catch (error) {
    console.error("Unable to copy:", error);
  }
};

const normalizeStatus = (value) =>
  String(value || "pending").trim().toLowerCase();

const isRunComplete = (run) => {
  if (!run) return false;

  const roi = normalizeStatus(run.roiStatus);

  return (
    ["done", "deferred"].includes(roi) &&
    normalizeStatus(run.usdtStatus) === "done" &&
    normalizeStatus(run.snapshotStatus) === "done" &&
    normalizeStatus(run.publishStatus) === "done"
  );
};

// ======================================================
// STATUS COMPONENTS
// ======================================================

const StageBadge = ({ status }) => {
  const value = normalizeStatus(status);

  const done = value === "done";
  const deferred = value === "deferred";
  const failed = value === "failed";
  const processing = value === "processing";

  const label = done
    ? "Done"
    : deferred
      ? "Deferred"
      : failed
        ? "Failed"
        : processing
          ? "Processing"
          : "Pending";

  return (
    <span
      className={
        done || deferred
          ? styles.doneBadge
          : styles.pendingBadge
      }
      title={
        deferred
          ? "ROI intentionally deferred. No processing required."
          : undefined
      }
    >
      {done || deferred ? (
        <CheckCircle2 size={12} />
      ) : (
        <Clock3 size={12} />
      )}
      {label}
    </span>
  );
};

const OverallBadge = ({ complete }) => (
  <span
    className={
      complete
        ? styles.completeBadge
        : styles.progressBadge
    }
  >
    {complete ? (
      <CheckCircle2 size={12} />
    ) : (
      <Clock3 size={12} />
    )}
    {complete ? "Complete" : "In Progress"}
  </span>
);

const PipelineStage = ({
  title,
  description,
  pending = 0,
  deferred = 0,
}) => {
  const pendingCount = Number(pending || 0);
  const deferredCount = Number(deferred || 0);
  const healthy = pendingCount === 0;

  return (
    <div className={styles.pipelineStage}>
      <div
        className={
          healthy
            ? styles.stageIconDone
            : styles.stageIconPending
        }
      >
        {healthy ? (
          <CheckCircle2 size={17} />
        ) : (
          <Clock3 size={17} />
        )}
      </div>

      <div>
        <strong>{title}</strong>
        <span>{description}</span>
        <small>
          {pendingCount > 0
            ? `${pendingCount} pending`
            : deferredCount > 0
              ? `${deferredCount} deferred · No pending runs`
              : "No pending runs"}
        </small>
      </div>
    </div>
  );
};

const CopyValue = ({ value }) => {
  if (!value) {
    return <span className={styles.noValue}>—</span>;
  }

  return (
    <div className={styles.copyValue}>
      <span title={String(value)}>
        {shorten(value)}
      </span>
      <button
        type="button"
        title="Copy"
        onClick={() => copyText(value)}
      >
        <Copy size={12} />
      </button>
    </div>
  );
};

const HashValue = ({ label, value }) => (
  <div className={styles.hashValue}>
    <span>{label}</span>
    <div>
      <strong title={value || ""}>
        {shorten(value, 8, 6)}
      </strong>
      {value && (
        <button
          type="button"
          title={`Copy ${label}`}
          onClick={() => copyText(value)}
        >
          <Copy size={12} />
        </button>
      )}
    </div>
  </div>
);

const SelectFilter = ({
  label,
  value,
  onChange,
  allowDeferred = false,
}) => (
  <div className={styles.filterField}>
    <label>{label}</label>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">All</option>
      <option value="done">Done</option>
      <option value="pending">Pending</option>
      <option value="processing">Processing</option>
      <option value="failed">Failed</option>
      {allowDeferred && (
        <option value="deferred">Deferred</option>
      )}
    </select>
  </div>
);

const DateFilter = ({ label, value, onChange }) => (
  <div className={styles.filterField}>
    <label>{label}</label>
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

const LoadingState = () => (
  <div className={styles.loading}>
    <div className={styles.loader} />
    Loading closing runs...
  </div>
);

// ======================================================
// DETAILS COMPONENTS
// ======================================================

const SectionTitle = ({ title, subtitle }) => (
  <div className={styles.sectionTitle}>
    <h3>{title}</h3>
    <p>{subtitle}</p>
  </div>
);

const DetailStage = ({ number, title, status }) => (
  <div className={styles.detailStage}>
    <span className={styles.stageNumber}>{number}</span>
    <div>
      <strong>{title}</strong>
      <StageBadge status={status} />
    </div>
  </div>
);

const DetailValue = ({
  label,
  value,
  copy = false,
}) => (
  <div className={styles.detailValue}>
    <span>{label}</span>
    <div>
      <strong>{value || "—"}</strong>
      {copy && value && (
        <button
          type="button"
          onClick={() => copyText(value)}
        >
          <Copy size={13} />
          Copy
        </button>
      )}
    </div>
  </div>
);

const RunDetails = ({ run }) => {
  const complete = isRunComplete(run);

  return (
    <>
      <div className={styles.detailHero}>
        <div>
          <span>Closing Date</span>
          <strong>{formatDate(run.runDate)}</strong>
          <small>{formatSlot(run.slotKey)}</small>
        </div>
        <OverallBadge complete={complete} />
      </div>

      <section className={styles.detailSection}>
        <SectionTitle
          title="Pipeline"
          subtitle="Recorded state of each three-hour closing stage."
        />

        <div className={styles.detailPipeline}>
          <DetailStage
            number="01"
            title="Daily ROI"
            status={run.roiStatus}
          />
          <DetailStage
            number="02"
            title="USDT Income Closing"
            status={run.usdtStatus}
          />
          <DetailStage
            number="03"
            title="Merkle Snapshot"
            status={run.snapshotStatus}
          />
          <DetailStage
            number="04"
            title="Root Publishing"
            status={run.publishStatus}
          />
        </div>
      </section>

      {normalizeStatus(run.roiStatus) === "deferred" && (
        <section className={styles.detailSection}>
          <SectionTitle
            title="ROI Deferred"
            subtitle="ROI is intentionally disabled. This does not prevent the USDT closing or Merkle publication from completing."
          />
        </section>
      )}

      <section className={styles.detailSection}>
        <SectionTitle
          title="Snapshot"
          subtitle="Snapshot generated for this closing slot."
        />
        <DetailValue
          label="Snapshot ID"
          value={run.snapshotId}
          copy
        />
      </section>

      <section className={styles.detailSection}>
        <SectionTitle
          title="Merkle Root"
          subtitle="Merkle root recorded for this closing slot."
        />
        <DetailValue
          label="Root"
          value={run.merkleRoot}
          copy
        />
      </section>

      <section className={styles.detailSection}>
        <SectionTitle
          title="Blockchain Publish"
          subtitle="Transaction recorded after root publication."
        />
        <DetailValue
          label="Transaction Hash"
          value={run.txHash}
          copy
        />
      </section>

      <section className={styles.detailSection}>
        <SectionTitle
          title="System"
          subtitle="Closing run metadata."
        />

        <div className={styles.detailGrid}>
          <div>
            <span>Slot Key</span>
            <strong>{run.slotKey || run.id}</strong>
          </div>

          <div>
            <span>Slot (IST)</span>
            <strong>{formatSlot(run.slotKey)}</strong>
          </div>

          <div>
            <span>Recorded At (DB time)</span>
            <strong>{formatDateTime(run.createdAt)}</strong>
          </div>
        </div>
      </section>
    </>
  );
};

// ======================================================
// MAIN PAGE
// ======================================================

const AdminClosingRuns = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [runs, setRuns] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [roiStatus, setRoiStatus] = useState("");
  const [usdtStatus, setUsdtStatus] = useState("");
  const [snapshotStatus, setSnapshotStatus] = useState("");
  const [publishStatus, setPublishStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("newest");

  // UI state
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  // ====================================================
  // AUTH
  // ====================================================

  const handleAuthError = useCallback(
    (err) => {
      const code = err?.response?.status;

      if (code !== 401 && code !== 403) {
        return false;
      }

      localStorage.removeItem("ewc_admin_token");
      sessionStorage.removeItem("ewc_admin_token");
      localStorage.removeItem("ewc_admin_user");
      sessionStorage.removeItem("ewc_admin_user");

      navigate("/admin/login", { replace: true });
      return true;
    },
    [navigate]
  );

  // ====================================================
  // LOAD SUMMARY
  // ====================================================

  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);

      const response = await adminApi.get(
        "/admin/closing-runs/summary"
      );

      setSummary(response.data?.data || null);
    } catch (err) {
      console.error("Closing run summary error:", err);

      if (!handleAuthError(err)) {
        setSummary(null);
      }
    } finally {
      setSummaryLoading(false);
    }
  }, [handleAuthError]);

  // ====================================================
  // LOAD RUNS
  // ====================================================

  const loadRuns = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        setError("");

        const params = {
          page,
          limit: 20,
          sort,
        };

        if (search) params.search = search;
        if (status) params.status = status;
        if (roiStatus) params.roiStatus = roiStatus;
        if (usdtStatus) params.usdtStatus = usdtStatus;

        if (snapshotStatus) {
          params.snapshotStatus = snapshotStatus;
        }

        if (publishStatus) {
          params.publishStatus = publishStatus;
        }

        if (from) params.from = from;
        if (to) params.to = to;

        const response = await adminApi.get(
          "/admin/closing-runs",
          { params }
        );

        setRuns(response.data?.data?.runs || []);

        setPagination(
          response.data?.data?.pagination || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
          }
        );
      } catch (err) {
        console.error("Closing runs error:", err);

        if (handleAuthError(err)) return;

        setRuns([]);
        setError(
          err.response?.data?.message ||
          "Unable to load closing runs."
        );
      } finally {
        setLoading(false);
      }
    },
    [
      search,
      status,
      roiStatus,
      usdtStatus,
      snapshotStatus,
      publishStatus,
      from,
      to,
      sort,
      handleAuthError,
    ]
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadRuns(1);
  }, [loadRuns]);

  // ====================================================
  // SEARCH AND FILTERS
  // ====================================================

  const submitSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setRoiStatus("");
    setUsdtStatus("");
    setSnapshotStatus("");
    setPublishStatus("");
    setFrom("");
    setTo("");
    setSort("newest");
  };

  const hasFilters = Boolean(
    search ||
    status ||
    roiStatus ||
    usdtStatus ||
    snapshotStatus ||
    publishStatus ||
    from ||
    to ||
    sort !== "newest"
  );

  // ====================================================
  // DETAILS DRAWER
  // ====================================================

  const openDetails = async (id) => {
    try {
      setSelectedId(id);
      setDetails(null);
      setDetailsError("");
      setDetailsLoading(true);

      const response = await adminApi.get(
        `/admin/closing-runs/${encodeURIComponent(id)}`
      );

      setDetails(response.data?.data?.run || null);
    } catch (err) {
      console.error("Closing run details error:", err);

      if (handleAuthError(err)) return;

      setDetailsError(
        err.response?.data?.message ||
        "Unable to load closing run."
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedId(null);
    setDetails(null);
    setDetailsError("");
  };

  // ====================================================
  // SUMMARY CARDS
  // ====================================================

  const cards = [
    {
      label: "Total Runs",
      value: Number(summary?.totalRuns || 0).toLocaleString(),
      sub: "Three-hour closing slots",
      icon: Activity,
    },
    {
      label: "Completed",
      value: Number(
        summary?.completedRuns || 0
      ).toLocaleString(),
      sub: "All required stages complete",
      icon: CheckCircle2,
    },
    {
      label: "Pending",
      value: Number(
        summary?.pendingRuns || 0
      ).toLocaleString(),
      sub: "One or more required stages incomplete",
      icon: Clock3,
    },
    {
      label: "Latest Run",
      value: formatDate(summary?.latestRunDate),
      sub: summary?.latestRun
        ? `${formatSlot(summary.latestRun.slotKey)} · ${
            summary.latestRun.complete
              ? "Completed"
              : "In progress"
          }`
        : "No run recorded",
      icon: CalendarDays,
    },
  ];

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <AdminLayout>
      <div className={styles.page}>

        {/* HEADER */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>FINANCE</div>
            <h1>Closing Runs</h1>
            <p>
              Monitor three-hour USDT closings, daily ROI status,
              Merkle snapshots and blockchain root publication.
            </p>
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => {
              loadSummary();
              loadRuns(pagination.page);
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        {/* SUMMARY */}
        <div className={styles.summaryGrid}>
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                className={styles.summaryCard}
                key={card.label}
              >
                <div className={styles.summaryIcon}>
                  <Icon size={18} />
                </div>

                <div className={styles.summaryContent}>
                  <span>{card.label}</span>
                  <strong>
                    {summaryLoading ? "..." : card.value}
                  </strong>
                  <small>
                    {summaryLoading ? "" : card.sub}
                  </small>
                </div>
              </div>
            );
          })}
        </div>

        {/* PIPELINE STATUS */}
        <section className={styles.pipelinePanel}>
          <div className={styles.pipelineHeader}>
            <div>
              <h2>Pipeline Status</h2>
              <p>
                Pending stages across recorded three-hour slots.
                Deferred ROI does not count as pending.
              </p>
            </div>
            <GitBranch size={18} />
          </div>

          <div className={styles.pipeline}>
            <PipelineStage
              title="ROI"
              description="Daily ROI processing"
              pending={summary?.roiPending}
              deferred={summary?.roiDeferred}
            />

            <div className={styles.pipelineLine} />

            <PipelineStage
              title="USDT"
              description="Income closing"
              pending={summary?.usdtPending}
            />

            <div className={styles.pipelineLine} />

            <PipelineStage
              title="Snapshot"
              description="Merkle snapshot generation"
              pending={summary?.snapshotPending}
            />

            <div className={styles.pipelineLine} />

            <PipelineStage
              title="Publish"
              description="On-chain root publishing"
              pending={summary?.publishPending}
            />
          </div>
        </section>

        {/* LATEST PUBLISHED */}
        {summary?.latestPublished && (
          <section className={styles.latestPublished}>
            <div className={styles.latestIcon}>
              <ShieldCheck size={19} />
            </div>

            <div className={styles.latestInfo}>
              <span>LATEST PUBLISHED</span>
              <strong>
                {formatDate(
                  summary.latestPublished.runDate
                )}
              </strong>
              <small>
                {formatSlot(
                  summary.latestPublished.slotKey
                )}
              </small>
            </div>

            <HashValue
              label="Snapshot"
              value={
                summary.latestPublished.snapshotId
              }
            />
            <HashValue
              label="Merkle Root"
              value={
                summary.latestPublished.merkleRoot
              }
            />
            <HashValue
              label="Transaction"
              value={
                summary.latestPublished.txHash
              }
            />
          </section>
        )}

        {/* READ-ONLY NOTICE */}
        <div className={styles.notice}>
          <FileJson size={17} />
          <div>
            <strong>Automated closing monitor</strong>
            <p>
              Closing runs are generated by the three-hour
              backend process. This page is read-only and
              cannot trigger, edit or publish Merkle data.
            </p>
          </div>
        </div>

        {/* FILTERS */}
        <section className={styles.panel}>
          <div className={styles.filterBar}>
            <form
              className={styles.searchBox}
              onSubmit={submitSearch}
            >
              <Search size={15} />
              <input
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                placeholder="Slot, snapshot ID, root or transaction hash..."
              />
              <button type="submit">Search</button>
            </form>

            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value)
              }
            >
              <option value="">All Runs</option>
              <option value="complete">Complete</option>
              <option value="pending">In Progress</option>
            </select>

            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value)
              }
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="updated">Recently Updated</option>
            </select>

            {hasFilters && (
              <button
                type="button"
                className={styles.resetButton}
                onClick={clearFilters}
              >
                <X size={14} />
                Reset
              </button>
            )}
          </div>

          <div className={styles.advancedFilters}>
            <SelectFilter
              label="ROI Status"
              value={roiStatus}
              onChange={setRoiStatus}
              allowDeferred
            />

            <SelectFilter
              label="USDT Status"
              value={usdtStatus}
              onChange={setUsdtStatus}
            />

            <SelectFilter
              label="Snapshot Status"
              value={snapshotStatus}
              onChange={setSnapshotStatus}
            />

            <SelectFilter
              label="Publish Status"
              value={publishStatus}
              onChange={setPublishStatus}
            />

            <DateFilter
              label="From"
              value={from}
              onChange={setFrom}
            />

            <DateFilter
              label="To"
              value={to}
              onChange={setTo}
            />
          </div>
        </section>

        {/* RUN TABLE */}
        <section className={styles.panel}>
          <div className={styles.tableHeader}>
            <div>
              <h2>Run History</h2>
              <p>
                {Number(
                  pagination.total || 0
                ).toLocaleString()}{" "}
                recorded three-hour closing slots
              </p>
            </div>
          </div>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {loading ? (
            <LoadingState />
          ) : runs.length === 0 ? (
            <div className={styles.empty}>
              <GitBranch size={30} />
              <strong>No closing runs found</strong>
              <span>
                Try changing the filters.
              </span>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Run Date</th>
                    <th>Slot (IST)</th>
                    <th>Overall</th>
                    <th>ROI</th>
                    <th>USDT</th>
                    <th>Snapshot</th>
                    <th>Snapshot ID</th>
                    <th>Merkle Root</th>
                    <th>Publish</th>
                    <th>TX Hash</th>
                    <th>Recorded</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {runs.map((run) => (
                    <tr key={run.slotKey || run.id}>
                      <td>
                        <div className={styles.runDate}>
                          <CalendarDays size={13} />
                          <strong>
                            {formatDate(run.runDate)}
                          </strong>
                        </div>
                      </td>

                      <td>
                        {formatSlot(run.slotKey)}
                      </td>

                      <td>
                        <OverallBadge
                          complete={isRunComplete(run)}
                        />
                      </td>

                      <td>
                        <StageBadge
                          status={run.roiStatus}
                        />
                      </td>

                      <td>
                        <StageBadge
                          status={run.usdtStatus}
                        />
                      </td>

                      <td>
                        <StageBadge
                          status={run.snapshotStatus}
                        />
                      </td>

                      <td>
                        <CopyValue
                          value={run.snapshotId}
                        />
                      </td>

                      <td>
                        <CopyValue
                          value={run.merkleRoot}
                        />
                      </td>

                      <td>
                        <StageBadge
                          status={run.publishStatus}
                        />
                      </td>

                      <td>
                        <CopyValue
                          value={run.txHash}
                        />
                      </td>

                      <td className={styles.updatedCell}>
                        {formatDateTime(run.createdAt)}
                      </td>

                      <td>
                        <button
                          type="button"
                          className={styles.viewButton}
                          title="View closing details"
                          onClick={() =>
                            openDetails(
                              run.slotKey || run.id
                            )
                          }
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading &&
            pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() =>
                    loadRuns(pagination.page - 1)
                  }
                >
                  Previous
                </button>

                <span>
                  Page {pagination.page} of{" "}
                  {pagination.totalPages}
                </span>

                <button
                  type="button"
                  disabled={
                    pagination.page >=
                    pagination.totalPages
                  }
                  onClick={() =>
                    loadRuns(pagination.page + 1)
                  }
                >
                  Next
                </button>
              </div>
            )}
        </section>
      </div>

      {/* DETAILS DRAWER */}
      {selectedId && (
        <div
          className={styles.drawerOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div>
                <span>CLOSING SLOT</span>
                <h2>{selectedId}</h2>
                <p>
                  Three-hour closing pipeline
                </p>
              </div>

              <button
                type="button"
                onClick={closeDetails}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {detailsLoading ? (
                <LoadingState />
              ) : detailsError ? (
                <div className={styles.error}>
                  {detailsError}
                </div>
              ) : details ? (
                <RunDetails run={details} />
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminClosingRuns;
