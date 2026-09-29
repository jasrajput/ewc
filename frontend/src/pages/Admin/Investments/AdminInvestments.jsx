import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Coins,
  Eye,
  Network,
  Package,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import AdminLayout from "../../../components/admin/layout/AdminLayout";
import adminApi from "../../../services/adminApi";

import styles from "./AdminInvestments.module.css";


// ======================================================
// HELPERS
// ======================================================

const formatAmount = (value) => {
  const amount = Number(value || 0);

  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};


const formatTokenAmount = (value) => {
  const amount = Number(value || 0);

  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
};


const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};


const formatPercent = (value) => {
  return `${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}%`;
};


// ======================================================
// PAGE
// ======================================================

const AdminInvestments = () => {
  const navigate = useNavigate();

  // ====================================================
  // DATA
  // ====================================================

  const [summary, setSummary] =
    useState(null);

  const [investments, setInvestments] =
    useState([]);

  const [pagination, setPagination] =
    useState({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });

  const [rewardPolicy, setRewardPolicy] =
    useState(null);


  // ====================================================
  // FILTERS
  // ====================================================

  const [searchInput, setSearchInput] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [eligibility, setEligibility] =
    useState("");

  const [status, setStatus] =
    useState("");

  const [minAmount, setMinAmount] =
    useState("");

  const [maxAmount, setMaxAmount] =
    useState("");

  const [investedFrom, setInvestedFrom] =
    useState("");

  const [investedTo, setInvestedTo] =
    useState("");

  const [sort, setSort] =
    useState("newest");


  // ====================================================
  // UI
  // ====================================================

  const [loading, setLoading] =
    useState(true);

  const [summaryLoading, setSummaryLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [selectedMemberId, setSelectedMemberId] =
    useState(null);

  const [details, setDetails] =
    useState(null);

  const [detailsLoading, setDetailsLoading] =
    useState(false);

  const [detailsError, setDetailsError] =
    useState("");


  // ====================================================
  // AUTH
  // ====================================================

  const handleAuthError =
    useCallback(
      (err) => {
        const code =
          err?.response?.status;

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
    useCallback(async () => {
      try {
        setSummaryLoading(true);

        const response =
          await adminApi.get(
            "/admin/investments/summary"
          );

        setSummary(
          response.data?.data || null
        );

        if (
          response.data?.data
            ?.rewardPolicy
        ) {
          setRewardPolicy(
            response.data.data
              .rewardPolicy
          );
        }
      } catch (err) {
        console.error(
          "Investment summary error:",
          err
        );

        handleAuthError(err);
      } finally {
        setSummaryLoading(false);
      }
    }, [handleAuthError]);


  // ====================================================
  // INVESTMENTS
  // ====================================================

  const loadInvestments =
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
            params.search = search;
          }

          if (eligibility) {
            params.eligibility =
              eligibility;
          }

          if (status) {
            params.status =
              status;
          }

          if (minAmount !== "") {
            params.minAmount =
              minAmount;
          }

          if (maxAmount !== "") {
            params.maxAmount =
              maxAmount;
          }

          if (investedFrom) {
            params.investedFrom =
              investedFrom;
          }

          if (investedTo) {
            params.investedTo =
              investedTo;
          }


          const response =
            await adminApi.get(
              "/admin/investments",
              { params }
            );


          setInvestments(
            response.data?.data
              ?.investments || []
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


          if (
            response.data?.data
              ?.rewardPolicy
          ) {
            setRewardPolicy(
              response.data.data
                .rewardPolicy
            );
          }
        } catch (err) {
          console.error(
            "Admin investments error:",
            err
          );

          if (
            handleAuthError(err)
          ) {
            return;
          }

          setInvestments([]);

          setError(
            err.response?.data
              ?.message ||
              "Unable to load investments."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        search,
        eligibility,
        status,
        minAmount,
        maxAmount,
        investedFrom,
        investedTo,
        sort,
        handleAuthError,
      ]
    );


  useEffect(() => {
    loadSummary();
  }, [loadSummary]);


  useEffect(() => {
    loadInvestments(1);
  }, [loadInvestments]);


  // ====================================================
  // SEARCH / RESET
  // ====================================================

  const submitSearch = (event) => {
    event.preventDefault();

    setSearch(
      searchInput.trim()
    );
  };


  const clearFilters = () => {
    setSearchInput("");
    setSearch("");

    setEligibility("");
    setStatus("");

    setMinAmount("");
    setMaxAmount("");

    setInvestedFrom("");
    setInvestedTo("");

    setSort("newest");
  };


  const hasFilters =
    Boolean(search) ||
    Boolean(eligibility) ||
    Boolean(status) ||
    minAmount !== "" ||
    maxAmount !== "" ||
    Boolean(investedFrom) ||
    Boolean(investedTo) ||
    sort !== "newest";


  // ====================================================
  // DETAILS
  // ====================================================

  const openDetails =
    async (investment) => {
      const memberId =
        investment?.member?.id;

      if (!memberId) return;

      try {
        setSelectedMemberId(
          memberId
        );

        setDetails(null);
        setDetailsError("");
        setDetailsLoading(true);

        const response =
          await adminApi.get(
            `/admin/investments/member/${memberId}`
          );

        setDetails(
          response.data?.data ||
            null
        );
      } catch (err) {
        console.error(
          "Investment details error:",
          err
        );

        if (
          handleAuthError(err)
        ) {
          return;
        }

        setDetailsError(
          err.response?.data
            ?.message ||
            "Unable to load investment details."
        );
      } finally {
        setDetailsLoading(false);
      }
    };


  const closeDetails = () => {
    setSelectedMemberId(null);
    setDetails(null);
    setDetailsError("");
  };


  // ====================================================
  // SUMMARY CARDS
  // ====================================================

  const summaryCards =
    useMemo(
      () => [
        {
          label:
            "Total Invested",

          value: formatAmount(
            summary?.totalInvested
          ),

          icon:
            CircleDollarSign,
        },

        {
          label:
            "Investments",

          value: Number(
            summary?.totalInvestments ||
              0
          ).toLocaleString(),

          icon: Package,
        },

        {
          label:
            "Unique Investors",

          value: Number(
            summary?.uniqueInvestors ||
              0
          ).toLocaleString(),

          icon: Users,
        },

        {
          label:
            "Reward Eligible",

          value: Number(
            summary
              ?.rewardEligibleInvestments ||
              0
          ).toLocaleString(),

          subValue:
            `${formatAmount(
              summary
                ?.projectedMonthlyRewardUsd
            )}/month projected`,

          icon: Coins,
        },
      ],
      [summary]
    );


  return (
    <AdminLayout>
      <div className={styles.page}>

        {/* ==================================
            HEADER
        ================================== */}

        <div className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>
              MANAGEMENT
            </div>

            <h1>
              Investments
            </h1>

            <p>
              Monitor individual
              investment records,
              reward eligibility and
              projected monthly rewards.
            </p>
          </div>


          <button
            type="button"
            className={
              styles.refreshButton
            }
            onClick={() => {
              loadSummary();

              loadInvestments(
                pagination.page
              );
            }}
          >
            <RefreshCw size={15} />

            Refresh
          </button>
        </div>


        {/* ==================================
            SUMMARY
        ================================== */}

        <div className={styles.summaryGrid}>
          {summaryCards.map(
            (card) => {
              const Icon =
                card.icon;

              return (
                <div
                  className={
                    styles.summaryCard
                  }
                  key={card.label}
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
                    <span>
                      {card.label}
                    </span>

                    <strong>
                      {summaryLoading
                        ? "..."
                        : card.value}
                    </strong>

                    {card.subValue &&
                      !summaryLoading && (
                        <small>
                          {
                            card.subValue
                          }
                        </small>
                      )}
                  </div>
                </div>
              );
            }
          )}
        </div>


        {/* ==================================
            REWARD POLICY
        ================================== */}

        <section
          className={
            styles.rewardPolicy
          }
        >
          <div
            className={
              styles.rewardPolicyIcon
            }
          >
            <Clock3 size={19} />
          </div>

          <div>
            <strong>
              Monthly Reward Policy
            </strong>

            <p>
              Rewards begin from{" "}
              <b>
                day{" "}
                {rewardPolicy
                  ?.startsFromDay ||
                  101}
              </b>
              . The projected monthly
              reward is{" "}
              <b>
                {rewardPolicy
                  ?.monthlyPercent ||
                  2}
                %
              </b>{" "}
              of the original dollar
              investment value.
            </p>
          </div>

          <div
            className={
              styles.policyExample
            }
          >
            <span>
              $1,000 investment
            </span>

            <strong>
              $20 / month
            </strong>

            <small>
              worth of EWC
            </small>
          </div>
        </section>


        {/* ==================================
            SECONDARY STATS
        ================================== */}

        <div
          className={
            styles.secondaryStats
          }
        >
          <div>
            <span>
              Today's Investment
            </span>

            <strong>
              {summaryLoading
                ? "..."
                : formatAmount(
                    summary?.todayInvested
                  )}
            </strong>
          </div>

          <div>
            <span>
              Today's Investments
            </span>

            <strong>
              {summaryLoading
                ? "..."
                : Number(
                    summary
                      ?.todayInvestments ||
                      0
                  ).toLocaleString()}
            </strong>
          </div>

          <div>
            <span>
              Average Investment
            </span>

            <strong>
              {summaryLoading
                ? "..."
                : formatAmount(
                    summary
                      ?.averageInvestment
                  )}
            </strong>
          </div>

          <div>
            <span>
              Highest Investment
            </span>

            <strong>
              {summaryLoading
                ? "..."
                : formatAmount(
                    summary
                      ?.highestInvestment
                  )}
            </strong>
          </div>

          <div>
            <span>
              Eligible Principal
            </span>

            <strong>
              {summaryLoading
                ? "..."
                : formatAmount(
                    summary
                      ?.rewardEligiblePrincipal
                  )}
            </strong>
          </div>
        </div>


        {/* ==================================
            FILTERS
        ================================== */}

        <section
          className={styles.panel}
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
              <Search size={15} />

              <input
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(
                    event.target.value
                  )
                }
                placeholder="Search member ID, name, email, mobile or sponsor..."
              />

              <button type="submit">
                Search
              </button>
            </form>


            <select
              value={eligibility}
              onChange={(event) =>
                setEligibility(
                  event.target.value
                )
              }
            >
              <option value="">
                All Reward Status
              </option>

              <option value="eligible">
                Reward Eligible
              </option>

              <option value="waiting">
                Waiting Period
              </option>
            </select>


            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value
                )
              }
            >
              <option value="">
                All Accounts
              </option>

              <option value="active">
                Active
              </option>

              <option value="blocked">
                Blocked
              </option>
            </select>


            <select
              value={sort}
              onChange={(event) =>
                setSort(
                  event.target.value
                )
              }
            >
              <option value="newest">
                Newest Investment
              </option>

              <option value="oldest">
                Oldest Investment
              </option>

              <option value="amount_desc">
                Highest Amount
              </option>

              <option value="amount_asc">
                Lowest Amount
              </option>

              <option value="reward_start">
                Reward Start Date
              </option>

              <option value="roi_desc">
                Highest ROI
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
            <FilterInput
              label="Min Investment"
              type="number"
              value={minAmount}
              placeholder="0"
              onChange={
                setMinAmount
              }
            />

            <FilterInput
              label="Max Investment"
              type="number"
              value={maxAmount}
              placeholder="Any"
              onChange={
                setMaxAmount
              }
            />

            <FilterInput
              label="Invested From"
              type="date"
              value={investedFrom}
              onChange={
                setInvestedFrom
              }
            />

            <FilterInput
              label="Invested To"
              type="date"
              value={investedTo}
              onChange={
                setInvestedTo
              }
            />
          </div>
        </section>


        {/* ==================================
            TABLE
        ================================== */}

        <section
          className={styles.panel}
        >
          <div
            className={
              styles.tableHeader
            }
          >
            <div>
              <h2>
                Investment Records
              </h2>

              <p>
                {Number(
                  pagination.total || 0
                ).toLocaleString()}{" "}
                investment records found
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
            <LoadingState text="Loading investments..." />
          ) : investments.length ===
            0 ? (
            <div
              className={
                styles.empty
              }
            >
              <Package size={29} />

              <strong>
                No investments found
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
                    <th>Member</th>
                    <th>Investment</th>
                    <th>Invested On</th>
                    <th>Age</th>
                    <th>Reward Start</th>
                    <th>
                      Reward Status
                    </th>
                    <th>
                      Monthly Reward
                    </th>
                    <th>ROI</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {investments.map(
                    (investment) => (
                      <InvestmentRow
                        key={
                          investment.id
                        }
                        investment={
                          investment
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
                    loadInvestments(
                      pagination.page -
                        1
                    )
                  }
                >
                  Previous
                </button>

                <span>
                  Page{" "}
                  {pagination.page} of{" "}
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
                    loadInvestments(
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


      {/* ====================================
          MEMBER INVESTMENT DRAWER
      ==================================== */}

      {selectedMemberId && (
        <div
          className={
            styles.drawerOverlay
          }
          onMouseDown={(event) => {
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
                  INVESTMENT DETAILS
                </span>

                <h2>
                  {details?.member?.name ||
                    "Member Investments"}
                </h2>

                <p>
                  {details?.member
                    ?.user_id || ""}
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
                <X size={18} />
              </button>
            </div>


            <div
              className={
                styles.drawerBody
              }
            >
              {detailsLoading ? (
                <LoadingState text="Loading investment history..." />
              ) : detailsError ? (
                <div
                  className={
                    styles.error
                  }
                >
                  {detailsError}
                </div>
              ) : details ? (
                <MemberInvestmentDetails
                  data={details}
                />
              ) : null}
            </div>


            {details?.member && (
              <div
                className={
                  styles.drawerFooter
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/admin/members/${details.member.id}`
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
                      `/admin/network?member=${encodeURIComponent(
                        details.member
                          .user_id
                      )}`
                    )
                  }
                >
                  <Network
                    size={14}
                  />

                  Network
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/admin/earnings?member=${encodeURIComponent(
                        details.member
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

const InvestmentRow = ({
  investment,
  onDetails,
  navigate,
}) => {
  const member =
    investment.member || {};

  const reward =
    investment.reward || {};

  return (
    <tr>
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
                "Unnamed Member"}
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
            investment.packAmount
          )}
        </strong>
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

          {formatDate(
            investment.createdOn
          )}
        </div>
      </td>


      <td>
        <div
          className={
            styles.ageCell
          }
        >
          <strong>
            {Number(
              reward.ageDays || 0
            )}
          </strong>

          <span>days</span>
        </div>
      </td>


      <td>
        {formatDate(
          reward.rewardStartDate
        )}
      </td>


      <td>
        <span
          className={
            reward.eligible
              ? styles.eligibleBadge
              : styles.waitingBadge
          }
        >
          {reward.eligible
            ? "Eligible"
            : "Waiting"}
        </span>
      </td>


      <td>
        <div
          className={
            styles.rewardCell
          }
        >
          <strong>
            {formatAmount(
              reward.monthlyRewardUsd
            )}
          </strong>

          <span>
            {Number(
              reward.monthlyPercent ||
                2
            )}
            % monthly
          </span>
        </div>
      </td>


      <td>
        <div
          className={
            styles.roiCell
          }
        >
          <strong>
            {formatPercent(
              investment.roiPer
            )}
          </strong>

          {investment.lastRoiDate && (
            <span>
              Last{" "}
              {formatDate(
                investment.lastRoiDate
              )}
            </span>
          )}
        </div>
      </td>


      <td>
        <div
          className={
            styles.actions
          }
        >
          <button
            type="button"
            title="Investment Details"
            onClick={() =>
              onDetails(
                investment
              )
            }
          >
            <Eye size={14} />
          </button>

          <button
            type="button"
            title="Member Details"
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

          <button
            type="button"
            title="Network"
            onClick={() =>
              navigate(
                `/admin/network?member=${encodeURIComponent(
                  member.user_id
                )}`
              )
            }
          >
            <Network
              size={14}
            />
          </button>
        </div>
      </td>
    </tr>
  );
};


// ======================================================
// MEMBER DETAILS
// ======================================================

const MemberInvestmentDetails = ({
  data,
}) => {
  const member =
    data.member || {};

  const summary =
    data.summary || {};

  const investments =
    data.investments || [];

  const policy =
    data.rewardPolicy || {};


  return (
    <>
      {/* SUMMARY */}

      <div
        className={
          styles.memberSummary
        }
      >
        <SummaryMini
          label="Total Invested"
          value={formatAmount(
            summary.totalInvested
          )}
        />

        <SummaryMini
          label="Investments"
          value={Number(
            summary.investmentCount ||
              0
          ).toLocaleString()}
        />

        <SummaryMini
          label="Reward Eligible"
          value={Number(
            summary.eligibleInvestments ||
              0
          ).toLocaleString()}
        />

        <SummaryMini
          label="Projected / Month"
          value={formatAmount(
            summary.projectedMonthlyRewardUsd
          )}
          gold
        />
      </div>


      {/* MEMBER */}

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
              Member
            </h3>

            <p>
              Account information for
              this investor.
            </p>
          </div>

          <UserRound size={17} />
        </div>

        <div
          className={
            styles.infoGrid
          }
        >
          <Info
            label="Member ID"
            value={
              member.user_id || "—"
            }
          />

          <Info
            label="Rank"
            value={
              member.rankLabel ||
              "Unranked"
            }
          />

          <Info
            label="Sponsor"
            value={
              member.sponsor
                ?.user_id || "—"
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
      </section>


      {/* POLICY */}

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
              Reward Policy
            </h3>

            <p>
              Projection used by the
              admin monitor.
            </p>
          </div>

          <Coins size={17} />
        </div>

        <div
          className={
            styles.policyDetails
          }
        >
          <Info
            label="Waiting Period"
            value={`${Number(
              policy.waitDays || 100
            )} days`}
          />

          <Info
            label="Reward Starts"
            value={`Day ${
              policy.startsFromDay ||
              101
            }`}
          />

          <Info
            label="Monthly Rate"
            value={`${Number(
              policy.monthlyPercent ||
                2
            )}%`}
          />

          <Info
            label="Basis"
            value={
              policy.basis ||
              "Original USD investment value"
            }
          />
        </div>
      </section>


      {/* INVESTMENT HISTORY */}

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
              Investment History
            </h3>

            <p>
              All select_packages
              records for this member.
            </p>
          </div>

          <Package size={17} />
        </div>


        {investments.length ===
        0 ? (
          <div
            className={
              styles.smallEmpty
            }
          >
            No investment records
            found.
          </div>
        ) : (
          <div
            className={
              styles.investmentHistory
            }
          >
            {investments.map(
              (investment) => (
                <InvestmentHistoryCard
                  key={
                    investment.id
                  }
                  investment={
                    investment
                  }
                />
              )
            )}
          </div>
        )}
      </section>
    </>
  );
};


// ======================================================
// HISTORY CARD
// ======================================================

const InvestmentHistoryCard = ({
  investment,
}) => {
  const reward =
    investment.reward || {};

  return (
    <div
      className={
        styles.historyCard
      }
    >
      <div
        className={
          styles.historyTop
        }
      >
        <div>
          <span>
            Investment #
            {investment.id}
          </span>

          <strong>
            {formatAmount(
              investment.packAmount
            )}
          </strong>
        </div>

        <span
          className={
            reward.eligible
              ? styles.eligibleBadge
              : styles.waitingBadge
          }
        >
          {reward.eligible
            ? "Reward Eligible"
            : "Waiting"}
        </span>
      </div>


      <div
        className={
          styles.historyGrid
        }
      >
        <Info
          label="Invested On"
          value={formatDate(
            investment.createdOn
          )}
        />

        <Info
          label="Investment Age"
          value={`${Number(
            reward.ageDays || 0
          )} days`}
        />

        <Info
          label="Reward Starts"
          value={formatDate(
            reward.rewardStartDate
          )}
        />

        <Info
          label="Projected / Month"
          value={formatAmount(
            reward.monthlyRewardUsd
          )}
        />

        <Info
          label="ROI %"
          value={formatPercent(
            investment.roiPer
          )}
        />

        <Info
          label="ROI Comp"
          value={formatAmount(
            investment.roiComp
          )}
        />

        <Info
          label="Last ROI"
          value={formatDate(
            investment.lastRoiDate
          )}
        />

        <Info
          label="Token Amount"
          value={`${formatTokenAmount(
            investment.tokenAmount
          )} EWC`}
        />
      </div>


      {Number(
        investment.currentPrice ||
          0
      ) > 0 && (
        <div
          className={
            styles.priceNote
          }
        >
          Recorded investment price:{" "}
          <strong>
            {formatAmount(
              investment.currentPrice
            )}
          </strong>
        </div>
      )}
    </div>
  );
};


// ======================================================
// SMALL COMPONENTS
// ======================================================

const FilterInput = ({
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
    <label>{label}</label>

    <input
      type={type}
      min={
        type === "number"
          ? "0"
          : undefined
      }
      value={value}
      placeholder={placeholder}
      onChange={(event) =>
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
}) => (
  <div
    className={
      styles.infoItem
    }
  >
    <span>{label}</span>

    <strong>
      {value}
    </strong>
  </div>
);


const SummaryMini = ({
  label,
  value,
  gold = false,
}) => (
  <div
    className={
      styles.summaryMini
    }
  >
    <span>{label}</span>

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


export default AdminInvestments;