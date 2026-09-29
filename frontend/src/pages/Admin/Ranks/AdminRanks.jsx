import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Award,
  ChevronRight,
  CircleDollarSign,
  Crown,
  Network,
  RefreshCw,
  Search,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import AdminLayout from "../../../components/admin/layout/AdminLayout";
import adminApi from "../../../services/adminApi";

import styles from "./AdminRanks.module.css";


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
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
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


const rankLabel = (rank) => {
  const value = Number(rank || 0);

  if (value < 1 || value > 12) {
    return "Unranked";
  }

  return `E-${String(value).padStart(
    2,
    "0"
  )}`;
};


// ======================================================
// ADMIN RANKS
// ======================================================

const AdminRanks = () => {
  const navigate = useNavigate();


  // ====================================================
  // DATA
  // ====================================================

  const [members, setMembers] =
    useState([]);

  const [distribution, setDistribution] =
    useState([]);

  const [summary, setSummary] =
    useState(null);

  const [pagination, setPagination] =
    useState({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });


  // ====================================================
  // FILTERS
  // ====================================================

  const [searchInput, setSearchInput] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [rank, setRank] =
    useState("");

  const [activation, setActivation] =
    useState("");

  const [status, setStatus] =
    useState("");

  const [sort, setSort] =
    useState("rank_desc");


  // ====================================================
  // UI STATE
  // ====================================================

  const [loading, setLoading] =
    useState(true);

  const [
    distributionLoading,
    setDistributionLoading,
  ] = useState(true);

  const [error, setError] =
    useState("");

  const [
    selectedMemberId,
    setSelectedMemberId,
  ] = useState(null);

  const [
    rankDetails,
    setRankDetails,
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
  // LOAD DISTRIBUTION
  // ====================================================

  const loadDistribution =
    useCallback(async () => {
      try {
        setDistributionLoading(
          true
        );

        const response =
          await adminApi.get(
            "/admin/ranks/distribution"
          );

        setSummary(
          response.data?.data
            ?.summary || null
        );

        setDistribution(
          response.data?.data
            ?.distribution || []
        );
      } catch (err) {
        console.error(
          "Rank distribution error:",
          err
        );

        if (
          handleAuthError(err)
        ) {
          return;
        }
      } finally {
        setDistributionLoading(
          false
        );
      }
    }, [handleAuthError]);


  // ====================================================
  // LOAD MEMBERS
  // ====================================================

  const loadMembers =
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

          if (rank !== "") {
            params.rank = rank;
          }

          if (activation) {
            params.activation =
              activation;
          }

          if (status) {
            params.status =
              status;
          }


          const response =
            await adminApi.get(
              "/admin/ranks",
              {
                params,
              }
            );


          setMembers(
            response.data?.data
              ?.members || []
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
            "Admin ranks error:",
            err
          );

          if (
            handleAuthError(err)
          ) {
            return;
          }

          setMembers([]);

          setError(
            err.response?.data
              ?.message ||
              "Unable to load rank members."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        search,
        rank,
        activation,
        status,
        sort,
        handleAuthError,
      ]
    );


  // ====================================================
  // INITIAL / FILTER LOAD
  // ====================================================

  useEffect(() => {
    loadDistribution();
  }, [loadDistribution]);


  useEffect(() => {
    loadMembers(1);
  }, [loadMembers]);


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


  // ====================================================
  // CLEAR FILTERS
  // ====================================================

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setRank("");
    setActivation("");
    setStatus("");
    setSort("rank_desc");
  };


  const hasFilters =
    Boolean(search) ||
    rank !== "" ||
    Boolean(activation) ||
    Boolean(status) ||
    sort !== "rank_desc";


  // ====================================================
  // SELECT RANK FROM DISTRIBUTION
  // ====================================================

  const selectRank = (
    rankNumber
  ) => {
    setRank(
      String(rankNumber)
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };


  // ====================================================
  // MEMBER DETAILS
  // ====================================================

  const openRankDetails =
    async (member) => {
      try {
        setSelectedMemberId(
          member.id
        );

        setRankDetails(null);

        setDetailsError("");

        setDetailsLoading(true);


        const response =
          await adminApi.get(
            `/admin/ranks/member/${member.id}`
          );


        setRankDetails(
          response.data?.data ||
            null
        );
      } catch (err) {
        console.error(
          "Rank details error:",
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
            "Unable to load rank details."
        );
      } finally {
        setDetailsLoading(
          false
        );
      }
    };


  const closeRankDetails =
    () => {
      setSelectedMemberId(
        null
      );

      setRankDetails(null);

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
            "Ranked Members",

          value:
            Number(
              summary?.rankedMembers ||
                0
            ).toLocaleString(),

          icon: Award,
        },

        {
          label:
            "Unranked Members",

          value:
            Number(
              summary?.unrankedMembers ||
                0
            ).toLocaleString(),

          icon: Users,
        },

        {
          label:
            "Highest Rank",

          value:
            summary?.highestRankLabel ||
            "Unranked",

          icon: Crown,
        },

        {
          label:
            "Total Rank Income",

          value: formatAmount(
            summary?.totalRankIncome
          ),

          icon:
            CircleDollarSign,
        },
      ],
      [summary]
    );


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
        {/* ==================================
            PAGE HEADER
        ================================== */}

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
              MANAGEMENT
            </div>

            <h1>
              Rank Management
            </h1>

            <p>
              Monitor member ranks,
              achievement history,
              network business and
              rank income.
            </p>
          </div>


          <button
            type="button"
            className={
              styles.refreshButton
            }
            onClick={() => {
              loadDistribution();

              loadMembers(
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


        {/* ==================================
            SUMMARY
        ================================== */}

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
                      {distributionLoading
                        ? "..."
                        : card.value}
                    </strong>
                  </div>
                </div>
              );
            }
          )}
        </div>


        {/* ==================================
            DISTRIBUTION
        ================================== */}

        <section
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.panelHeader
            }
          >
            <div>
              <h2>
                Rank Distribution
              </h2>

              <p>
                Select a rank to
                filter the member
                table.
              </p>
            </div>

            {rank !== "" && (
              <button
                type="button"
                className={
                  styles.clearRank
                }
                onClick={() =>
                  setRank("")
                }
              >
                <X size={13} />

                Clear rank
              </button>
            )}
          </div>


          <div
            className={
              styles.distributionGrid
            }
          >
            {distributionLoading ? (
              <div
                className={
                  styles.distributionLoading
                }
              >
                Loading rank
                distribution...
              </div>
            ) : (
              distribution.map(
                (item) => {
                  const active =
                    String(
                      item.rank
                    ) ===
                    String(rank);

                  return (
                    <button
                      type="button"
                      key={
                        item.rank
                      }
                      className={`${styles.rankCard} ${
                        active
                          ? styles.rankCardActive
                          : ""
                      }`}
                      onClick={() =>
                        selectRank(
                          item.rank
                        )
                      }
                    >
                      <div
                        className={
                          styles.rankCardIcon
                        }
                      >
                        {Number(
                          item.rank
                        ) === 0 ? (
                          <Users
                            size={
                              15
                            }
                          />
                        ) : (
                          <Trophy
                            size={
                              15
                            }
                          />
                        )}
                      </div>

                      <strong>
                        {item.rankLabel}
                      </strong>

                      <span>
                        {Number(
                          item.members ||
                            0
                        ).toLocaleString()}{" "}
                        members
                      </span>
                    </button>
                  );
                }
              )
            )}
          </div>
        </section>


        {/* ==================================
            FILTERS
        ================================== */}

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
                type="text"
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
                placeholder="Search member ID, name, email or mobile..."
              />

              <button
                type="submit"
              >
                Search
              </button>
            </form>


            <select
              value={rank}
              onChange={(
                event
              ) =>
                setRank(
                  event.target
                    .value
                )
              }
            >
              <option value="">
                All Ranks
              </option>

              <option value="0">
                Unranked
              </option>

              {Array.from(
                {
                  length: 12,
                },
                (_, index) =>
                  index + 1
              ).map(
                (rankNumber) => (
                  <option
                    key={
                      rankNumber
                    }
                    value={
                      rankNumber
                    }
                  >
                    {rankLabel(
                      rankNumber
                    )}
                  </option>
                )
              )}
            </select>


            <select
              value={
                activation
              }
              onChange={(
                event
              ) =>
                setActivation(
                  event.target
                    .value
                )
              }
            >
              <option value="">
                All Activation
              </option>

              <option value="activated">
                Activated
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>


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

              <option value="active">
                Active
              </option>

              <option value="blocked">
                Blocked
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
              <option value="rank_desc">
                Highest Rank
              </option>

              <option value="rank_asc">
                Lowest Rank
              </option>

              <option value="achieved_newest">
                Latest Achievement
              </option>

              <option value="newest">
                Newest Members
              </option>

              <option value="oldest">
                Oldest Members
              </option>

              <option value="package_desc">
                Highest Package
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
        </section>


        {/* ==================================
            MEMBER TABLE
        ================================== */}

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
                Rank Members
              </h2>

              <p>
                {Number(
                  pagination.total ||
                    0
                ).toLocaleString()}{" "}
                members found
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

              Loading rank
              members...
            </div>
          ) : members.length ===
            0 ? (
            <div
              className={
                styles.empty
              }
            >
              <Award
                size={28}
              />

              <strong>
                No members found
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
                      Member
                    </th>

                    <th>
                      Current Rank
                    </th>

                    <th>
                      Latest
                      Achievement
                    </th>

                    <th>
                      Package
                    </th>

                    <th>
                      Directs
                    </th>

                    <th>
                      Community
                    </th>

                    <th>
                      Business
                    </th>

                    <th>
                      Rank Income
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {members.map(
                    (member) => (
                      <tr
                        key={
                          member.id
                        }
                      >
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
                                .charAt(
                                  0
                                )
                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {member.name ||
                                  "Unnamed Member"}
                              </strong>

                              <span>
                                {
                                  member.user_id
                                }
                              </span>
                            </div>
                          </div>
                        </td>


                        <td>
                          <span
                            className={
                              Number(
                                member.rank
                              ) > 0
                                ? styles.rankBadge
                                : styles.unrankedBadge
                            }
                          >
                            {member.rankLabel ||
                              rankLabel(
                                member.rank
                              )}
                          </span>
                        </td>


                        <td>
                          {member.achievement ? (
                            <div
                              className={
                                styles.achievementCell
                              }
                            >
                              <strong>
                                {member
                                  .achievement
                                  .rank ||
                                  rankLabel(
                                    member
                                      .achievement
                                      .levelAchieved
                                  )}
                              </strong>

                              <span>
                                {formatDate(
                                  member
                                    .achievement
                                    .createdOn
                                )}
                              </span>
                            </div>
                          ) : (
                            <span
                              className={
                                styles.muted
                              }
                            >
                              —
                            </span>
                          )}
                        </td>


                        <td>
                          <div
                            className={
                              styles.moneyCell
                            }
                          >
                            {formatAmount(
                              member.package_amount
                            )}

                            <span
                              className={
                                member.activated
                                  ? styles.activeText
                                  : styles.muted
                              }
                            >
                              {member.activated
                                ? "Activated"
                                : "Inactive"}
                            </span>
                          </div>
                        </td>


                        <td>
                          {Number(
                            member.directCount ||
                              0
                          ).toLocaleString()}
                        </td>


                        <td>
                          {Number(
                            member.communitySize ||
                              0
                          ).toLocaleString()}
                        </td>


                        <td>
                          <strong
                            className={
                              styles.amount
                            }
                          >
                            {formatAmount(
                              member.communityBusiness
                            )}
                          </strong>
                        </td>


                        <td>
                          <strong
                            className={
                              styles.goldAmount
                            }
                          >
                            {formatAmount(
                              member.rankIncome
                            )}
                          </strong>
                        </td>


                        <td>
                          <button
                            type="button"
                            className={
                              styles.detailsButton
                            }
                            onClick={() =>
                              openRankDetails(
                                member
                              )
                            }
                          >
                            Details

                            <ChevronRight
                              size={
                                13
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


          {/* ==================================
              PAGINATION
          ================================== */}

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
                    loadMembers(
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
                    loadMembers(
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
          RANK DETAILS DRAWER
      ==================================== */}

      {selectedMemberId && (
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
              closeRankDetails();
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
                  RANK DETAILS
                </span>

                <h2>
                  {rankDetails
                    ?.member?.name ||
                    "Member Rank"}
                </h2>

                <p>
                  {rankDetails
                    ?.member
                    ?.user_id ||
                    ""}
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.closeButton
                }
                onClick={
                  closeRankDetails
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

                  Loading rank
                  details...
                </div>
              ) : detailsError ? (
                <div
                  className={
                    styles.error
                  }
                >
                  {detailsError}
                </div>
              ) : rankDetails ? (
                <>
                  <RankMemberOverview
                    data={
                      rankDetails
                    }
                  />

                  <AchievementHistory
                    achievements={
                      rankDetails.achievements ||
                      []
                    }
                  />

                  <LevelBreakdown
                    levels={
                      rankDetails.levels ||
                      []
                    }
                  />

                  <RankIncomeHistory
                    rows={
                      rankDetails.recentRankIncome ||
                      []
                    }
                  />
                </>
              ) : null}
            </div>


            {rankDetails?.member && (
              <div
                className={
                  styles.drawerFooter
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/admin/members/${rankDetails.member.id}`
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
                        rankDetails
                          .member
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
                        rankDetails
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
// MEMBER OVERVIEW
// ======================================================

const RankMemberOverview = ({
  data,
}) => {
  const member =
    data.member || {};

  const stats =
    data.statistics || {};

  return (
    <>
      <div
        className={
          styles.currentRankCard
        }
      >
        <div
          className={
            styles.currentRankIcon
          }
        >
          <Crown size={22} />
        </div>

        <div>
          <span>
            Current Rank
          </span>

          <strong>
            {data.currentRank
              ?.label ||
              member.rankLabel ||
              "Unranked"}
          </strong>
        </div>

        {data.latestAchievement && (
          <div
            className={
              styles.latestAchievement
            }
          >
            <span>
              Latest Achievement
            </span>

            <strong>
              {data.latestAchievement
                .rank ||
                rankLabel(
                  data
                    .latestAchievement
                    .levelAchieved
                )}
            </strong>

            <small>
              {formatDate(
                data
                  .latestAchievement
                  .createdOn
              )}
            </small>
          </div>
        )}
      </div>


      <div
        className={
          styles.detailStats
        }
      >
        <Stat
          label="Directs"
          value={
            stats.totalDirects
          }
        />

        <Stat
          label="Active Directs"
          value={
            stats.activatedDirects
          }
        />

        <Stat
          label="Community"
          value={
            stats.communitySize
          }
        />

        <Stat
          label="Active Community"
          value={
            stats.activatedCommunity
          }
        />

        <Stat
          label="Community Business"
          value={formatAmount(
            stats.communityBusiness
          )}
        />

        <Stat
          label="Rank Income"
          value={formatAmount(
            stats.totalRankIncome
          )}
        />
      </div>
    </>
  );
};


const Stat = ({
  label,
  value,
}) => (
  <div
    className={
      styles.detailStat
    }
  >
    <span>{label}</span>

    <strong>
      {value ?? 0}
    </strong>
  </div>
);


// ======================================================
// ACHIEVEMENT HISTORY
// ======================================================

const AchievementHistory = ({
  achievements,
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
          Achievement History
        </h3>

        <p>
          Recorded rank
          achievements for this
          member.
        </p>
      </div>

      <Award size={17} />
    </div>


    {achievements.length ===
    0 ? (
      <div
        className={
          styles.smallEmpty
        }
      >
        No rank achievement
        records.
      </div>
    ) : (
      <div
        className={
          styles.achievementList
        }
      >
        {achievements.map(
          (item) => (
            <div
              key={item.id}
              className={
                styles.achievementItem
              }
            >
              <div
                className={
                  styles.achievementRank
                }
              >
                <Trophy
                  size={15}
                />

                <strong>
                  {item.rank ||
                    rankLabel(
                      item.levelAchieved
                    )}
                </strong>
              </div>

              <div
                className={
                  styles.achievementMeta
                }
              >
                <div>
                  <span>
                    Level Amount
                  </span>

                  <strong>
                    {formatAmount(
                      item.levelAmount
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Reward
                  </span>

                  <strong>
                    {item.reward ||
                      "—"}
                  </strong>
                </div>

                <div>
                  <span>
                    Achieved
                  </span>

                  <strong>
                    {formatDate(
                      item.createdOn
                    )}
                  </strong>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    )}
  </section>
);


// ======================================================
// LEVEL BREAKDOWN
// ======================================================

const LevelBreakdown = ({
  levels,
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
          Network Business
        </h3>

        <p>
          Business recorded across
          network levels.
        </p>
      </div>

      <Network size={17} />
    </div>


    {levels.length === 0 ? (
      <div
        className={
          styles.smallEmpty
        }
      >
        No level business found.
      </div>
    ) : (
      <div
        className={
          styles.levelList
        }
      >
        {levels.map(
          (item) => (
            <div
              key={
                item.level
              }
              className={
                styles.levelRow
              }
            >
              <div>
                <strong>
                  Level{" "}
                  {item.level}
                </strong>

                <span>
                  {Number(
                    item.members ||
                      0
                  ).toLocaleString()}{" "}
                  members
                </span>
              </div>

              <strong
                className={
                  styles.goldAmount
                }
              >
                {formatAmount(
                  item.business
                )}
              </strong>
            </div>
          )
        )}
      </div>
    )}
  </section>
);


// ======================================================
// RANK INCOME HISTORY
// ======================================================

const RankIncomeHistory = ({
  rows,
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
          Recent Rank Income
        </h3>

        <p>
          Recent direction 5
          income transactions.
        </p>
      </div>

      <CircleDollarSign
        size={17}
      />
    </div>


    {rows.length === 0 ? (
      <div
        className={
          styles.smallEmpty
        }
      >
        No rank income
        transactions.
      </div>
    ) : (
      <div
        className={
          styles.incomeList
        }
      >
        {rows.map(
          (item) => (
            <div
              key={item.id}
              className={
                styles.incomeRow
              }
            >
              <div>
                <strong>
                  {item.description ||
                    "Rank Income"}
                </strong>

                <span>
                  {formatDate(
                    item.created_at
                  )}
                </span>
              </div>

              <strong
                className={
                  styles.incomeAmount
                }
              >
                +
                {formatAmount(
                  item.amount
                )}
              </strong>
            </div>
          )
        )}
      </div>
    )}
  </section>
);


export default AdminRanks;