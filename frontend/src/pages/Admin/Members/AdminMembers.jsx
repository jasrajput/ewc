import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Ban,
  CircleDollarSign,
  Eye,
  Network,
  Pencil,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import adminApi from "../../../services/adminApi";

import AdminLayout from "../../../components/admin/layout/AdminLayout";

import AdminPageHeader from "../../../components/admin/ui/AdminPageHeader";
import AdminSearch from "../../../components/admin/ui/AdminSearch";
import AdminSelect from "../../../components/admin/ui/AdminSelect";
import AdminFilters from "../../../components/admin/ui/AdminFilters";
import AdminDateRange from "../../../components/admin/ui/AdminDateRange";
import AdminTable from "../../../components/admin/ui/AdminTable";
import AdminPagination from "../../../components/admin/ui/AdminPagination";
import AdminStatusBadge from "../../../components/admin/ui/AdminStatusBadge";
import AdminActionMenu from "../../../components/admin/ui/AdminActionMenu";
import AdminModal from "../../../components/admin/ui/AdminModal";
import AdminButton from "../../../components/admin/ui/AdminButton";

import styles from "./AdminMembers.module.css";

const INITIAL_FILTERS = {
  search: "",
  activation: "",
  status: "",
  wallet: "",
  rank: "",
  joinedFrom: "",
  joinedTo: "",
  activatedFrom: "",
  activatedTo: "",
  sort: "newest",
};

const AdminMembers = () => {
  const navigate = useNavigate();

  const [members, setMembers] =
    useState([]);

  const [filters, setFilters] =
    useState(INITIAL_FILTERS);

  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [page, setPage] =
    useState(1);

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

  const [
    statusMember,
    setStatusMember,
  ] = useState(null);

  const [
    statusLoading,
    setStatusLoading,
  ] = useState(false);

  // ========================================
  // SEARCH DEBOUNCE
  // ========================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(
        filters.search.trim()
      );

      setPage(1);
    }, 350);

    return () =>
      clearTimeout(timer);
  }, [filters.search]);

  // ========================================
  // LOAD MEMBERS
  // ========================================

  const fetchMembers =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const params = {
          page,
          limit: 20,
          sort: filters.sort,
        };

        if (debouncedSearch) {
          params.search =
            debouncedSearch;
        }

        if (filters.activation) {
          params.activation =
            filters.activation;
        }

        if (filters.status) {
          params.status =
            filters.status;
        }

        if (filters.wallet) {
          params.wallet =
            filters.wallet;
        }

        if (filters.rank !== "") {
          params.rank =
            filters.rank;
        }

        if (filters.joinedFrom) {
          params.joinedFrom =
            filters.joinedFrom;
        }

        if (filters.joinedTo) {
          params.joinedTo =
            filters.joinedTo;
        }

        if (filters.activatedFrom) {
          params.activatedFrom =
            filters.activatedFrom;
        }

        if (filters.activatedTo) {
          params.activatedTo =
            filters.activatedTo;
        }

        const response =
          await adminApi.get(
            "/admin/members",
            { params }
          );

        setMembers(
          response.data.data || []
        );

        setPagination(
          response.data.pagination || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 1,
          }
        );
      } catch (err) {
        console.error(
          "Admin members error:",
          err
        );

        if (
          err.response?.status === 401 ||
          err.response?.status === 403
        ) {
          navigate(
            "/admin/login",
            { replace: true }
          );

          return;
        }

        setError(
          err.response?.data?.message ||
            "Unable to load members."
        );
      } finally {
        setLoading(false);
      }
    }, [
      page,
      filters.activation,
      filters.status,
      filters.wallet,
      filters.rank,
      filters.joinedFrom,
      filters.joinedTo,
      filters.activatedFrom,
      filters.activatedTo,
      filters.sort,
      debouncedSearch,
      navigate,
    ]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // ========================================
  // FILTER
  // ========================================

  const updateFilter = (
    key,
    value
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (key !== "search") {
      setPage(1);
    }
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setDebouncedSearch("");
    setPage(1);
  };

  // ========================================
  // BLOCK / UNBLOCK
  // ========================================

  const confirmStatusChange =
    async () => {
      if (!statusMember) return;

      const newStatus =
        statusMember.blocked ? 0 : 1;

      setStatusLoading(true);

      try {
        await adminApi.patch(
          `/admin/members/${statusMember.id}/status`,
          {
            status: newStatus,
          }
        );

        setStatusMember(null);

        await fetchMembers();
      } catch (err) {
        console.error(
          "Status update error:",
          err
        );

        setError(
          err.response?.data?.message ||
            "Unable to update member status."
        );
      } finally {
        setStatusLoading(false);
      }
    };

  // ========================================
  // FORMAT
  // ========================================

  const formatUsd = (value) =>
    new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return "—";

    return new Date(
      value
    ).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }
    );
  };

  const shortenWallet = (wallet) => {
    if (!wallet) return "—";

    if (wallet.length <= 14) {
      return wallet;
    }

    return `${wallet.slice(
      0,
      6
    )}...${wallet.slice(-5)}`;
  };

  // ========================================
  // TABLE
  // ========================================

  const columns = [
    {
      key: "member",
      label: "Member",
      width: "230px",

      render: (member) => (
        <div
          className={styles.memberCell}
        >
          <div
            className={
              styles.memberAvatar
            }
          >
            {String(
              member.name ||
                member.user_id ||
                "U"
            )
              .charAt(0)
              .toUpperCase()}
          </div>

          <div
            className={
              styles.memberIdentity
            }
          >
            <strong>
              {member.name || "—"}
            </strong>

            <span>
              {member.email || "—"}
            </span>
          </div>
        </div>
      ),
    },

    {
      key: "user_id",
      label: "User ID",

      render: (member) => (
        <span
          className={styles.userId}
        >
          {member.user_id || "—"}
        </span>
      ),
    },

    {
      key: "sponsor",
      label: "Sponsor",

      render: (member) =>
        member.sponsor?.user_id ? (
          <div
            className={
              styles.sponsorCell
            }
          >
            <strong>
              {
                member.sponsor
                  .user_id
              }
            </strong>

            {member.sponsor.name && (
              <span>
                {
                  member.sponsor
                    .name
                }
              </span>
            )}
          </div>
        ) : (
          "—"
        ),
    },

    {
      key: "package",
      label: "Package",

      render: (member) => (
        <div
          className={
            styles.packageCell
          }
        >
          <strong>
            {member.activated
              ? formatUsd(
                  member.package_amount
                )
              : "Not Activated"}
          </strong>

          {member.activated && (
            <span>
              Package{" "}
              {member.package_choose}
            </span>
          )}
        </div>
      ),
    },

    {
      key: "rank",
      label: "Rank",

      render: (member) => (
        <span
          className={styles.rank}
        >
          {member.rank}
        </span>
      ),
    },

    {
      key: "wallet",
      label: "Wallet",

      render: (member) =>
        member.walletRegistered ? (
          <div
            className={
              styles.walletCell
            }
            title={member.wallet}
          >
            <Wallet size={14} />

            <span>
              {shortenWallet(
                member.wallet
              )}
            </span>
          </div>
        ) : (
          <span
            className={
              styles.muted
            }
          >
            Not registered
          </span>
        ),
    },

    {
      key: "activation",
      label: "Activation",

      render: (member) =>
        member.activated ? (
          <AdminStatusBadge variant="gold">
            Activated
          </AdminStatusBadge>
        ) : (
          <AdminStatusBadge variant="neutral">
            Not Activated
          </AdminStatusBadge>
        ),
    },

    {
      key: "status",
      label: "Account",

      render: (member) =>
        member.blocked ? (
          <AdminStatusBadge variant="danger">
            Blocked
          </AdminStatusBadge>
        ) : (
          <AdminStatusBadge variant="success">
            Active
          </AdminStatusBadge>
        ),
    },

    {
      key: "joined",
      label: "Joined",

      render: (member) => (
        <div
          className={
            styles.dateCell
          }
        >
          <strong>
            {formatDate(
              member.dateOfJoining
            )}
          </strong>

          {member.date_of_activation && (
            <span>
              Activated{" "}
              {formatDate(
                member.date_of_activation
              )}
            </span>
          )}
        </div>
      ),
    },

    {
      key: "actions",
      label: "",
      align: "right",
      width: "60px",

      render: (member) => (
        <AdminActionMenu
          actions={[
            {
              label: "View Details",
              icon: Eye,
              onClick: () =>
                navigate(
                  `/admin/members/${member.id}`
                ),
            },

            {
              label: "Edit User",
              icon: Pencil,
              onClick: () =>
                navigate(
                  `/admin/members/${member.id}/edit`
                ),
            },

            {
              label: "View Earnings",
              icon:
                CircleDollarSign,
              onClick: () =>
                navigate(
                  `/admin/earnings?member=${encodeURIComponent(
                    member.user_id
                  )}`
                ),
            },

            {
              label: "View Network",
              icon: Network,
              onClick: () =>
                navigate(
                  `/admin/network?member=${encodeURIComponent(
                    member.user_id
                  )}`
                ),
            },

            {
              label: member.blocked
                ? "Unblock User"
                : "Block User",

              icon: member.blocked
                ? ShieldCheck
                : Ban,

              danger:
                !member.blocked,

              onClick: () =>
                setStatusMember(
                  member
                ),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <AdminLayout
      title="Members"
      subtitle="Manage EWC members and account activity"
    >
      <AdminPageHeader
        eyebrow="MEMBER MANAGEMENT"
        title="Members"
        description="Search, review and manage registered EWC members."
      />

      <div className={styles.summary}>
        <SummaryCard
          icon={Users}
          label="Filtered Members"
          value={pagination.total}
        />

        <SummaryCard
          icon={UserCheck}
          label="Activated"
          value="Package 2+"
        />

        <SummaryCard
          icon={UserRoundX}
          label="Not Activated"
          value="Package 1"
        />

        <SummaryCard
          icon={Ban}
          label="Blocked"
          value=""
        />
      </div>

      <AdminFilters
        title="Member Filters"
        onReset={resetFilters}
      >
        <AdminSearch
          value={filters.search}
          onChange={(value) =>
            updateFilter(
              "search",
              value
            )
          }
          placeholder="Search ID, name, email, mobile or wallet..."
        />

        <AdminSelect
          value={filters.activation}
          onChange={(value) =>
            updateFilter(
              "activation",
              value
            )
          }
          placeholder="All Activation"
          options={[
            {
              value: "activated",
              label:
                "Activated Members",
            },
            {
              value: "inactive",
              label:
                "Not Activated",
            },
          ]}
        />

        <AdminSelect
          value={filters.status}
          onChange={(value) =>
            updateFilter(
              "status",
              value
            )
          }
          placeholder="All Accounts"
          options={[
            {
              value: "active",
              label:
                "Active Accounts",
            },
            {
              value: "blocked",
              label:
                "Blocked Members",
            },
          ]}
        />

        <AdminSelect
          value={filters.wallet}
          onChange={(value) =>
            updateFilter(
              "wallet",
              value
            )
          }
          placeholder="All Wallets"
          options={[
            {
              value: "registered",
              label:
                "Wallet Registered",
            },
            {
              value: "missing",
              label:
                "Wallet Not Set",
            },
          ]}
        />

        <AdminSelect
          value={filters.rank}
          onChange={(value) =>
            updateFilter(
              "rank",
              value
            )
          }
          placeholder="All Ranks"
          options={[
            {
              value: "0",
              label: "Unranked",
            },
            ...Array.from(
              { length: 12 },
              (_, index) => ({
                value: String(
                  index + 1
                ),
                label: `E-${String(
                  index + 1
                ).padStart(2, "0")}`,
              })
            ),
          ]}
        />

        <AdminSelect
          value={filters.sort}
          onChange={(value) =>
            updateFilter(
              "sort",
              value
            )
          }
          placeholder=""
          options={[
            {
              value: "newest",
              label: "Newest First",
            },
            {
              value: "oldest",
              label: "Oldest First",
            },
            {
              value:
                "investment_high",
              label:
                "Investment: High to Low",
            },
            {
              value:
                "investment_low",
              label:
                "Investment: Low to High",
            },
            {
              value: "rank_high",
              label:
                "Rank: High to Low",
            },
          ]}
        />

        <div
          className={
            styles.filterGroup
          }
        >
          <span>Joining Date</span>

          <AdminDateRange
            from={filters.joinedFrom}
            to={filters.joinedTo}
            onFromChange={(value) =>
              updateFilter(
                "joinedFrom",
                value
              )
            }
            onToChange={(value) =>
              updateFilter(
                "joinedTo",
                value
              )
            }
          />
        </div>

        <div
          className={
            styles.filterGroup
          }
        >
          <span>
            Activation Date
          </span>

          <AdminDateRange
            from={
              filters.activatedFrom
            }
            to={filters.activatedTo}
            onFromChange={(value) =>
              updateFilter(
                "activatedFrom",
                value
              )
            }
            onToChange={(value) =>
              updateFilter(
                "activatedTo",
                value
              )
            }
          />
        </div>
      </AdminFilters>

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <AdminTable
        columns={columns}
        data={members}
        loading={loading}
        emptyTitle="No members found"
        emptyMessage="No members match the selected filters."
        rowKey="id"
      />

      {!loading && (
        <AdminPagination
          page={pagination.page}
          totalPages={
            pagination.totalPages
          }
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={setPage}
        />
      )}

      <AdminModal
        open={Boolean(statusMember)}
        onClose={() => {
          if (!statusLoading) {
            setStatusMember(null);
          }
        }}
        size="small"
        title={
          statusMember?.blocked
            ? "Unblock Member"
            : "Block Member"
        }
        description={
          statusMember?.blocked
            ? "This member will be allowed to access their EWC account again."
            : "This member will no longer be allowed to access their EWC account."
        }
        footer={
          <>
            <AdminButton
              variant="secondary"
              disabled={statusLoading}
              onClick={() =>
                setStatusMember(null)
              }
            >
              Cancel
            </AdminButton>

            <AdminButton
              variant={
                statusMember?.blocked
                  ? "primary"
                  : "danger"
              }
              disabled={statusLoading}
              onClick={
                confirmStatusChange
              }
            >
              {statusLoading
                ? "Updating..."
                : statusMember?.blocked
                  ? "Unblock User"
                  : "Block User"}
            </AdminButton>
          </>
        }
      >
        {statusMember && (
          <div
            className={
              styles.confirmMember
            }
          >
            <div
              className={
                styles.confirmAvatar
              }
            >
              {String(
                statusMember.name ||
                  statusMember.user_id
              )
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <strong>
                {statusMember.name ||
                  statusMember.user_id}
              </strong>

              <span>
                {
                  statusMember.user_id
                }
              </span>
            </div>
          </div>
        )}
      </AdminModal>
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
}) => (
  <div className={styles.summaryCard}>
    <div
      className={styles.summaryIcon}
    >
      <Icon size={18} />
    </div>

    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  </div>
);

export default AdminMembers;