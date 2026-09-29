import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

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

import {
  useNavigate,
} from "react-router-dom";

import AdminLayout from "../../../components/admin/layout/AdminLayout";
import adminApi from "../../../services/adminApi";

import styles from "./AdminClosingRuns.module.css";


// ======================================================
// HELPERS
// ======================================================

const formatDate = (value) => {
  if (!value) return "—";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }
  );
};


const formatDateTime = (
  value
) => {
  if (!value) return "—";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
};


const shorten = (
  value,
  start = 9,
  end = 7
) => {
  if (!value) return "—";

  const text =
    String(value);

  if (
    text.length <=
    start + end + 3
  ) {
    return text;
  }

  return `${text.slice(
    0,
    start
  )}...${text.slice(-end)}`;
};


const copyText = async (
  value
) => {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(
      String(value)
    );
  } catch (error) {
    console.error(
      "Unable to copy:",
      error
    );
  }
};


// ======================================================
// PAGE
// ======================================================

const AdminClosingRuns = () => {
  const navigate =
    useNavigate();


  const [
    summary,
    setSummary,
  ] = useState(null);

  const [
    runs,
    setRuns,
  ] = useState([]);

  const [
    pagination,
    setPagination,
  ] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });


  // ====================================================
  // FILTERS
  // ====================================================

  const [
    searchInput,
    setSearchInput,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    status,
    setStatus,
  ] = useState("");

  const [
    roiStatus,
    setRoiStatus,
  ] = useState("");

  const [
    snapshotStatus,
    setSnapshotStatus,
  ] = useState("");

  const [
    publishStatus,
    setPublishStatus,
  ] = useState("");

  const [
    from,
    setFrom,
  ] = useState("");

  const [
    to,
    setTo,
  ] = useState("");

  const [
    sort,
    setSort,
  ] = useState("newest");


  // ====================================================
  // UI
  // ====================================================

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    summaryLoading,
    setSummaryLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    selectedId,
    setSelectedId,
  ] = useState(null);

  const [
    details,
    setDetails,
  ] = useState(null);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    detailsError,
    setDetailsError,
  ] = useState("");


  // ====================================================
  // AUTH
  // ====================================================

  const handleAuthError =
    useCallback(
      (error) => {
        const code =
          error?.response?.status;

        if (
          code === 401 ||
          code === 403
        ) {
          localStorage.removeItem(
            "ewc_admin_token"
          );

          sessionStorage.removeItem(
            "ewc_admin_token"
          );

          localStorage.removeItem(
            "ewc_admin_user"
          );

          sessionStorage.removeItem(
            "ewc_admin_user"
          );

          navigate(
            "/admin/login",
            {
              replace: true,
            }
          );

          return true;
        }

        return false;
      },
      [navigate]
    );


  // ====================================================
  // SUMMARY
  // ====================================================

  const loadSummary =
    useCallback(
      async () => {
        try {
          setSummaryLoading(
            true
          );

          const response =
            await adminApi.get(
              "/admin/closing-runs/summary"
            );

          setSummary(
            response.data?.data ||
              null
          );
        } catch (error) {
          console.error(
            "Closing run summary error:",
            error
          );

          handleAuthError(
            error
          );
        } finally {
          setSummaryLoading(
            false
          );
        }
      },
      [handleAuthError]
    );


  // ====================================================
  // LIST
  // ====================================================

  const loadRuns =
    useCallback(
      async (page = 1) => {
        try {
          setLoading(true);
          setError("");

          const params = {
            page,
            limit: 20,
            sort,
          };


          if (search) {
            params.search =
              search;
          }

          if (status) {
            params.status =
              status;
          }

          if (roiStatus) {
            params.roiStatus =
              roiStatus;
          }

          if (
            snapshotStatus
          ) {
            params.snapshotStatus =
              snapshotStatus;
          }

          if (
            publishStatus
          ) {
            params.publishStatus =
              publishStatus;
          }

          if (from) {
            params.from = from;
          }

          if (to) {
            params.to = to;
          }


          const response =
            await adminApi.get(
              "/admin/closing-runs",
              {
                params,
              }
            );


          setRuns(
            response.data?.data
              ?.runs || []
          );


          setPagination(
            response.data?.data
              ?.pagination || {
              page: 1,
              limit: 20,
              total: 0,
              totalPages: 0,
            }
          );
        } catch (error) {
          console.error(
            "Closing runs error:",
            error
          );

          if (
            handleAuthError(
              error
            )
          ) {
            return;
          }

          setRuns([]);

          setError(
            error.response?.data
              ?.message ||
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
  // SEARCH / RESET
  // ====================================================

  const submitSearch = (
    event
  ) => {
    event.preventDefault();

    setSearch(
      searchInput.trim()
    );
  };


  const clearFilters = () => {
    setSearchInput("");
    setSearch("");

    setStatus("");
    setRoiStatus("");
    setSnapshotStatus("");
    setPublishStatus("");

    setFrom("");
    setTo("");

    setSort("newest");
  };


  const hasFilters =
    Boolean(search) ||
    Boolean(status) ||
    Boolean(roiStatus) ||
    Boolean(snapshotStatus) ||
    Boolean(publishStatus) ||
    Boolean(from) ||
    Boolean(to) ||
    sort !== "newest";


  // ====================================================
  // DETAILS
  // ====================================================

  const openDetails =
    async (id) => {
      try {
        setSelectedId(id);
        setDetails(null);
        setDetailsError("");
        setDetailsLoading(true);

        const response =
          await adminApi.get(
            `/admin/closing-runs/${id}`
          );

        setDetails(
          response.data?.data
            ?.run || null
        );
      } catch (error) {
        console.error(
          "Closing run details error:",
          error
        );

        if (
          handleAuthError(
            error
          )
        ) {
          return;
        }

        setDetailsError(
          error.response?.data
            ?.message ||
            "Unable to load closing run."
        );
      } finally {
        setDetailsLoading(
          false
        );
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
      label:
        "Total Runs",

      value:
        Number(
          summary?.totalRuns ||
            0
        ).toLocaleString(),

      sub:
        "Recorded closing cycles",

      icon:
        Activity,
    },

    {
      label:
        "Completed",

      value:
        Number(
          summary
            ?.completedRuns ||
            0
        ).toLocaleString(),

      sub:
        "All stages completed",

      icon:
        CheckCircle2,
    },

    {
      label:
        "Pending",

      value:
        Number(
          summary
            ?.pendingRuns ||
            0
        ).toLocaleString(),

      sub:
        "At least one stage pending",

      icon:
        Clock3,
    },

    {
      label:
        "Latest Run",

      value:
        formatDate(
          summary
            ?.latestRunDate
        ),

      sub:
        summary?.latestRun
          ?.complete
          ? "Completed"
          : summary?.latestRun
          ? "In progress"
          : "No run recorded",

      icon:
        CalendarDays,
    },
  ];


  return (
    <AdminLayout>
      <div
        className={
          styles.page
        }
      >

        {/* HEADER */}

        <div
          className={
            styles.pageHeader
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              FINANCE
            </div>

            <h1>
              Closing Runs
            </h1>

            <p>
              Monitor the automated
              daily ROI, Merkle
              snapshot and blockchain
              publishing pipeline.
            </p>
          </div>


          <button
            type="button"
            className={
              styles.refreshButton
            }
            onClick={() => {
              loadSummary();

              loadRuns(
                pagination.page
              );
            }}
          >
            <RefreshCw
              size={15}
            />

            Refresh
          </button>
        </div>


        {/* SUMMARY */}

        <div
          className={
            styles.summaryGrid
          }
        >
          {cards.map(
            (card) => {
              const Icon =
                card.icon;

              return (
                <div
                  className={
                    styles.summaryCard
                  }
                  key={
                    card.label
                  }
                >
                  <div
                    className={
                      styles.summaryIcon
                    }
                  >
                    <Icon
                      size={18}
                    />
                  </div>

                  <div
                    className={
                      styles.summaryContent
                    }
                  >
                    <span>
                      {card.label}
                    </span>

                    <strong>
                      {summaryLoading
                        ? "..."
                        : card.value}
                    </strong>

                    <small>
                      {summaryLoading
                        ? ""
                        : card.sub}
                    </small>
                  </div>
                </div>
              );
            }
          )}
        </div>


        {/* PIPELINE HEALTH */}

        <section
          className={
            styles.pipelinePanel
          }
        >
          <div
            className={
              styles.pipelineHeader
            }
          >
            <div>
              <h2>
                Pipeline Status
              </h2>

              <p>
                Pending stages across
                all recorded runs.
              </p>
            </div>

            <GitBranch
              size={18}
            />
          </div>


          <div
            className={
              styles.pipeline
            }
          >
            <PipelineStage
              title="ROI"
              description="Daily ROI processing"
              pending={
                summary
                  ?.roiPending ||
                0
              }
            />

            <div
              className={
                styles.pipelineLine
              }
            />

            <PipelineStage
              title="Snapshot"
              description="Merkle snapshot generation"
              pending={
                summary
                  ?.snapshotPending ||
                0
              }
            />

            <div
              className={
                styles.pipelineLine
              }
            />

            <PipelineStage
              title="Publish"
              description="On-chain root publishing"
              pending={
                summary
                  ?.publishPending ||
                0
              }
            />
          </div>
        </section>


        {/* LATEST PUBLISHED */}

        {summary
          ?.latestPublished && (
          <section
            className={
              styles.latestPublished
            }
          >
            <div
              className={
                styles.latestIcon
              }
            >
              <ShieldCheck
                size={19}
              />
            </div>

            <div
              className={
                styles.latestInfo
              }
            >
              <span>
                LATEST PUBLISHED
              </span>

              <strong>
                {formatDate(
                  summary
                    .latestPublished
                    .runDate
                )}
              </strong>
            </div>

            <HashValue
              label="Snapshot"
              value={
                summary
                  .latestPublished
                  .snapshotId
              }
            />

            <HashValue
              label="Merkle Root"
              value={
                summary
                  .latestPublished
                  .merkleRoot
              }
            />

            <HashValue
              label="Transaction"
              value={
                summary
                  .latestPublished
                  .txHash
              }
            />
          </section>
        )}


        {/* READ ONLY */}

        <div
          className={
            styles.notice
          }
        >
          <FileJson
            size={17}
          />

          <div>
            <strong>
              Automated closing
              monitor
            </strong>

            <p>
              Closing runs are
              generated by the daily
              backend process. This
              page does not trigger,
              regenerate, edit or
              publish Merkle data.
            </p>
          </div>
        </div>


        {/* FILTERS */}

        <section
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.filterBar
            }
          >
            <form
              className={
                styles.searchBox
              }
              onSubmit={
                submitSearch
              }
            >
              <Search
                size={15}
              />

              <input
                value={
                  searchInput
                }
                onChange={(
                  event
                ) =>
                  setSearchInput(
                    event.target
                      .value
                  )
                }
                placeholder="Snapshot ID, Merkle root or transaction hash..."
              />

              <button
                type="submit"
              >
                Search
              </button>
            </form>


            <select
              value={status}
              onChange={(
                event
              ) =>
                setStatus(
                  event.target
                    .value
                )
              }
            >
              <option value="">
                All Runs
              </option>

              <option value="complete">
                Complete
              </option>

              <option value="pending">
                In Progress
              </option>
            </select>


            <select
              value={sort}
              onChange={(
                event
              ) =>
                setSort(
                  event.target
                    .value
                )
              }
            >
              <option value="newest">
                Newest
              </option>

              <option value="oldest">
                Oldest
              </option>

              <option value="updated">
                Recently Updated
              </option>
            </select>


            {hasFilters && (
              <button
                type="button"
                className={
                  styles.resetButton
                }
                onClick={
                  clearFilters
                }
              >
                <X size={14} />

                Reset
              </button>
            )}
          </div>


          <div
            className={
              styles.advancedFilters
            }
          >
            <SelectFilter
              label="ROI Status"
              value={
                roiStatus
              }
              onChange={
                setRoiStatus
              }
            />

            <SelectFilter
              label="Snapshot Status"
              value={
                snapshotStatus
              }
              onChange={
                setSnapshotStatus
              }
            />

            <SelectFilter
              label="Publish Status"
              value={
                publishStatus
              }
              onChange={
                setPublishStatus
              }
            />

            <DateFilter
              label="From"
              value={from}
              onChange={
                setFrom
              }
            />

            <DateFilter
              label="To"
              value={to}
              onChange={
                setTo
              }
            />
          </div>
        </section>


        {/* TABLE */}

        <section
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.tableHeader
            }
          >
            <div>
              <h2>
                Run History
              </h2>

              <p>
                {Number(
                  pagination.total ||
                    0
                ).toLocaleString()}{" "}
                recorded closing
                runs
              </p>
            </div>
          </div>


          {error && (
            <div
              className={
                styles.error
              }
            >
              {error}
            </div>
          )}


          {loading ? (
            <LoadingState />
          ) : runs.length ===
            0 ? (
            <div
              className={
                styles.empty
              }
            >
              <GitBranch
                size={30}
              />

              <strong>
                No closing runs
                found
              </strong>

              <span>
                Try changing the
                filters.
              </span>
            </div>
          ) : (
            <div
              className={
                styles.tableScroll
              }
            >
              <table
                className={
                  styles.table
                }
              >
                <thead>
                  <tr>
                    <th>
                      Run Date
                    </th>

                    <th>
                      Overall
                    </th>

                    <th>
                      ROI
                    </th>

                    <th>
                      Snapshot
                    </th>

                    <th>
                      Snapshot ID
                    </th>

                    <th>
                      Merkle Root
                    </th>

                    <th>
                      Publish
                    </th>

                    <th>
                      TX Hash
                    </th>

                    <th>
                      Updated
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {runs.map(
                    (run) => (
                      <tr
                        key={
                          run.id
                        }
                      >
                        <td>
                          <div
                            className={
                              styles.runDate
                            }
                          >
                            <CalendarDays
                              size={
                                13
                              }
                            />

                            <strong>
                              {formatDate(
                                run.runDate
                              )}
                            </strong>
                          </div>
                        </td>


                        <td>
                          <OverallBadge
                            complete={
                              run.complete
                            }
                          />
                        </td>


                        <td>
                          <StageBadge
                            status={
                              run.roiStatus
                            }
                          />
                        </td>


                        <td>
                          <StageBadge
                            status={
                              run.snapshotStatus
                            }
                          />
                        </td>


                        <td>
                          <CopyValue
                            value={
                              run.snapshotId
                            }
                          />
                        </td>


                        <td>
                          <CopyValue
                            value={
                              run.merkleRoot
                            }
                          />
                        </td>


                        <td>
                          <StageBadge
                            status={
                              run.publishStatus
                            }
                          />
                        </td>


                        <td>
                          <CopyValue
                            value={
                              run.txHash
                            }
                          />
                        </td>


                        <td
                          className={
                            styles.updatedCell
                          }
                        >
                          {formatDateTime(
                            run.updatedAt
                          )}
                        </td>


                        <td>
                          <button
                            type="button"
                            className={
                              styles.viewButton
                            }
                            onClick={() =>
                              openDetails(
                                run.id
                              )
                            }
                          >
                            <Eye
                              size={
                                14
                              }
                            />
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}


          {!loading &&
            pagination.totalPages >
              1 && (
              <div
                className={
                  styles.pagination
                }
              >
                <button
                  type="button"
                  disabled={
                    pagination.page <=
                    1
                  }
                  onClick={() =>
                    loadRuns(
                      pagination.page -
                        1
                    )
                  }
                >
                  Previous
                </button>

                <span>
                  Page{" "}
                  {
                    pagination.page
                  }{" "}
                  of{" "}
                  {
                    pagination.totalPages
                  }
                </span>

                <button
                  type="button"
                  disabled={
                    pagination.page >=
                    pagination.totalPages
                  }
                  onClick={() =>
                    loadRuns(
                      pagination.page +
                        1
                    )
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
          className={
            styles.drawerOverlay
          }
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDetails();
            }
          }}
        >
          <aside
            className={
              styles.drawer
            }
          >
            <div
              className={
                styles.drawerHeader
              }
            >
              <div>
                <span>
                  CLOSING RUN
                </span>

                <h2>
                  Run #
                  {selectedId}
                </h2>

                <p>
                  Automated daily
                  closing pipeline
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeDetails
                }
              >
                <X
                  size={18}
                />
              </button>
            </div>


            <div
              className={
                styles.drawerBody
              }
            >
              {detailsLoading ? (
                <LoadingState />
              ) : detailsError ? (
                <div
                  className={
                    styles.error
                  }
                >
                  {
                    detailsError
                  }
                </div>
              ) : details ? (
                <RunDetails
                  run={
                    details
                  }
                />
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </AdminLayout>
  );
};


// ======================================================
// RUN DETAILS
// ======================================================

const RunDetails = ({
  run,
}) => (
  <>
    <div
      className={
        styles.detailHero
      }
    >
      <div>
        <span>
          Run Date
        </span>

        <strong>
          {formatDate(
            run.runDate
          )}
        </strong>
      </div>

      <OverallBadge
        complete={
          run.complete
        }
      />
    </div>


    <section
      className={
        styles.detailSection
      }
    >
      <SectionTitle
        title="Pipeline"
        subtitle="Recorded state of each closing stage."
      />

      <div
        className={
          styles.detailPipeline
        }
      >
        <DetailStage
          number="01"
          title="ROI Processing"
          status={
            run.roiStatus
          }
        />

        <DetailStage
          number="02"
          title="Merkle Snapshot"
          status={
            run.snapshotStatus
          }
        />

        <DetailStage
          number="03"
          title="Root Publishing"
          status={
            run.publishStatus
          }
        />
      </div>
    </section>


    <section
      className={
        styles.detailSection
      }
    >
      <SectionTitle
        title="Snapshot"
        subtitle="Snapshot reference generated by the closing process."
      />

      <DetailValue
        label="Snapshot ID"
        value={
          run.snapshotId
        }
        copy
      />
    </section>


    <section
      className={
        styles.detailSection
      }
    >
      <SectionTitle
        title="Merkle Root"
        subtitle="Merkle root recorded for this closing run."
      />

      <DetailValue
        label="Root"
        value={
          run.merkleRoot
        }
        copy
      />
    </section>


    <section
      className={
        styles.detailSection
      }
    >
      <SectionTitle
        title="Blockchain Publish"
        subtitle="Transaction reference recorded after publishing."
      />

      <DetailValue
        label="Transaction Hash"
        value={
          run.txHash
        }
        copy
      />
    </section>


    <section
      className={
        styles.detailSection
      }
    >
      <SectionTitle
        title="System"
        subtitle="Closing run metadata."
      />

      <div
        className={
          styles.detailGrid
        }
      >
        <div>
          <span>
            Run ID
          </span>

          <strong>
            #{run.id}
          </strong>
        </div>

        <div>
          <span>
            Last Updated
          </span>

          <strong>
            {formatDateTime(
              run.updatedAt
            )}
          </strong>
        </div>
      </div>
    </section>
  </>
);


// ======================================================
// COMPONENTS
// ======================================================

const PipelineStage = ({
  title,
  description,
  pending,
}) => {
  const count =
    Number(pending || 0);

  const healthy =
    count === 0;

  return (
    <div
      className={
        styles.pipelineStage
      }
    >
      <div
        className={
          healthy
            ? styles.stageIconDone
            : styles.stageIconPending
        }
      >
        {healthy ? (
          <CheckCircle2
            size={17}
          />
        ) : (
          <Clock3
            size={17}
          />
        )}
      </div>

      <div>
        <strong>
          {title}
        </strong>

        <span>
          {description}
        </span>

        <small>
          {healthy
            ? "No pending runs"
            : `${count} pending`}
        </small>
      </div>
    </div>
  );
};


const StageBadge = ({
  status,
}) => {
  const done =
    status === "done";

  return (
    <span
      className={
        done
          ? styles.doneBadge
          : styles.pendingBadge
      }
    >
      {done ? (
        <CheckCircle2
          size={12}
        />
      ) : (
        <Clock3
          size={12}
        />
      )}

      {done
        ? "Done"
        : "Pending"}
    </span>
  );
};


const OverallBadge = ({
  complete,
}) => (
  <span
    className={
      complete
        ? styles.completeBadge
        : styles.progressBadge
    }
  >
    {complete ? (
      <CheckCircle2
        size={12}
      />
    ) : (
      <Clock3
        size={12}
      />
    )}

    {complete
      ? "Complete"
      : "In Progress"}
  </span>
);


const CopyValue = ({
  value,
}) => {
  if (!value) {
    return (
      <span
        className={
          styles.noValue
        }
      >
        —
      </span>
    );
  }

  return (
    <div
      className={
        styles.copyValue
      }
    >
      <span
        title={
          String(value)
        }
      >
        {shorten(value)}
      </span>

      <button
        type="button"
        title="Copy"
        onClick={() =>
          copyText(value)
        }
      >
        <Copy
          size={12}
        />
      </button>
    </div>
  );
};


const HashValue = ({
  label,
  value,
}) => (
  <div
    className={
      styles.hashValue
    }
  >
    <span>
      {label}
    </span>

    <div>
      <strong
        title={
          value || ""
        }
      >
        {shorten(
          value,
          8,
          6
        )}
      </strong>

      {value && (
        <button
          type="button"
          onClick={() =>
            copyText(value)
          }
        >
          <Copy
            size={12}
          />
        </button>
      )}
    </div>
  </div>
);


const SelectFilter = ({
  label,
  value,
  onChange,
}) => (
  <div
    className={
      styles.filterField
    }
  >
    <label>
      {label}
    </label>

    <select
      value={value}
      onChange={(
        event
      ) =>
        onChange(
          event.target.value
        )
      }
    >
      <option value="">
        All
      </option>

      <option value="done">
        Done
      </option>

      <option value="pending">
        Pending
      </option>
    </select>
  </div>
);


const DateFilter = ({
  label,
  value,
  onChange,
}) => (
  <div
    className={
      styles.filterField
    }
  >
    <label>
      {label}
    </label>

    <input
      type="date"
      value={value}
      onChange={(
        event
      ) =>
        onChange(
          event.target.value
        )
      }
    />
  </div>
);


const DetailStage = ({
  number,
  title,
  status,
}) => (
  <div
    className={
      styles.detailStage
    }
  >
    <span
      className={
        styles.stageNumber
      }
    >
      {number}
    </span>

    <div>
      <strong>
        {title}
      </strong>

      <StageBadge
        status={
          status
        }
      />
    </div>
  </div>
);


const SectionTitle = ({
  title,
  subtitle,
}) => (
  <div
    className={
      styles.sectionTitle
    }
  >
    <h3>
      {title}
    </h3>

    <p>
      {subtitle}
    </p>
  </div>
);


const DetailValue = ({
  label,
  value,
  copy = false,
}) => (
  <div
    className={
      styles.detailValue
    }
  >
    <span>
      {label}
    </span>

    <div>
      <strong>
        {value || "—"}
      </strong>

      {copy && value && (
        <button
          type="button"
          onClick={() =>
            copyText(value)
          }
        >
          <Copy
            size={13}
          />

          Copy
        </button>
      )}
    </div>
  </div>
);


const LoadingState = () => (
  <div
    className={
      styles.loading
    }
  >
    <div
      className={
        styles.loader
      }
    />

    Loading closing
    runs...
  </div>
);


export default AdminClosingRuns;