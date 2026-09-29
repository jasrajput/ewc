import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  ArrowDownLeft,
  Award,
  Coins,
  DollarSign,
  RefreshCw,
  Trophy,
  Users,
} from "lucide-react";

import AdminLayout from "../../../components/admin/layout/AdminLayout";

import AdminPageHeader from "../../../components/admin/ui/AdminPageHeader";
import AdminButton from "../../../components/admin/ui/AdminButton";
import AdminSearch from "../../../components/admin/ui/AdminSearch";
import AdminSelect from "../../../components/admin/ui/AdminSelect";
import AdminDateRange from "../../../components/admin/ui/AdminDateRange";
import AdminTable from "../../../components/admin/ui/AdminTable";
import AdminPagination from "../../../components/admin/ui/AdminPagination";
import AdminStatusBadge from "../../../components/admin/ui/AdminStatusBadge";
import AdminLoader from "../../../components/admin/ui/AdminLoader";
import AdminEmptyState from "../../../components/admin/ui/AdminEmptyState";

import adminApi from "../../../services/adminApi";

import styles from "./AdminEarnings.module.css";


// ==========================================
// FILTER OPTIONS
// ==========================================

const TYPE_OPTIONS = [
  {
    value: "",
    label: "All Earnings",
  },
  {
    value: "1",
    label: "Direct Income",
  },
  {
    value: "5",
    label: "Rank Income",
  },
  {
    value: "6",
    label: "Salary Income",
  },
  {
    value: "7",
    label: "Reward Income",
  },
];


const SORT_OPTIONS = [
  {
    value: "newest",
    label: "Newest First",
  },
  {
    value: "oldest",
    label: "Oldest First",
  },
  {
    value: "amount_high",
    label: "Highest Amount",
  },
  {
    value: "amount_low",
    label: "Lowest Amount",
  },
];


const DIRECTION_LABELS = {
  1: "Direct Income",
  5: "Rank Income",
  6: "Salary Income",
  7: "Reward Income",
};


// ==========================================
// HELPERS
// ==========================================

const formatAmount = (value) => {
  const amount = Number(value || 0);

  return `$${amount.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 5,
    }
  )}`;
};


const formatDate = (value) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};


const AdminEarnings = () => {
  const navigate = useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();


  // ==========================================
  // MEMBER FROM URL
  //
  // /admin/earnings?member=jas1
  // ==========================================

  const memberFilter =
    searchParams.get("member") || "";


  // ==========================================
  // STATE
  // ==========================================

  const [earnings, setEarnings] =
    useState([]);

  const [summary, setSummary] =
    useState({
      totalIncome: 0,
      directIncome: 0,
      rankIncome: 0,
      salaryIncome: 0,
      rewardIncome: 0,
      totalEntries: 0,
      earningMembers: 0,
    });

  const [pagination, setPagination] =
    useState({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [direction, setDirection] =
    useState(
      searchParams.get("direction") ||
        ""
    );

  const [sort, setSort] =
    useState("newest");

  const [from, setFrom] =
    useState("");

  const [to, setTo] =
    useState("");

  const [page, setPage] =
    useState(1);


  // ==========================================
  // SEARCH DEBOUNCE
  // ==========================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(
        search.trim()
      );

      setPage(1);
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [search]);


  // ==========================================
  // LOAD EARNINGS
  // ==========================================

  const loadEarnings =
    useCallback(async () => {
      try {
        setLoading(true);
        setError("");

        const params = {
          page,
          limit: 20,
          sort,
        };

        if (debouncedSearch) {
          params.search =
            debouncedSearch;
        }

        if (memberFilter) {
          params.member =
            memberFilter;
        }

        if (direction) {
          params.direction =
            direction;
        }

        if (from) {
          params.from = from;
        }

        if (to) {
          params.to = to;
        }

        const response =
          await adminApi.get(
            "/admin/earnings",
            {
              params,
            }
          );

        const result =
          response.data?.data || {};

        setEarnings(
          Array.isArray(
            result.earnings
          )
            ? result.earnings
            : []
        );

        setSummary({
          totalIncome: Number(
            result.summary
              ?.totalIncome || 0
          ),

          directIncome: Number(
            result.summary
              ?.directIncome || 0
          ),

          rankIncome: Number(
            result.summary
              ?.rankIncome || 0
          ),

          salaryIncome: Number(
            result.summary
              ?.salaryIncome || 0
          ),

          rewardIncome: Number(
            result.summary
              ?.rewardIncome || 0
          ),

          totalEntries: Number(
            result.summary
              ?.totalEntries || 0
          ),

          earningMembers: Number(
            result.summary
              ?.earningMembers || 0
          ),
        });

        setPagination({
          page: Number(
            result.pagination?.page ||
              1
          ),

          limit: Number(
            result.pagination?.limit ||
              20
          ),

          total: Number(
            result.pagination?.total ||
              0
          ),

          totalPages: Number(
            result.pagination
              ?.totalPages || 1
          ),
        });
      } catch (err) {
        console.error(
          "Admin earnings error:",
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
            {
              replace: true,
            }
          );

          return;
        }

        setError(
          err.response?.data?.message ||
            "Unable to load earnings."
        );
      } finally {
        setLoading(false);
      }
    }, [
      debouncedSearch,
      direction,
      from,
      memberFilter,
      navigate,
      page,
      sort,
      to,
    ]);


  useEffect(() => {
    loadEarnings();
  }, [loadEarnings]);


  // ==========================================
  // FILTER HANDLERS
  // ==========================================

  const handleDirectionChange = (
    event
  ) => {
    const value =
      event.target?.value ??
      event ??
      "";

    setDirection(
      String(value)
    );

    setPage(1);
  };


  const handleSortChange = (
    event
  ) => {
    const value =
      event.target?.value ??
      event ??
      "newest";

    setSort(
      String(value)
    );

    setPage(1);
  };


  const handleDateChange = (
    first,
    second
  ) => {
    if (
      first &&
      typeof first === "object"
    ) {
      setFrom(
        first.from || ""
      );

      setTo(
        first.to || ""
      );
    } else {
      setFrom(first || "");
      setTo(second || "");
    }

    setPage(1);
  };


  // ==========================================
  // REMOVE MEMBER FILTER
  // ==========================================

  const clearMemberFilter = () => {
    const params =
      new URLSearchParams(
        searchParams
      );

    params.delete("member");

    setSearchParams(params);

    setPage(1);
  };


  // ==========================================
  // CLEAR ALL FILTERS
  // ==========================================

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");

    setDirection("");
    setSort("newest");

    setFrom("");
    setTo("");

    setPage(1);

    const params =
      new URLSearchParams(
        searchParams
      );

    params.delete("member");
    params.delete("direction");

    setSearchParams(params);
  };


  // ==========================================
  // TABLE COLUMNS
  // ==========================================

  const columns = useMemo(
    () => [
      {
        key: "member",
        label: "Member",

        render: (row) => (
          <button
            type="button"
            className={
              styles.memberCell
            }
            onClick={() =>
              navigate(
                `/admin/members/${row.member.id}`
              )
            }
          >
            <span
              className={
                styles.avatar
              }
            >
              {(
                row.member.name ||
                row.member.user_id ||
                "M"
              )
                .charAt(0)
                .toUpperCase()}
            </span>

            <span
              className={
                styles.memberInfo
              }
            >
              <strong>
                {row.member.name ||
                  "Unnamed Member"}
              </strong>

              <small>
                {row.member.email ||
                  "No email"}
              </small>
            </span>
          </button>
        ),
      },

      {
        key: "user_id",
        label: "User ID",

        render: (row) => (
          <span
            className={
              styles.userId
            }
          >
            {row.member.user_id ||
              "—"}
          </span>
        ),
      },

      {
        key: "rank",
        label: "Rank",

        render: (row) => (
          <span
            className={
              styles.rank
            }
          >
            {row.member.rank ||
              "Unranked"}
          </span>
        ),
      },

      {
        key: "type",
        label: "Income Type",

        render: (row) => (
          <AdminStatusBadge
            label={
              DIRECTION_LABELS[
                row.direction
              ] ||
              row.type ||
              "Income"
            }
            status={`earning-${row.direction}`}
          />
        ),
      },

      {
        key: "amount",
        label: "Amount",

        render: (row) => (
          <strong
            className={
              styles.amount
            }
          >
            {formatAmount(
              row.amount
            )}
          </strong>
        ),
      },

      {
        key: "description",
        label: "Description",

        render: (row) => (
          <span
            className={
              styles.description
            }
            title={
              row.description || ""
            }
          >
            {row.description ||
              "—"}
          </span>
        ),
      },

      {
        key: "created_at",
        label: "Date",

        render: (row) => (
          <span
            className={
              styles.date
            }
          >
            {formatDate(
              row.created_at
            )}
          </span>
        ),
      },
    ],
    [navigate]
  );


  return (
    <AdminLayout>
      <div
        className={styles.page}
      >
        <AdminPageHeader
          eyebrow="FINANCE"
          title="Earnings"
          description="Monitor member earnings across direct, rank, salary and reward income."
          icon={Coins}
          actions={
            <AdminButton
              variant="secondary"
              onClick={
                loadEarnings
              }
            >
              <RefreshCw
                size={15}
              />
              Refresh
            </AdminButton>
          }
        />


        {/* ===================================
            MEMBER FILTER
        =================================== */}

        {memberFilter && (
          <div
            className={
              styles.memberFilterBanner
            }
          >
            <div>
              <Users size={17} />

              <span>
                Showing earnings
                for member
              </span>

              <strong>
                {memberFilter}
              </strong>
            </div>

            <button
              type="button"
              onClick={
                clearMemberFilter
              }
            >
              Show All Earnings
            </button>
          </div>
        )}


        {/* ===================================
            SUMMARY
        =================================== */}

        <div
          className={
            styles.summaryGrid
          }
        >
          <SummaryCard
            icon={DollarSign}
            label="Total Earnings"
            value={formatAmount(
              summary.totalIncome
            )}
            meta={`${summary.totalEntries.toLocaleString()} earning entries`}
            featured
          />

          <SummaryCard
            icon={Users}
            label="Direct Income"
            value={formatAmount(
              summary.directIncome
            )}
            meta="Direction 1"
          />

          <SummaryCard
            icon={Trophy}
            label="Rank Income"
            value={formatAmount(
              summary.rankIncome
            )}
            meta="Direction 5"
          />

          <SummaryCard
            icon={Coins}
            label="Salary Income"
            value={formatAmount(
              summary.salaryIncome
            )}
            meta="Direction 6"
          />

          <SummaryCard
            icon={Award}
            label="Reward Income"
            value={formatAmount(
              summary.rewardIncome
            )}
            meta="Direction 7"
          />
        </div>


        {/* ===================================
            EXTRA SUMMARY
        =================================== */}

        <div
          className={
            styles.overviewStrip
          }
        >
          <div>
            <span>
              Earning Members
            </span>

            <strong>
              {summary.earningMembers.toLocaleString()}
            </strong>
          </div>

          <div>
            <span>
              Transactions
            </span>

            <strong>
              {summary.totalEntries.toLocaleString()}
            </strong>
          </div>

          <div>
            <span>
              Current View
            </span>

            <strong>
              {direction
                ? DIRECTION_LABELS[
                    Number(
                      direction
                    )
                  ]
                : "All Earnings"}
            </strong>
          </div>
        </div>


        {/* ===================================
            FILTERS
        =================================== */}

        <div
          className={
            styles.filterPanel
          }
        >
          <div
            className={
              styles.searchArea
            }
          >
            <AdminSearch
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target
                    ?.value ??
                    event ??
                    ""
                )
              }
              placeholder="Search member, email or description..."
            />
          </div>

          <div
            className={
              styles.typeFilter
            }
          >
            <AdminSelect
              value={direction}
              onChange={
                handleDirectionChange
              }
              options={
                TYPE_OPTIONS
              }
            />
          </div>

          <div
            className={
              styles.sortFilter
            }
          >
            <AdminSelect
              value={sort}
              onChange={
                handleSortChange
              }
              options={
                SORT_OPTIONS
              }
            />
          </div>

          <div
            className={
              styles.dateFilter
            }
          >
            <AdminDateRange
              from={from}
              to={to}
              onChange={
                handleDateChange
              }
            />
          </div>

          <AdminButton
            variant="secondary"
            onClick={
              clearFilters
            }
          >
            Clear
          </AdminButton>
        </div>


        {/* ===================================
            ERROR
        =================================== */}

        {error && (
          <div
            className={
              styles.errorBox
            }
          >
            {error}
          </div>
        )}


        {/* ===================================
            TABLE
        =================================== */}

        <div
          className={
            styles.tablePanel
          }
        >
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <h3>
                Earnings History
              </h3>

              <p>
                Member income
                transactions recorded
                by the EWC platform.
              </p>
            </div>

            <span
              className={
                styles.recordCount
              }
            >
              {pagination.total.toLocaleString()}{" "}
              records
            </span>
          </div>


          {loading ? (
            <div
              className={
                styles.stateContainer
              }
            >
              <AdminLoader />
            </div>
          ) : earnings.length ===
            0 ? (
            <div
              className={
                styles.stateContainer
              }
            >
              <AdminEmptyState
                title="No earnings found"
                description="No earning transactions match the selected filters."
              />
            </div>
          ) : (
            <>
              <AdminTable
                columns={
                  columns
                }
                data={earnings}
              />

              <div
                className={
                  styles.pagination
                }
              >
                <AdminPagination
                  page={
                    pagination.page
                  }
                  totalPages={
                    pagination.totalPages
                  }
                  total={
                    pagination.total
                  }
                  onPageChange={
                    setPage
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};


// ==========================================
// SUMMARY CARD
// ==========================================

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  meta,
  featured = false,
}) => {
  return (
    <div
      className={`${styles.summaryCard} ${
        featured
          ? styles.featuredCard
          : ""
      }`}
    >
      <div
        className={
          styles.summaryIcon
        }
      >
        <Icon size={18} />
      </div>

      <div
        className={
          styles.summaryContent
        }
      >
        <span>{label}</span>

        <strong>{value}</strong>

        <small>{meta}</small>
      </div>
    </div>
  );
};


export default AdminEarnings;