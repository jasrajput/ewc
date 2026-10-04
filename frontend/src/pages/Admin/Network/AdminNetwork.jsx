import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate, useSearchParams } from "react-router-dom";

import {
  Activity,
  ArrowRight,
  ChevronRight,
  CircleDollarSign,
  GitBranch,
  Network,
  RefreshCw,
  Search,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";

import AdminLayout from "../../../components/admin/layout/AdminLayout";

import AdminButton from "../../../components/admin/ui/AdminButton";
import AdminEmptyState from "../../../components/admin/ui/AdminEmptyState";
import AdminLoader from "../../../components/admin/ui/AdminLoader";
import AdminPageHeader from "../../../components/admin/ui/AdminPageHeader";
import AdminPagination from "../../../components/admin/ui/AdminPagination";
import AdminSearch from "../../../components/admin/ui/AdminSearch";
import AdminTable from "../../../components/admin/ui/AdminTable";
import AdminNetworkTree from "./AdminNetworkTree";

import adminApi from "../../../services/adminApi";

import styles from "./AdminNetwork.module.css";

// ==========================================
// HELPERS
// ==========================================

const formatAmount = (value) => {
  const amount = Number(value || 0);

  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

const getInitial = (member) => {
  return (member?.name || member?.user_id || "M").charAt(0).toUpperCase();
};

// ==========================================
// PAGE
// ==========================================

const AdminNetwork = () => {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  // ==========================================
  // ROOT MEMBER
  // ==========================================

  const memberFromUrl = searchParams.get("member") || "";

  // ==========================================
  // PAGE STATE
  // ==========================================

  const [member, setMember] = useState(null);

  const [sponsor, setSponsor] = useState(null);

  const [overview, setOverview] = useState({
    directPartners: 0,
    activatedDirects: 0,
    directBusiness: 0,
    communitySize: 0,
    activatedCommunity: 0,
    communityBusiness: 0,
  });

  const [levels, setLevels] = useState([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // ==========================================
  // MEMBER SEARCH
  // ==========================================

  const [search, setSearch] = useState("");

  const [searchResults, setSearchResults] = useState([]);

  const [searchLoading, setSearchLoading] = useState(false);

  const [showSearchResults, setShowSearchResults] = useState(false);

  // ==========================================
  // DIRECT MEMBERS
  // ==========================================

  const [directs, setDirects] = useState([]);

  const [directsLoading, setDirectsLoading] = useState(false);

  const [directSearch, setDirectSearch] = useState("");

  const [directSearchDebounced, setDirectSearchDebounced] = useState("");

  const [directPagination, setDirectPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  // ==========================================
  // LEVEL MEMBER STATE
  // ==========================================

  const [selectedLevel, setSelectedLevel] = useState(null);

  const [levelMembers, setLevelMembers] = useState([]);

  const [levelMembersLoading, setLevelMembersLoading] = useState(false);

  const [levelSearch, setLevelSearch] = useState("");

  const [levelSearchDebounced, setLevelSearchDebounced] = useState("");

  const [levelPagination, setLevelPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  // ==========================================
  // AUTH FAILURE
  // ==========================================

  const handleAuthError = useCallback(
    (err) => {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem("ewc_admin_token");

        localStorage.removeItem("ewc_admin_user");

        sessionStorage.removeItem("ewc_admin_token");

        sessionStorage.removeItem("ewc_admin_user");

        navigate("/admin/login", {
          replace: true,
        });

        return true;
      }

      return false;
    },
    [navigate],
  );

  // ==========================================
  // LOAD OVERVIEW
  // ==========================================

  const loadOverview = useCallback(async () => {
    if (!memberFromUrl) {
      setMember(null);
      setSponsor(null);
      setLevels([]);

      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await adminApi.get("/admin/network/overview", {
        params: {
          member: memberFromUrl,
        },
      });

      const data = response.data?.data || {};

      setMember(data.member || null);

      setSponsor(data.sponsor || null);

      setOverview({
        directPartners: Number(data.overview?.directPartners || 0),

        activatedDirects: Number(data.overview?.activatedDirects || 0),

        directBusiness: Number(data.overview?.directBusiness || 0),

        communitySize: Number(data.overview?.communitySize || 0),

        activatedCommunity: Number(data.overview?.activatedCommunity || 0),

        communityBusiness: Number(data.overview?.communityBusiness || 0),
      });

      setLevels(Array.isArray(data.levels) ? data.levels : []);
    } catch (err) {
      console.error("Network overview error:", err);

      if (handleAuthError(err)) {
        return;
      }

      setMember(null);
      setSponsor(null);
      setLevels([]);

      setError(err.response?.data?.message || "Unable to load network.");
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, memberFromUrl]);

  // ==========================================
  // LOAD DIRECT MEMBERS
  // ==========================================

  const loadDirects = useCallback(async () => {
    if (!memberFromUrl) {
      setDirects([]);

      return;
    }

    try {
      setDirectsLoading(true);

      const params = {
        member: memberFromUrl,
        page: directPagination.page,
        limit: 20,
      };

      if (directSearchDebounced) {
        params.search = directSearchDebounced;
      }

      const response = await adminApi.get("/admin/network/directs", {
        params,
      });

      const data = response.data?.data || {};

      setDirects(Array.isArray(data.directs) ? data.directs : []);

      setDirectPagination((current) => ({
        ...current,

        page: Number(data.pagination?.page || 1),

        limit: Number(data.pagination?.limit || 20),

        total: Number(data.pagination?.total || 0),

        totalPages: Number(data.pagination?.totalPages || 1),
      }));
    } catch (err) {
      console.error("Direct network error:", err);

      handleAuthError(err);
    } finally {
      setDirectsLoading(false);
    }
  }, [
    directPagination.page,
    directSearchDebounced,
    handleAuthError,
    memberFromUrl,
  ]);

  // ==========================================
  // LOAD LEVEL MEMBERS
  // ==========================================

  const loadLevelMembers = useCallback(async () => {
    if (!memberFromUrl || !selectedLevel) {
      setLevelMembers([]);

      return;
    }

    try {
      setLevelMembersLoading(true);

      const params = {
        member: memberFromUrl,
        level: selectedLevel,
        page: levelPagination.page,
        limit: 20,
      };

      if (levelSearchDebounced) {
        params.search = levelSearchDebounced;
      }

      const response = await adminApi.get("/admin/network/level-members", {
        params,
      });

      const data = response.data?.data || {};

      setLevelMembers(Array.isArray(data.members) ? data.members : []);

      setLevelPagination((current) => ({
        ...current,

        page: Number(data.pagination?.page || 1),

        limit: Number(data.pagination?.limit || 20),

        total: Number(data.pagination?.total || 0),

        totalPages: Number(data.pagination?.totalPages || 1),
      }));
    } catch (err) {
      console.error("Level members error:", err);

      handleAuthError(err);
    } finally {
      setLevelMembersLoading(false);
    }
  }, [
    handleAuthError,
    levelPagination.page,
    levelSearchDebounced,
    memberFromUrl,
    selectedLevel,
  ]);

  // ==========================================
  // INITIAL LOAD
  // ==========================================

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadDirects();
  }, [loadDirects]);

  useEffect(() => {
    loadLevelMembers();
  }, [loadLevelMembers]);

  // ==========================================
  // RESET WHEN ROOT MEMBER CHANGES
  // ==========================================

  useEffect(() => {
    setSelectedLevel(null);

    setLevelMembers([]);

    setDirectSearch("");
    setDirectSearchDebounced("");

    setLevelSearch("");
    setLevelSearchDebounced("");

    setDirectPagination({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });

    setLevelPagination({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });
  }, [memberFromUrl]);

  // ==========================================
  // DIRECT SEARCH DEBOUNCE
  // ==========================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setDirectSearchDebounced(directSearch.trim());

      setDirectPagination((current) => ({
        ...current,
        page: 1,
      }));
    }, 350);

    return () => clearTimeout(timer);
  }, [directSearch]);

  // ==========================================
  // LEVEL SEARCH DEBOUNCE
  // ==========================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setLevelSearchDebounced(levelSearch.trim());

      setLevelPagination((current) => ({
        ...current,
        page: 1,
      }));
    }, 350);

    return () => clearTimeout(timer);
  }, [levelSearch]);

  // ==========================================
  // MEMBER SEARCH
  // ==========================================

  useEffect(() => {
    const value = search.trim();

    if (!value) {
      setSearchResults([]);
      setShowSearchResults(false);

      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);

        const response = await adminApi.get("/admin/network/search", {
          params: {
            search: value,
          },
        });

        const results = response.data?.data?.members || [];

        setSearchResults(Array.isArray(results) ? results : []);

        setShowSearchResults(true);
      } catch (err) {
        console.error("Network member search error:", err);

        handleAuthError(err);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [handleAuthError, search]);

  // ==========================================
  // SELECT ROOT MEMBER
  // ==========================================

  const selectMember = (selectedMember) => {
    if (!selectedMember?.user_id) {
      return;
    }

    setSearch("");
    setSearchResults([]);
    setShowSearchResults(false);

    setSearchParams({
      member: selectedMember.user_id,
    });
  };

  // ==========================================
  // CHANGE NETWORK ROOT
  // ==========================================

const viewMemberNetwork = (
  selectedMember
) => {
  if (
    !selectedMember?.user_id
  ) {
    return;
  }

  setSearchParams({
    member:
      selectedMember.user_id,
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};
  // ==========================================
  // SELECT LEVEL
  // ==========================================

  const handleLevelSelect = (level) => {
    setSelectedLevel(Number(level));

    setLevelSearch("");
    setLevelSearchDebounced("");

    setLevelPagination({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });
  };

  // ==========================================
  // REFRESH
  // ==========================================

  const handleRefresh = () => {
    loadOverview();
    loadDirects();

    if (selectedLevel) {
      loadLevelMembers();
    }
  };

  // ==========================================
  // DIRECT TABLE
  // ==========================================

  const directColumns = useMemo(
    () => [
      {
        key: "member",
        label: "Member",

        render: (row) => (
          <MemberCell
            member={row}
            onClick={() => navigate(`/admin/members/${row.id}`)}
          />
        ),
      },

      {
        key: "user_id",
        label: "User ID",

        render: (row) => (
          <span className={styles.userId}>{row.user_id || "—"}</span>
        ),
      },

      {
        key: "rank",
        label: "Rank",

        render: (row) => (
          <span className={styles.rank}>{row.rankLabel || "Unranked"}</span>
        ),
      },

      {
        key: "package",
        label: "Current Package",

        render: (row) => (
          <span className={styles.amount}>
            {formatAmount(row.package_amount)}
          </span>
        ),
      },

      {
        key: "activation",
        label: "Activation",

        render: (row) => (
          <ActivationBadge activated={Number(row.package_choose) >= 2} />
        ),
      },

      {
        key: "joined",
        label: "Joined",

        render: (row) => (
          <span className={styles.date}>{formatDate(row.dateOfJoining)}</span>
        ),
      },

      {
        key: "actions",
        label: "Actions",

        render: (row) => (
          <div className={styles.rowActions}>
            <button
              type="button"
              onClick={() => navigate(`/admin/members/${row.id}`)}
            >
              View
            </button>

            <button type="button" onClick={() => viewMemberNetwork(row)}>
              Network
              <ChevronRight size={13} />
            </button>
          </div>
        ),
      },
    ],
    [navigate],
  );

  // ==========================================
  // LEVEL MEMBER TABLE
  // ==========================================

  const levelColumns = useMemo(
    () => [
      {
        key: "member",
        label: "Member",

        render: (row) => (
          <MemberCell
            member={row}
            onClick={() => navigate(`/admin/members/${row.id}`)}
          />
        ),
      },

      {
        key: "user_id",
        label: "User ID",

        render: (row) => (
          <span className={styles.userId}>{row.user_id || "—"}</span>
        ),
      },

      {
        key: "sponsor",
        label: "Sponsor",

        render: (row) => (
          <span className={styles.sponsorId}>{row.sponsor_user_id || "—"}</span>
        ),
      },

      {
        key: "rank",
        label: "Rank",

        render: (row) => (
          <span className={styles.rank}>{row.rankLabel || "Unranked"}</span>
        ),
      },

      {
        key: "business",
        label: "Level Business",

        render: (row) => (
          <span className={styles.amount}>
            {formatAmount(row.network?.packageAmount)}
          </span>
        ),
      },

      {
        key: "recorded",
        label: "Recorded",

        render: (row) => (
          <span className={styles.date}>
            {formatDate(row.network?.createdOn)}
          </span>
        ),
      },

      {
        key: "actions",
        label: "Actions",

        render: (row) => (
          <div className={styles.rowActions}>
            <button
              type="button"
              onClick={() => navigate(`/admin/members/${row.id}`)}
            >
              View
            </button>

            <button type="button" onClick={() => viewMemberNetwork(row)}>
              Team
              <ChevronRight size={13} />
            </button>
          </div>
        ),
      },
    ],
    [navigate],
  );

  // ==========================================
  // PAGE
  // ==========================================

  return (
    <AdminLayout>
      <div className={styles.page}>
        <AdminPageHeader
          eyebrow="MANAGEMENT"
          title="Team"
          description="Inspect sponsorship relationships, direct partners, community business and level distribution."
          icon={Network}
          actions={
            memberFromUrl ? (
              <AdminButton variant="secondary" onClick={handleRefresh}>
                <RefreshCw size={15} />
                Refresh
              </AdminButton>
            ) : null
          }
        />

        {/* ===================================
            MEMBER SEARCH
        =================================== */}

        <div className={styles.searchPanel}>
          <div className={styles.searchHeading}>
            <div className={styles.searchIcon}>
              <Search size={18} />
            </div>

            <div>
              <h3>Find Member Network</h3>

              <p>Search by member ID, name, email or mobile number.</p>
            </div>
          </div>

          <div className={styles.memberSearch}>
            <AdminSearch
              value={search}
              onChange={(event) =>
                setSearch(event.target?.value ?? event ?? "")
              }
              placeholder="Search member..."
            />

            {showSearchResults && (
              <div className={styles.searchResults}>
                {searchLoading ? (
                  <div className={styles.searchState}>Searching...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className={styles.searchResult}
                      onClick={() => selectMember(result)}
                    >
                      <span className={styles.smallAvatar}>
                        {getInitial(result)}
                      </span>

                      <span className={styles.searchResultInfo}>
                        <strong>{result.name || "Unnamed Member"}</strong>

                        <small>
                          {result.user_id}
                          {result.email ? ` • ${result.email}` : ""}
                        </small>
                      </span>

                      <ArrowRight size={15} />
                    </button>
                  ))
                ) : (
                  <div className={styles.searchState}>No members found.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===================================
            NO MEMBER SELECTED
        =================================== */}

        {!memberFromUrl && (
          <div className={styles.emptyPanel}>
            <AdminEmptyState
              title="Select a member"
              description="Search for a member above to inspect their EWC network."
            />
          </div>
        )}

        {/* ===================================
            ERROR
        =================================== */}

        {error && <div className={styles.errorBox}>{error}</div>}

        {/* ===================================
            LOADING
        =================================== */}

        {memberFromUrl && loading ? (
          <div className={styles.loadingPanel}>
            <AdminLoader />
          </div>
        ) : null}

        {/* ===================================
            SELECTED MEMBER
        =================================== */}

        {memberFromUrl && !loading && member && (
          <>
            <SelectedMember
              member={member}
              sponsor={sponsor}
              navigate={navigate}
              viewMemberNetwork={viewMemberNetwork}
            />

            {/* =============================
                  SUMMARY CARDS
              ============================= */}

            <div className={styles.summaryGrid}>
              <SummaryCard
                icon={Users}
                label="Direct Partners"
                value={overview.directPartners}
                meta={`${overview.activatedDirects} activated`}
              />

              <SummaryCard
                icon={CircleDollarSign}
                label="Direct Business"
                value={formatAmount(overview.directBusiness)}
                meta="Level 1 business"
                featured
              />

              <SummaryCard
                icon={GitBranch}
                label="Community Size"
                value={overview.communitySize}
                meta={`${overview.activatedCommunity} activated`}
              />

              <SummaryCard
                icon={WalletCards}
                label="Community Business"
                value={formatAmount(overview.communityBusiness)}
                meta="All team levels"
                featured
              />
            </div>

            {/* =============================
                  Network Tree
              ============================= */}
            <AdminNetworkTree
              memberUserId={member.user_id}
              onAuthError={handleAuthError}
              onMakeRoot={viewMemberNetwork}
            />

            {/* =============================
                  LEVEL DISTRIBUTION
              ============================= */}

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h3>Level Distribution</h3>

                  <p>
                    Member count and recorded business across network levels.
                  </p>
                </div>

                <span className={styles.panelMeta}>{levels.length} levels</span>
              </div>

              {levels.length === 0 ? (
                <div className={styles.panelEmpty}>
                  No level Team records found.
                </div>
              ) : (
                <div className={styles.levelGrid}>
                  {levels.map((item) => (
                    <button
                      key={item.level}
                      type="button"
                      className={`${styles.levelCard} ${
                        Number(selectedLevel) === Number(item.level)
                          ? styles.levelCardActive
                          : ""
                      }`}
                      onClick={() => handleLevelSelect(item.level)}
                    >
                      <div className={styles.levelTop}>
                        <span>Level {item.level}</span>

                        <ChevronRight size={15} />
                      </div>

                      <strong>
                        {Number(item.members || 0).toLocaleString()}
                      </strong>

                      <small>{item.activatedMembers} activated</small>

                      <div className={styles.levelBusiness}>
                        <span>Business</span>

                        <b>{formatAmount(item.business)}</b>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* =============================
                  DIRECT MEMBERS
              ============================= */}

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h3>Direct Partners</h3>

                  <p>
                    Members directly sponsored by{" "}
                    <strong>{member.user_id}</strong>.
                  </p>
                </div>

                <span className={styles.panelMeta}>
                  {directPagination.total.toLocaleString()} members
                </span>
              </div>

              <div className={styles.tableToolbar}>
                <AdminSearch
                  value={directSearch}
                  onChange={(event) =>
                    setDirectSearch(event.target?.value ?? event ?? "")
                  }
                  placeholder="Search direct partners..."
                />
              </div>

              {directsLoading ? (
                <div className={styles.tableState}>
                  <AdminLoader />
                </div>
              ) : directs.length === 0 ? (
                <div className={styles.tableState}>
                  <AdminEmptyState
                    title="No direct partners"
                    description="No directly sponsored members match the current search."
                  />
                </div>
              ) : (
                <>
                  <AdminTable columns={directColumns} data={directs} />

                  <div className={styles.pagination}>
                    <AdminPagination
                      page={directPagination.page}
                      totalPages={directPagination.totalPages}
                      total={directPagination.total}
                      onPageChange={(nextPage) =>
                        setDirectPagination((current) => ({
                          ...current,
                          page: nextPage,
                        }))
                      }
                    />
                  </div>
                </>
              )}
            </div>

            {/* =============================
                  SELECTED LEVEL MEMBERS
              ============================= */}

            {selectedLevel && (
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h3>Level {selectedLevel} Members</h3>

                    <p>
                      Members recorded at level {selectedLevel} below{" "}
                      <strong>{member.user_id}</strong>.
                    </p>
                  </div>

                  <span className={styles.panelMeta}>
                    {levelPagination.total.toLocaleString()} members
                  </span>
                </div>

                <div className={styles.tableToolbar}>
                  <AdminSearch
                    value={levelSearch}
                    onChange={(event) =>
                      setLevelSearch(event.target?.value ?? event ?? "")
                    }
                    placeholder={`Search Level ${selectedLevel}...`}
                  />
                </div>

                {levelMembersLoading ? (
                  <div className={styles.tableState}>
                    <AdminLoader />
                  </div>
                ) : levelMembers.length === 0 ? (
                  <div className={styles.tableState}>
                    <AdminEmptyState
                      title={`No Level ${selectedLevel} members`}
                      description="No members match the current level and search."
                    />
                  </div>
                ) : (
                  <>
                    <AdminTable columns={levelColumns} data={levelMembers} />

                    <div className={styles.pagination}>
                      <AdminPagination
                        page={levelPagination.page}
                        totalPages={levelPagination.totalPages}
                        total={levelPagination.total}
                        onPageChange={(nextPage) =>
                          setLevelPagination((current) => ({
                            ...current,
                            page: nextPage,
                          }))
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

// ==========================================
// SELECTED MEMBER
// ==========================================

const SelectedMember = ({ member, sponsor, navigate, viewMemberNetwork }) => {
  return (
    <div className={styles.selectedMember}>
      <div className={styles.selectedMain}>
        <div className={styles.largeAvatar}>{getInitial(member)}</div>

        <div className={styles.selectedIdentity}>
          <div className={styles.identityTop}>
            <h2>{member.name || "Unnamed Member"}</h2>

            <ActivationBadge activated={Number(member.package_choose) >= 2} />

            {member.blocked && (
              <span className={styles.blockedBadge}>Blocked</span>
            )}
          </div>

          <div className={styles.identityMeta}>
            <span>
              <UserRound size={14} />
              {member.user_id}
            </span>

            <span>
              <Activity size={14} />
              {member.rankLabel || "Unranked"}
            </span>

            <span>
              <CircleDollarSign size={14} />
              {formatAmount(member.package_amount)}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.sponsorSection}>
        <span className={styles.sectionLabel}>Sponsor</span>

        {sponsor ? (
          <div className={styles.sponsorCard}>
            <span className={styles.smallAvatar}>{getInitial(sponsor)}</span>

            <div>
              <strong>{sponsor.name || sponsor.user_id}</strong>

              <small>{sponsor.user_id}</small>
            </div>

            <button type="button" onClick={() => viewMemberNetwork(sponsor)}>
              View Team
            </button>
          </div>
        ) : (
          <span className={styles.noSponsor}>No sponsor found</span>
        )}
      </div>

      <div className={styles.selectedActions}>
        <button
          type="button"
          onClick={() => navigate(`/admin/members/${member.id}`)}
        >
          Member Details
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(
              `/admin/earnings?member=${encodeURIComponent(member.user_id)}`,
            )
          }
        >
          View Earnings
        </button>
      </div>
    </div>
  );
};

// ==========================================
// MEMBER CELL
// ==========================================

const MemberCell = ({ member, onClick }) => {
  return (
    <button type="button" className={styles.memberCell} onClick={onClick}>
      <span className={styles.smallAvatar}>{getInitial(member)}</span>

      <span className={styles.memberCellInfo}>
        <strong>{member.name || "Unnamed Member"}</strong>

        <small>{member.email || member.mobile_no || "No contact"}</small>
      </span>
    </button>
  );
};

// ==========================================
// ACTIVATION BADGE
// ==========================================

const ActivationBadge = ({ activated }) => {
  return (
    <span className={activated ? styles.activeBadge : styles.inactiveBadge}>
      {activated ? "Activated" : "Inactive"}
    </span>
  );
};

// ==========================================
// SUMMARY CARD
// ==========================================

const SummaryCard = ({ icon: Icon, label, value, meta, featured = false }) => {
  return (
    <div
      className={`${styles.summaryCard} ${featured ? styles.featuredCard : ""}`}
    >
      <div className={styles.summaryIcon}>
        <Icon size={19} />
      </div>

      <div className={styles.summaryContent}>
        <span>{label}</span>

        <strong>{value}</strong>

        <small>{meta}</small>
      </div>
    </div>
  );
};

export default AdminNetwork;
