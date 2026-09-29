import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Copy,
  Eye,
  ReceiptText,
  RefreshCw,
  Search,
  User,
  Wallet,
  X,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import AdminLayout from "../../../components/admin/layout/AdminLayout";
import adminApi from "../../../services/adminApi";

import styles from "./AdminTransactions.module.css";


// ======================================================
// HELPERS
// ======================================================

const formatMoney = (value) => {
  const amount =
    Number(value || 0);

  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 5,
    }
  ).format(amount);
};


const formatDateTime = (value) => {
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
  start = 8,
  end = 6
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


const copyText = async (value) => {
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

const AdminTransactions = () => {
  const navigate =
    useNavigate();


  const [
    summary,
    setSummary,
  ] = useState(null);

  const [
    transactions,
    setTransactions,
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
    type,
    setType,
  ] = useState("");

  const [
    flow,
    setFlow,
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
    minAmount,
    setMinAmount,
  ] = useState("");

  const [
    maxAmount,
    setMaxAmount,
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


  // DETAILS

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
          setSummaryLoading(true);

          const response =
            await adminApi.get(
              "/admin/transactions/summary"
            );

          setSummary(
            response.data?.data ||
              null
          );
        } catch (error) {
          console.error(
            "Transaction summary error:",
            error
          );

          handleAuthError(error);
        } finally {
          setSummaryLoading(false);
        }
      },
      [handleAuthError]
    );


  // ====================================================
  // TRANSACTION LIST
  // ====================================================

  const loadTransactions =
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

          if (type) {
            params.type =
              type;
          }

          if (flow) {
            params.flow =
              flow;
          }

          if (from) {
            params.from =
              from;
          }

          if (to) {
            params.to =
              to;
          }

          if (minAmount !== "") {
            params.minAmount =
              minAmount;
          }

          if (maxAmount !== "") {
            params.maxAmount =
              maxAmount;
          }


          const response =
            await adminApi.get(
              "/admin/transactions",
              {
                params,
              }
            );


          setTransactions(
            response.data?.data
              ?.transactions ||
              []
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
            "Transactions error:",
            error
          );

          if (
            handleAuthError(error)
          ) {
            return;
          }

          setTransactions([]);

          setError(
            error.response?.data
              ?.message ||
              "Unable to load transactions."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        search,
        type,
        flow,
        from,
        to,
        minAmount,
        maxAmount,
        sort,
        handleAuthError,
      ]
    );


  useEffect(() => {
    loadSummary();
  }, [loadSummary]);


  useEffect(() => {
    loadTransactions(1);
  }, [loadTransactions]);


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

    setType("");
    setFlow("");

    setFrom("");
    setTo("");

    setMinAmount("");
    setMaxAmount("");

    setSort("newest");
  };


  const hasFilters =
    Boolean(search) ||
    Boolean(type) ||
    Boolean(flow) ||
    Boolean(from) ||
    Boolean(to) ||
    minAmount !== "" ||
    maxAmount !== "" ||
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
            `/admin/transactions/${id}`
          );

        setDetails(
          response.data?.data ||
            null
        );
      } catch (error) {
        console.error(
          "Transaction details error:",
          error
        );

        if (
          handleAuthError(error)
        ) {
          return;
        }

        setDetailsError(
          error.response?.data
            ?.message ||
            "Unable to load transaction."
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
  // CARDS
  // ====================================================

  const cards = [
    {
      label:
        "Total Credits",

      value:
        `$${formatMoney(
          summary?.totalCredits
        )}`,

      description:
        "All ledger credits",

      icon:
        ArrowDownLeft,
    },

    {
      label:
        "Total Debits",

      value:
        `$${formatMoney(
          summary?.totalDebits
        )}`,

      description:
        "All ledger debits",

      icon:
        ArrowUpRight,
    },

    {
      label:
        "Net Ledger",

      value:
        `$${formatMoney(
          summary?.netLedger
        )}`,

      description:
        "Credits minus debits",

      icon:
        BarChart3,
    },

    {
      label:
        "Transactions",

      value:
        Number(
          summary
            ?.totalTransactions ||
            0
        ).toLocaleString(),

      description:
        "Recorded ledger entries",

      icon:
        ReceiptText,
    },
  ];


  return (
    <AdminLayout>
      <div
        className={styles.page}
      >

        {/* =========================================
            HEADER
        ========================================= */}

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
              Transactions
            </h1>

            <p>
              Review the complete
              member credit and debit
              ledger across Direct,
              Rank, Salary and Reward
              transactions.
            </p>
          </div>


          <button
            type="button"
            className={
              styles.refreshButton
            }
            onClick={() => {
              loadSummary();

              loadTransactions(
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


        {/* =========================================
            SUMMARY
        ========================================= */}

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
                  key={card.label}
                  className={
                    styles.summaryCard
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
                        : card.description}
                    </small>
                  </div>
                </div>
              );
            }
          )}
        </div>


        {/* =========================================
            INCOME BREAKDOWN
        ========================================= */}

        <section
          className={
            styles.breakdownPanel
          }
        >
          <div
            className={
              styles.breakdownHeader
            }
          >
            <div>
              <h2>
                Income Breakdown
              </h2>

              <p>
                Credit totals by
                known transaction
                direction.
              </p>
            </div>

            <BarChart3
              size={18}
            />
          </div>


          <div
            className={
              styles.breakdownGrid
            }
          >
            <IncomeBox
              label="Direct"
              direction="1"
              amount={
                summary?.income
                  ?.direct
              }
            />

            <IncomeBox
              label="Rank"
              direction="5"
              amount={
                summary?.income
                  ?.rank
              }
            />

            <IncomeBox
              label="Salary"
              direction="6"
              amount={
                summary?.income
                  ?.salary
              }
            />

            <IncomeBox
              label="Reward"
              direction="7"
              amount={
                summary?.income
                  ?.reward
              }
            />
          </div>
        </section>


        {/* =========================================
            TODAY
        ========================================= */}

        <div
          className={
            styles.todayStrip
          }
        >
          <div>
            <span>
              TODAY'S TRANSACTIONS
            </span>

            <strong>
              {Number(
                summary?.today
                  ?.transactions ||
                  0
              ).toLocaleString()}
            </strong>
          </div>

          <div>
            <span>
              TODAY'S CREDITS
            </span>

            <strong>
              $
              {formatMoney(
                summary?.today
                  ?.credits
              )}
            </strong>
          </div>

          <div>
            <span>
              TODAY'S DEBITS
            </span>

            <strong>
              $
              {formatMoney(
                summary?.today
                  ?.debits
              )}
            </strong>
          </div>
        </div>


        {/* =========================================
            FILTERS
        ========================================= */}

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
                placeholder="Member ID, name, email, wallet, description or transaction ID..."
              />

              <button
                type="submit"
              >
                Search
              </button>
            </form>


            <select
              value={type}
              onChange={(
                event
              ) =>
                setType(
                  event.target.value
                )
              }
            >
              <option value="">
                All Types
              </option>

              <option value="direct">
                Direct
              </option>

              <option value="rank">
                Rank
              </option>

              <option value="salary">
                Salary
              </option>

              <option value="reward">
                Reward
              </option>
            </select>


            <select
              value={flow}
              onChange={(
                event
              ) =>
                setFlow(
                  event.target.value
                )
              }
            >
              <option value="">
                Credit & Debit
              </option>

              <option value="credit">
                Credits
              </option>

              <option value="debit">
                Debits
              </option>
            </select>


            <select
              value={sort}
              onChange={(
                event
              ) =>
                setSort(
                  event.target.value
                )
              }
            >
              <option value="newest">
                Newest
              </option>

              <option value="oldest">
                Oldest
              </option>

              <option value="highest">
                Highest Amount
              </option>

              <option value="lowest">
                Lowest Amount
              </option>

              <option value="credit_desc">
                Highest Credit
              </option>

              <option value="debit_desc">
                Highest Debit
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
            <FilterField
              label="From Date"
            >
              <input
                type="date"
                value={from}
                onChange={(
                  event
                ) =>
                  setFrom(
                    event.target
                      .value
                  )
                }
              />
            </FilterField>


            <FilterField
              label="To Date"
            >
              <input
                type="date"
                value={to}
                onChange={(
                  event
                ) =>
                  setTo(
                    event.target
                      .value
                  )
                }
              />
            </FilterField>


            <FilterField
              label="Minimum Amount"
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  minAmount
                }
                onChange={(
                  event
                ) =>
                  setMinAmount(
                    event.target
                      .value
                  )
                }
                placeholder="0.00"
              />
            </FilterField>


            <FilterField
              label="Maximum Amount"
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  maxAmount
                }
                onChange={(
                  event
                ) =>
                  setMaxAmount(
                    event.target
                      .value
                  )
                }
                placeholder="Any amount"
              />
            </FilterField>
          </div>
        </section>


        {/* =========================================
            TABLE
        ========================================= */}

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
                Ledger
              </h2>

              <p>
                {Number(
                  pagination.total ||
                    0
                ).toLocaleString()}{" "}
                transaction entries
              </p>
            </div>

            <div
              className={
                styles.readOnly
              }
            >
              Read only
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
          ) : transactions.length ===
            0 ? (
            <div
              className={
                styles.empty
              }
            >
              <ReceiptText
                size={30}
              />

              <strong>
                No transactions
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
                      ID
                    </th>

                    <th>
                      Date
                    </th>

                    <th>
                      Member
                    </th>

                    <th>
                      Type
                    </th>

                    <th>
                      Description
                    </th>

                    <th>
                      Credit
                    </th>

                    <th>
                      Debit
                    </th>

                    <th>
                      Net
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.map(
                    (
                      transaction
                    ) => (
                      <TransactionRow
                        key={
                          transaction.id
                        }
                        transaction={
                          transaction
                        }
                        onView={() =>
                          openDetails(
                            transaction.id
                          )
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
                    loadTransactions(
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
                    loadTransactions(
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


      {/* =========================================
          DETAILS DRAWER
      ========================================= */}

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
                  TRANSACTION
                </span>

                <h2>
                  #
                  {selectedId}
                </h2>

                <p>
                  Member ledger
                  entry
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
                <TransactionDetails
                  data={
                    details
                  }
                  navigate={
                    navigate
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
// TRANSACTION ROW
// ======================================================

const TransactionRow = ({
  transaction,
  onView,
}) => {
  const credit =
    Number(
      transaction.credit || 0
    );

  const debit =
    Number(
      transaction.debit || 0
    );

  const net =
    Number(
      transaction.net || 0
    );


  return (
    <tr>
      <td>
        <span
          className={
            styles.transactionId
          }
        >
          #{transaction.id}
        </span>
      </td>


      <td
        className={
          styles.dateCell
        }
      >
        {formatDateTime(
          transaction.createdAt
        )}
      </td>


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
            <User
              size={13}
            />
          </div>

          <div>
            <strong>
              {transaction.member
                ?.name ||
                "Unknown Member"}
            </strong>

            <span>
              {transaction.member
                ?.user_id ||
                `#${transaction.member?.id || "—"}`}
            </span>
          </div>
        </div>
      </td>


      <td>
        <TypeBadge
          type={
            transaction.type
          }
          direction={
            transaction.direction
          }
        />
      </td>


      <td>
        <div
          className={
            styles.description
          }
          title={
            transaction.description ||
            ""
          }
        >
          {transaction.description ||
            "—"}
        </div>
      </td>


      <td>
        {credit > 0 ? (
          <span
            className={
              styles.credit
            }
          >
            +
            $
            {formatMoney(
              credit
            )}
          </span>
        ) : (
          <span
            className={
              styles.zero
            }
          >
            —
          </span>
        )}
      </td>


      <td>
        {debit > 0 ? (
          <span
            className={
              styles.debit
            }
          >
            -
            $
            {formatMoney(
              debit
            )}
          </span>
        ) : (
          <span
            className={
              styles.zero
            }
          >
            —
          </span>
        )}
      </td>


      <td>
        <span
          className={
            net >= 0
              ? styles.netPositive
              : styles.netNegative
          }
        >
          {net >= 0
            ? "+"
            : "-"}
          $
          {formatMoney(
            Math.abs(net)
          )}
        </span>
      </td>


      <td>
        <button
          type="button"
          className={
            styles.viewButton
          }
          onClick={
            onView
          }
          title="View transaction"
        >
          <Eye
            size={14}
          />
        </button>
      </td>
    </tr>
  );
};


// ======================================================
// DETAILS
// ======================================================

const TransactionDetails = ({
  data,
  navigate,
}) => {
  const transaction =
    data.transaction;

  const memberSummary =
    data.memberSummary;


  if (!transaction) {
    return null;
  }


  const credit =
    Number(
      transaction.credit || 0
    );

  const debit =
    Number(
      transaction.debit || 0
    );

  const net =
    Number(
      transaction.net || 0
    );


  return (
    <>
      <div
        className={
          styles.detailHero
        }
      >
        <div>
          <span>
            Transaction
          </span>

          <strong>
            #
            {transaction.id}
          </strong>

          <small>
            {formatDateTime(
              transaction.createdAt
            )}
          </small>
        </div>

        <TypeBadge
          type={
            transaction.type
          }
          direction={
            transaction.direction
          }
        />
      </div>


      <section
        className={
          styles.detailSection
        }
      >
        <SectionTitle
          title="Ledger Entry"
          subtitle="Financial values recorded for this transaction."
        />

        <div
          className={
            styles.amountGrid
          }
        >
          <AmountBox
            label="Credit"
            value={
              credit
            }
            type="credit"
          />

          <AmountBox
            label="Debit"
            value={
              debit
            }
            type="debit"
          />

          <AmountBox
            label="Net"
            value={
              net
            }
            type={
              net >= 0
                ? "credit"
                : "debit"
            }
            absolute
          />
        </div>
      </section>


      <section
        className={
          styles.detailSection
        }
      >
        <SectionTitle
          title="Transaction Information"
          subtitle="Raw ledger classification and description."
        />

        <div
          className={
            styles.infoRows
          }
        >
          <InfoRow
            label="Transaction ID"
            value={
              `#${transaction.id}`
            }
          />

          <InfoRow
            label="Direction"
            value={
              `${transaction.direction} — ${transaction.type}`
            }
          />

          <InfoRow
            label="Created"
            value={
              formatDateTime(
                transaction.createdAt
              )
            }
          />

          <InfoRow
            label="Description"
            value={
              transaction.description ||
              "—"
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
          title="Member"
          subtitle="Member associated with this ledger entry."
        />

        <div
          className={
            styles.memberDetail
          }
        >
          <div
            className={
              styles.largeAvatar
            }
          >
            <User
              size={19}
            />
          </div>

          <div
            className={
              styles.memberDetailInfo
            }
          >
            <strong>
              {transaction.member
                ?.name ||
                "Unknown Member"}
            </strong>

            <span>
              {transaction.member
                ?.user_id ||
                "No public member ID"}
            </span>
          </div>

          {transaction.member
            ?.id && (
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/admin/members/${transaction.member.id}`
                )
              }
            >
              View Member
            </button>
          )}
        </div>


        <div
          className={
            styles.infoRows
          }
        >
          <InfoRow
            label="Internal ID"
            value={
              transaction.member
                ?.id
                ? `#${transaction.member.id}`
                : "—"
            }
          />

          <InfoRow
            label="Email"
            value={
              transaction.member
                ?.email ||
              "—"
            }
          />

          <InfoRow
            label="Mobile"
            value={
              transaction.member
                ?.mobile_no ||
              "—"
            }
          />

          <InfoRow
            label="Wallet"
            value={
              transaction.member
                ?.wallet ||
              "—"
            }
            copy={
              Boolean(
                transaction.member
                  ?.wallet
              )
            }
          />
        </div>
      </section>


      {memberSummary && (
        <section
          className={
            styles.detailSection
          }
        >
          <SectionTitle
            title="Member Ledger Summary"
            subtitle="All transaction entries recorded for this member."
          />

          <div
            className={
              styles.memberSummaryGrid
            }
          >
            <MiniStat
              label="Transactions"
              value={Number(
                memberSummary
                  .totalTransactions ||
                  0
              ).toLocaleString()}
            />

            <MiniStat
              label="Credits"
              value={`$${formatMoney(
                memberSummary
                  .totalCredits
              )}`}
            />

            <MiniStat
              label="Debits"
              value={`$${formatMoney(
                memberSummary
                  .totalDebits
              )}`}
            />

            <MiniStat
              label="Net Ledger"
              value={`$${formatMoney(
                memberSummary
                  .netLedger
              )}`}
            />
          </div>
        </section>
      )}
    </>
  );
};


// ======================================================
// SMALL COMPONENTS
// ======================================================

const IncomeBox = ({
  label,
  direction,
  amount,
}) => (
  <div
    className={
      styles.incomeBox
    }
  >
    <div>
      <span>
        {label}
      </span>

      <small>
        Direction{" "}
        {direction}
      </small>
    </div>

    <strong>
      $
      {formatMoney(
        amount
      )}
    </strong>
  </div>
);


const TypeBadge = ({
  type,
  direction,
}) => {
  const normalized =
    String(
      type || "Other"
    ).toLowerCase();

  const className =
    normalized === "direct"
      ? styles.directBadge
      : normalized === "rank"
      ? styles.rankBadge
      : normalized === "salary"
      ? styles.salaryBadge
      : normalized === "reward"
      ? styles.rewardBadge
      : styles.otherBadge;


  return (
    <span
      className={
        className
      }
    >
      {type || "Other"}

      <small>
        {direction}
      </small>
    </span>
  );
};


const FilterField = ({
  label,
  children,
}) => (
  <div
    className={
      styles.filterField
    }
  >
    <label>
      {label}
    </label>

    {children}
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


const AmountBox = ({
  label,
  value,
  type,
  absolute = false,
}) => {
  const amount =
    Number(value || 0);

  const display =
    absolute
      ? Math.abs(amount)
      : amount;


  return (
    <div
      className={
        styles.amountBox
      }
    >
      <span>
        {label}
      </span>

      <strong
        className={
          type === "credit"
            ? styles.amountCredit
            : styles.amountDebit
        }
      >
        {type === "credit"
          ? "+"
          : "-"}
        $
        {formatMoney(
          display
        )}
      </strong>
    </div>
  );
};


const InfoRow = ({
  label,
  value,
  copy = false,
}) => (
  <div
    className={
      styles.infoRow
    }
  >
    <span>
      {label}
    </span>

    <div>
      <strong>
        {value}
      </strong>

      {copy &&
        value &&
        value !== "—" && (
          <button
            type="button"
            onClick={() =>
              copyText(value)
            }
          >
            <Copy
              size={12}
            />

            Copy
          </button>
        )}
    </div>
  </div>
);


const MiniStat = ({
  label,
  value,
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
      {value}
    </strong>
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

    Loading transactions...
  </div>
);


export default AdminTransactions;