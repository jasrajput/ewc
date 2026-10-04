import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ArrowDownToLine,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  ReceiptText,
  RefreshCw,
  Search,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import AdminLayout from "../../../components/admin/layout/AdminLayout";
import adminApi from "../../../services/adminApi";

import styles from "./AdminWithdrawals.module.css";


// ======================================================
// HELPERS
// ======================================================

const formatAmount = (value) => {
  const amount = Number(value || 0);

  return `$${amount.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`;
};


const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
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
  start = 7,
  end = 5
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


// ======================================================
// PAGE
// ======================================================

const AdminWithdrawals = () => {
  const navigate =
    useNavigate();


  // ====================================================
  // DATA
  // ====================================================

  const [
    summary,
    setSummary,
  ] = useState(null);

  const [
    withdrawals,
    setWithdrawals,
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
    blockchain,
    setBlockchain,
  ] = useState("");

  const [
    minAmount,
    setMinAmount,
  ] = useState("");

  const [
    maxAmount,
    setMaxAmount,
  ] = useState("");

  const [
    requestedFrom,
    setRequestedFrom,
  ] = useState("");

  const [
    requestedTo,
    setRequestedTo,
  ] = useState("");

  const [
    sort,
    setSort,
  ] = useState("newest");


  // ====================================================
  // UI STATE
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
  // AUTH ERROR
  // ====================================================

  const handleAuthError =
    useCallback(
      (err) => {
        const statusCode =
          err?.response?.status;

        if (
          statusCode === 401 ||
          statusCode === 403
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
  // LOAD SUMMARY
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
              "/admin/withdrawals/summary"
            );

          setSummary(
            response.data?.data ||
              null
          );
        } catch (err) {
          console.error(
            "Withdrawal summary error:",
            err
          );

          handleAuthError(
            err
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
  // LOAD LIST
  // ====================================================

  const loadWithdrawals =
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


          if (blockchain) {
            params.blockchain =
              blockchain;
          }


          if (
            minAmount !== ""
          ) {
            params.minAmount =
              minAmount;
          }


          if (
            maxAmount !== ""
          ) {
            params.maxAmount =
              maxAmount;
          }


          if (requestedFrom) {
            params.requestedFrom =
              requestedFrom;
          }


          if (requestedTo) {
            params.requestedTo =
              requestedTo;
          }


          const response =
            await adminApi.get(
              "/admin/withdrawals",
              {
                params,
              }
            );


          setWithdrawals(
            response.data?.data
              ?.withdrawals || []
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
        } catch (err) {
          console.error(
            "Admin withdrawals error:",
            err
          );

          if (
            handleAuthError(
              err
            )
          ) {
            return;
          }

          setWithdrawals(
            []
          );

          setError(
            err.response?.data
              ?.message ||
              "Unable to load withdrawals."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        search,
        status,
        blockchain,
        minAmount,
        maxAmount,
        requestedFrom,
        requestedTo,
        sort,
        handleAuthError,
      ]
    );


  // ====================================================
  // INITIAL LOAD
  // ====================================================

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);


  useEffect(() => {
    loadWithdrawals(1);
  }, [loadWithdrawals]);


  // ====================================================
  // SEARCH
  // ====================================================

  const submitSearch = (
    event
  ) => {
    event.preventDefault();

    setSearch(
      searchInput.trim()
    );
  };


  const clearFilters =
    () => {
      setSearchInput("");
      setSearch("");

      setStatus("");
      setBlockchain("");

      setMinAmount("");
      setMaxAmount("");

      setRequestedFrom("");
      setRequestedTo("");

      setSort("newest");
    };


  const hasFilters =
    Boolean(search) ||
    Boolean(status) ||
    Boolean(blockchain) ||
    minAmount !== "" ||
    maxAmount !== "" ||
    Boolean(
      requestedFrom
    ) ||
    Boolean(
      requestedTo
    ) ||
    sort !== "newest";


  // ====================================================
  // DETAILS
  // ====================================================

  const openDetails =
    async (
      withdrawalId
    ) => {
      try {
        setSelectedId(
          withdrawalId
        );

        setDetails(null);
        setDetailsError("");
        setDetailsLoading(
          true
        );

        const response =
          await adminApi.get(
            `/admin/withdrawals/${withdrawalId}`
          );

        setDetails(
          response.data?.data ||
            null
        );
      } catch (err) {
        console.error(
          "Withdrawal details error:",
          err
        );

        if (
          handleAuthError(
            err
          )
        ) {
          return;
        }

        setDetailsError(
          err.response?.data
            ?.message ||
            "Unable to load withdrawal details."
        );
      } finally {
        setDetailsLoading(
          false
        );
      }
    };


  const closeDetails =
    () => {
      setSelectedId(null);
      setDetails(null);
      setDetailsError("");
    };


  // ====================================================
  // SUMMARY CARDS
  // ====================================================

  const summaryCards = [
    {
      label:
        "Total Requested",

      value:
        formatAmount(
          summary
            ?.totalRequested
        ),

      sub:
        `${Number(
          summary
            ?.totalRequests ||
            0
        ).toLocaleString()} requests`,

      icon:
        ArrowDownToLine,
    },

    {
      label:
        "Pending",

      value:
        formatAmount(
          summary
            ?.pendingAmount
        ),

      sub:
        `${Number(
          summary
            ?.pendingRequests ||
            0
        ).toLocaleString()} requests`,

      icon:
        Clock3,
    },

    {
      label:
        "Approved",

      value:
        formatAmount(
          summary
            ?.approvedAmount
        ),

      sub:
        `${Number(
          summary
            ?.approvedRequests ||
            0
        ).toLocaleString()} requests`,

      icon:
        CheckCircle2,
    },

    {
      label:
        "Total Payable",

      value:
        formatAmount(
          summary
            ?.totalPayable
        ),

      sub:
        "Recorded payable value",

      icon:
        CircleDollarSign,
    },
  ];


  // ====================================================
  // RENDER
  // ====================================================

  return (
    <AdminLayout>
      <div
        className={
          styles.page
        }
      >

        {/* ===============================
            HEADER
        =============================== */}

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
              Withdrawals
            </h1>

            <p>
              Monitor member
              withdrawal requests,
              payable amounts and
              blockchain settlement
              information.
            </p>
          </div>


          <button
            type="button"
            className={
              styles.refreshButton
            }
            onClick={() => {
              loadSummary();

              loadWithdrawals(
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


        {/* ===============================
            SUMMARY
        =============================== */}

        <div
          className={
            styles.summaryGrid
          }
        >
          {summaryCards.map(
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


        {/* ===============================
            FINANCIAL STRIP
        =============================== */}

        <div
          className={
            styles.financialStrip
          }
        >
          <MiniStat
            label="Today's Requests"
            value={Number(
              summary
                ?.todayRequests ||
                0
            ).toLocaleString()}
            loading={
              summaryLoading
            }
          />

          <MiniStat
            label="Today's Requested"
            value={formatAmount(
              summary
                ?.todayRequested
            )}
            loading={
              summaryLoading
            }
          />

          <MiniStat
            label="Total Deductions"
            value={formatAmount(
              summary
                ?.totalDeduction
            )}
            loading={
              summaryLoading
            }
          />

          <MiniStat
            label="Total TDS"
            value={formatAmount(
              summary
                ?.totalTds
            )}
            loading={
              summaryLoading
            }
          />

          <MiniStat
            label="Admin Charges"
            value={formatAmount(
              summary
                ?.totalAdminCharge
            )}
            loading={
              summaryLoading
            }
          />
        </div>


        {/* ===============================
            INFO NOTICE
        =============================== */}

        <div
          className={
            styles.notice
          }
        >
          <div
            className={
              styles.noticeIcon
            }
          >
            <ReceiptText
              size={17}
            />
          </div>

          <div>
            <strong>
              Monitoring mode
            </strong>

            <p>
              This screen is
              currently read-only.
              Approval and payout
              actions will be added
              after the withdrawal,
              Merkle and on-chain
              settlement flow is
              confirmed.
            </p>
          </div>
        </div>


        {/* ===============================
            FILTERS
        =============================== */}

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
                placeholder="Search member, wallet, transaction ID..."
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
                All Status
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="approved">
                Approved
              </option>
            </select>


            <select
              value={
                blockchain
              }
              onChange={(
                event
              ) =>
                setBlockchain(
                  event.target
                    .value
                )
              }
            >
              <option value="">
                Blockchain: All
              </option>

              <option value="recorded">
                Transaction Recorded
              </option>

              <option value="missing">
                No Transaction
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

              <option value="amount_desc">
                Highest Amount
              </option>

              <option value="amount_asc">
                Lowest Amount
              </option>

              <option value="payable_desc">
                Highest Payable
              </option>

              <option value="payable_asc">
                Lowest Payable
              </option>

              <option value="approved_newest">
                Recently Approved
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
                <X
                  size={14}
                />

                Reset
              </button>
            )}
          </div>


          <div
            className={
              styles.advancedFilters
            }
          >
            <FilterField
              label="Minimum Amount"
              type="number"
              value={
                minAmount
              }
              placeholder="0"
              onChange={
                setMinAmount
              }
            />

            <FilterField
              label="Maximum Amount"
              type="number"
              value={
                maxAmount
              }
              placeholder="Any"
              onChange={
                setMaxAmount
              }
            />

            <FilterField
              label="Requested From"
              type="date"
              value={
                requestedFrom
              }
              onChange={
                setRequestedFrom
              }
            />

            <FilterField
              label="Requested To"
              type="date"
              value={
                requestedTo
              }
              onChange={
                setRequestedTo
              }
            />
          </div>
        </section>


        {/* ===============================
            TABLE
        =============================== */}

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
                Withdrawal Ledger
              </h2>

              <p>
                {Number(
                  pagination.total ||
                    0
                ).toLocaleString()}{" "}
                withdrawal records
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
            <LoadingState
              text="Loading withdrawals..."
            />
          ) : withdrawals.length ===
            0 ? (
            <div
              className={
                styles.empty
              }
            >
              <Wallet
                size={30}
              />

              <strong>
                No withdrawals
                found
              </strong>

              <span>
                Try changing the
                current filters.
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
                      Request
                    </th>

                    <th>
                      Member
                    </th>

                    <th>
                      Amount
                    </th>

                    <th>
                      Deduction
                    </th>

                    <th>
                      Payable
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Requested
                    </th>

                    <th>
                      Blockchain
                    </th>

                    <th>
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {withdrawals.map(
                    (
                      withdrawal
                    ) => (
                      <WithdrawalRow
                        key={
                          withdrawal.id
                        }
                        withdrawal={
                          withdrawal
                        }
                        onDetails={
                          openDetails
                        }
                        navigate={
                          navigate
                        }
                      />
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
                    loadWithdrawals(
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
                    loadWithdrawals(
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


      {/* ===============================
          DRAWER
      =============================== */}

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
                  WITHDRAWAL
                </span>

                <h2>
                  Request #
                  {selectedId}
                </h2>

                <p>
                  Financial and
                  settlement details
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.closeButton
                }
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
                <LoadingState
                  text="Loading withdrawal..."
                />
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
                <WithdrawalDetails
                  data={details}
                />
              ) : null}
            </div>


            {details
              ?.withdrawal
              ?.member?.id && (
              <div
                className={
                  styles.drawerFooter
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/admin/members/${details.withdrawal.member.id}`
                    )
                  }
                >
                  <UserRound
                    size={14}
                  />

                  Member
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/admin/earnings?member=${encodeURIComponent(
                        details
                          .withdrawal
                          .member
                          .user_id
                      )}`
                    )
                  }
                >
                  <CircleDollarSign
                    size={14}
                  />

                  Earnings
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </AdminLayout>
  );
};


// ======================================================
// TABLE ROW
// ======================================================

const WithdrawalRow = ({
  withdrawal,
  onDetails,
  navigate,
}) => {
  const member =
    withdrawal.member || {};

  const chain =
    withdrawal.blockchain ||
    {};

  const hasBlockchain =
    Boolean(
      chain.txnId ||
        chain.txId ||
        chain.blockNumber
    );


  return (
    <tr>
      <td>
        <div
          className={
            styles.requestCell
          }
        >
          <strong>
            #
            {
              withdrawal.id
            }
          </strong>

          <span>
            Withdrawal
          </span>
        </div>
      </td>


      <td>
        <div
          className={
            styles.memberCell
          }
        >
          <div
            className={
              styles.avatar
            }
          >
            {(
              member.name ||
              member.user_id ||
              "M"
            )
              .charAt(0)
              .toUpperCase()}
          </div>

          <div>
            <strong>
              {member.name ||
                "Unknown Member"}
            </strong>

            <span>
              {member.user_id ||
                "—"}
            </span>
          </div>
        </div>
      </td>


      <td>
        <strong
          className={
            styles.amount
          }
        >
          {formatAmount(
            withdrawal.amount
          )}
        </strong>
      </td>


      <td>
        <span
          className={
            styles.deduction
          }
        >
          {formatAmount(
            withdrawal.deduction
          )}
        </span>
      </td>


      <td>
        <strong
          className={
            styles.payable
          }
        >
          {formatAmount(
            withdrawal.payable
          )}
        </strong>
      </td>


      <td>
        <StatusBadge
          approved={
            withdrawal.status ===
            1
          }
        />
      </td>


      <td>
        <div
          className={
            styles.dateCell
          }
        >
          <CalendarDays
            size={13}
          />

          <span>
            {formatDate(
              withdrawal.requestedAt
            )}
          </span>
        </div>
      </td>


      <td>
        {hasBlockchain ? (
          <div
            className={
              styles.chainRecorded
            }
          >
            <CheckCircle2
              size={13}
            />

            <span>
              {shorten(
                chain.txnId ||
                  chain.txId ||
                  chain.blockNumber
              )}
            </span>
          </div>
        ) : (
          <span
            className={
              styles.chainMissing
            }
          >
            Not recorded
          </span>
        )}
      </td>


      <td>
        <div
          className={
            styles.actions
          }
        >
          <button
            type="button"
            title="Withdrawal details"
            onClick={() =>
              onDetails(
                withdrawal.id
              )
            }
          >
            <Eye
              size={14}
            />
          </button>


          {member.id && (
            <button
              type="button"
              title="Member details"
              onClick={() =>
                navigate(
                  `/admin/members/${member.id}`
                )
              }
            >
              <UserRound
                size={14}
              />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};


// ======================================================
// DRAWER DETAILS
// ======================================================

const WithdrawalDetails = ({
  data,
}) => {
  const withdrawal =
    data.withdrawal || {};

  const member =
    withdrawal.member || {};

  const chain =
    withdrawal.blockchain ||
    {};

  const memberSummary =
    data.memberSummary || {};


  return (
    <>
      {/* STATUS */}

      <div
        className={
          styles.detailHero
        }
      >
        <div>
          <span>
            Requested Amount
          </span>

          <strong>
            {formatAmount(
              withdrawal.amount
            )}
          </strong>
        </div>

        <StatusBadge
          approved={
            withdrawal.status ===
            1
          }
        />
      </div>


      {/* FINANCIAL */}

      <DrawerSection
        title="Financial Breakdown"
        subtitle="Recorded values for this withdrawal."
        icon={
          CircleDollarSign
        }
      >
        <div
          className={
            styles.infoGrid
          }
        >
          <Info
            label="Requested"
            value={formatAmount(
              withdrawal.amount
            )}
          />

          <Info
            label="Payable"
            value={formatAmount(
              withdrawal.payable
            )}
            gold
          />

          <Info
            label="Deduction"
            value={formatAmount(
              withdrawal.deduction
            )}
          />

          <Info
            label="TDS"
            value={formatAmount(
              withdrawal.tds
            )}
          />

          <Info
            label="Admin Charge"
            value={formatAmount(
              withdrawal.adminCharge
            )}
          />

          <Info
            label="Pending Balance"
            value={formatAmount(
              withdrawal.pendingBalance
            )}
          />
        </div>
      </DrawerSection>


      {/* MEMBER */}

      <DrawerSection
        title="Member"
        subtitle="Account linked to this request."
        icon={
          UserRound
        }
      >
        <div
          className={
            styles.infoGrid
          }
        >
          <Info
            label="Member ID"
            value={
              member.user_id ||
              "—"
            }
          />

          <Info
            label="Name"
            value={
              member.name ||
              "—"
            }
          />

          <Info
            label="Email"
            value={
              member.email ||
              "—"
            }
          />

          <Info
            label="Account"
            value={
              member.blocked
                ? "Blocked"
                : "Active"
            }
          />
        </div>

        <div
          className={
            styles.walletBox
          }
        >
          <span>
            Wallet Address
          </span>

          <strong>
            {member.wallet ||
              "No wallet recorded"}
          </strong>
        </div>
      </DrawerSection>


      {/* TIMELINE */}

      <DrawerSection
        title="Timeline"
        subtitle="Request and approval dates."
        icon={
          CalendarDays
        }
      >
        <div
          className={
            styles.timeline
          }
        >
          <TimelineItem
            title="Withdrawal requested"
            value={formatDate(
              withdrawal.requestedAt
            )}
            complete
          />

          <TimelineItem
            title="Approved"
            value={
              withdrawal.status ===
              1
                ? formatDate(
                    withdrawal.approvedAt
                  )
                : "Pending"
            }
            complete={
              withdrawal.status ===
              1
            }
          />
        </div>
      </DrawerSection>


      {/* BLOCKCHAIN */}

      <DrawerSection
        title="Blockchain Settlement"
        subtitle="Transaction information recorded in the withdrawal."
        icon={Wallet}
      >
        <div
          className={
            styles.infoGrid
          }
        >
          <Info
            label="Transaction ID"
            value={
              chain.txnId ||
              "—"
            }
          />

          <Info
            label="TX ID"
            value={
              chain.txId ||
              "—"
            }
          />

          <Info
            label="Block Number"
            value={
              chain.blockNumber ||
              "—"
            }
          />

          <Info
            label="Log Index"
            value={
              chain.logIndex ??
              "—"
            }
          />

          <Info
            label="Cumulative Amount"
            value={formatAmount(
              chain.cumulativeAmount
            )}
          />

          <Info
            label="Recorded Price"
            value={formatAmount(
              chain.price
            )}
          />
        </div>

        {withdrawal.apiStatus !==
          null &&
          withdrawal.apiStatus !==
            undefined && (
            <div
              className={
                styles.metaBox
              }
            >
              <span>
                API Status
              </span>

              <strong>
                {String(
                  withdrawal.apiStatus
                )}
              </strong>
            </div>
          )}
      </DrawerSection>


      {/* OTHER */}

      {(withdrawal.remarks ||
        withdrawal.neftNo) && (
        <DrawerSection
          title="Additional Information"
          subtitle="Additional values stored with this request."
          icon={
            ReceiptText
          }
        >
          <div
            className={
              styles.infoGrid
            }
          >
            <Info
              label="NEFT / Reference"
              value={
                withdrawal.neftNo ||
                "—"
              }
            />

            <Info
              label="Type"
              value={String(
                withdrawal.type ??
                  "—"
              )}
            />
          </div>

          {withdrawal.remarks && (
            <div
              className={
                styles.remarks
              }
            >
              <span>
                Remarks
              </span>

              <p>
                {
                  withdrawal.remarks
                }
              </p>
            </div>
          )}
        </DrawerSection>
      )}


      {/* MEMBER SUMMARY */}

      {member.id && (
        <DrawerSection
          title="Member Withdrawal Summary"
          subtitle="Withdrawal history totals for this member."
          icon={
            ReceiptText
          }
        >
          <div
            className={
              styles.memberStats
            }
          >
            <Info
              label="Total Requests"
              value={Number(
                memberSummary
                  .totalRequests ||
                  0
              ).toLocaleString()}
            />

            <Info
              label="Total Requested"
              value={formatAmount(
                memberSummary
                  .totalRequested
              )}
            />

            <Info
              label="Pending"
              value={`${Number(
                memberSummary
                  .pendingRequests ||
                  0
              )} · ${formatAmount(
                memberSummary
                  .pendingAmount
              )}`}
            />

            <Info
              label="Approved"
              value={`${Number(
                memberSummary
                  .approvedRequests ||
                  0
              )} · ${formatAmount(
                memberSummary
                  .approvedAmount
              )}`}
            />
          </div>
        </DrawerSection>
      )}
    </>
  );
};


// ======================================================
// SMALL COMPONENTS
// ======================================================

const StatusBadge = ({
  approved,
}) => (
  <span
    className={
      approved
        ? styles.approvedBadge
        : styles.pendingBadge
    }
  >
    {approved ? (
      <CheckCircle2
        size={12}
      />
    ) : (
      <Clock3
        size={12}
      />
    )}

    {approved
      ? "Approved"
      : "Pending"}
  </span>
);


const MiniStat = ({
  label,
  value,
  loading,
}) => (
  <div
    className={
      styles.miniStat
    }
  >
    <span>
      {label}
    </span>

    <strong>
      {loading
        ? "..."
        : value}
    </strong>
  </div>
);


const FilterField = ({
  label,
  type,
  value,
  placeholder,
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
      type={type}
      value={value}
      min={
        type === "number"
          ? "0"
          : undefined
      }
      placeholder={
        placeholder
      }
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


const Info = ({
  label,
  value,
  gold = false,
}) => (
  <div
    className={
      styles.infoItem
    }
  >
    <span>
      {label}
    </span>

    <strong
      className={
        gold
          ? styles.goldText
          : ""
      }
    >
      {value}
    </strong>
  </div>
);


const DrawerSection = ({
  title,
  subtitle,
  icon: Icon,
  children,
}) => (
  <section
    className={
      styles.drawerSection
    }
  >
    <div
      className={
        styles.drawerSectionHeader
      }
    >
      <div>
        <h3>
          {title}
        </h3>

        <p>
          {subtitle}
        </p>
      </div>

      <Icon
        size={17}
      />
    </div>

    {children}
  </section>
);


const TimelineItem = ({
  title,
  value,
  complete,
}) => (
  <div
    className={
      styles.timelineItem
    }
  >
    <div
      className={
        complete
          ? styles.timelineDotComplete
          : styles.timelineDot
      }
    />

    <div>
      <strong>
        {title}
      </strong>

      <span>
        {value}
      </span>
    </div>
  </div>
);


const LoadingState = ({
  text,
}) => (
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

    {text}
  </div>
);


export default AdminWithdrawals;