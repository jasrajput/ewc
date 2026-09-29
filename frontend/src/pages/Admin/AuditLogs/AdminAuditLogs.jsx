import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";
import {
  Clipboard,
  Eye,
  History,
  RefreshCw,
  ShieldCheck,
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

import styles from "./AdminAuditLogs.module.css";


const ACTION_OPTIONS = [
  {
    value: "",
    label: "All Actions",
  },
  {
    value: "MEMBER_WALLET_CHANGED",
    label: "Wallet Changed",
  },
  {
    value: "MEMBER_EMAIL_CHANGED",
    label: "Email Changed",
  },
  {
    value: "MEMBER_BLOCKED",
    label: "Member Blocked",
  },
  {
    value: "MEMBER_UNBLOCKED",
    label: "Member Unblocked",
  },
  {
    value: "MEMBER_ROI_BLOCKED",
    label: "ROI Blocked",
  },
  {
    value: "MEMBER_ROI_UNBLOCKED",
    label: "ROI Unblocked",
  },
];


const ACTION_LABELS = {
  MEMBER_WALLET_CHANGED: "Wallet Changed",
  MEMBER_EMAIL_CHANGED: "Email Changed",
  MEMBER_BLOCKED: "Member Blocked",
  MEMBER_UNBLOCKED: "Member Unblocked",
  MEMBER_ROI_BLOCKED: "ROI Blocked",
  MEMBER_ROI_UNBLOCKED: "ROI Unblocked",
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


const shortenValue = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const stringValue = String(value);

  if (
    stringValue.startsWith("0x") &&
    stringValue.length > 20
  ) {
    return `${stringValue.slice(
      0,
      8
    )}...${stringValue.slice(-6)}`;
  }

  if (stringValue.length > 34) {
    return `${stringValue.slice(
      0,
      28
    )}...`;
  }

  return stringValue;
};


const AdminAuditLogs = () => {
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [action, setAction] =
    useState("");

  const [from, setFrom] =
    useState("");

  const [to, setTo] =
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

    return () =>
      clearTimeout(timer);
  }, [search]);


  // ==========================================
  // LOAD AUDIT LOGS
  // ==========================================

  const loadAuditLogs =
    useCallback(async () => {
      try {
        setLoading(true);
        setError("");

        const params = {
          page,
          limit: 20,
        };

        if (debouncedSearch) {
          params.search =
            debouncedSearch;
        }

        if (action) {
          params.action = action;
        }

        if (from) {
          params.from = from;
        }

        if (to) {
          params.to = to;
        }

        const response =
          await adminApi.get(
            "/admin/audit-logs",
            {
              params,
            }
          );

        const result =
          response.data?.data || {};

        setLogs(
          Array.isArray(result.logs)
            ? result.logs
            : []
        );

        setPagination({
          page:
            Number(
              result.pagination?.page
            ) || 1,

          limit:
            Number(
              result.pagination?.limit
            ) || 20,

          total:
            Number(
              result.pagination?.total
            ) || 0,

          totalPages:
            Number(
              result.pagination?.totalPages
            ) || 1,
        });
      } catch (err) {
        console.error(
          "Load audit logs error:",
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
            "Unable to load audit logs."
        );
      } finally {
        setLoading(false);
      }
    }, [
      action,
      debouncedSearch,
      from,
      navigate,
      page,
      to,
    ]);


  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);


  // ==========================================
  // FILTERS
  // ==========================================

  const handleActionChange = (
    event
  ) => {
    setAction(
      event.target.value
    );

    setPage(1);
  };


  const handleDateChange = (
    first,
    second
  ) => {
    /*
      This supports the common shared
      AdminDateRange API:

      onChange(from, to)

      If your shared component instead
      passes an object, the fallback below
      handles:
      { from, to }
    */

    if (
      first &&
      typeof first === "object"
    ) {
      setFrom(first.from || "");
      setTo(first.to || "");
    } else {
      setFrom(first || "");
      setTo(second || "");
    }

    setPage(1);
  };


  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setAction("");
    setFrom("");
    setTo("");
    setPage(1);
  };


  // ==========================================
  // COPY
  // ==========================================

  const copyValue = async (
    value
  ) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        String(value)
      );
    } catch (err) {
      console.error(
        "Copy failed:",
        err
      );
    }
  };


  // ==========================================
  // COLUMNS
  // ==========================================

  const columns = [
    {
      key: "created_at",
      label: "Date",

      render: (row) => (
        <div
          className={
            styles.dateCell
          }
        >
          {formatDate(
            row.created_at
          )}
        </div>
      ),
    },

    {
      key: "admin_user",
      label: "Admin",

      render: (row) => (
        <div
          className={
            styles.adminCell
          }
        >
          <ShieldCheck
            size={15}
          />

          <span>
            {row.admin_user ||
              "—"}
          </span>
        </div>
      ),
    },

    {
      key: "action",
      label: "Action",

      render: (row) => (
        <AdminStatusBadge
          label={
            ACTION_LABELS[
              row.action
            ] ||
            row.action ||
            "Unknown"
          }
          status={
            row.action
          }
        />
      ),
    },

    {
      key: "entity_user_id",
      label: "Member",

      render: (row) => {
        if (
          !row.entity_user_id
        ) {
          return "—";
        }

        return (
          <button
            type="button"
            className={
              styles.memberButton
            }
            onClick={() => {
              if (
                row.entity_id
              ) {
                navigate(
                  `/admin/members/${row.entity_id}`
                );
              }
            }}
          >
            <span>
              {
                row.entity_user_id
              }
            </span>

            {row.entity_id && (
              <Eye size={14} />
            )}
          </button>
        );
      },
    },

    {
      key: "field_name",
      label: "Field",

      render: (row) => (
        <span
          className={
            styles.fieldName
          }
        >
          {row.field_name ||
            "—"}
        </span>
      ),
    },

    {
      key: "old_value",
      label: "Previous Value",

      render: (row) => (
        <ValueCell
          value={
            row.old_value
          }
          onCopy={
            copyValue
          }
        />
      ),
    },

    {
      key: "new_value",
      label: "New Value",

      render: (row) => (
        <ValueCell
          value={
            row.new_value
          }
          onCopy={
            copyValue
          }
        />
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
        >
          {row.description ||
            "—"}
        </span>
      ),
    },

    {
      key: "ip_address",
      label: "IP",

      render: (row) => (
        <span
          className={
            styles.ip
          }
        >
          {row.ip_address ||
            "—"}
        </span>
      ),
    },
  ];


  return (
    <AdminLayout>
      <div
        className={
          styles.page
        }
      >
        <AdminPageHeader
          eyebrow="ADMINISTRATION"
          title="Audit Logs"
          description="Review sensitive administrative activity across the EWC platform."
          icon={History}
          actions={
            <AdminButton
              variant="secondary"
              onClick={
                loadAuditLogs
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
            SUMMARY
        =================================== */}

        <div
          className={
            styles.summaryGrid
          }
        >
          <div
            className={
              styles.summaryCard
            }
          >
            <span>
              Matching Records
            </span>

            <strong>
              {pagination.total.toLocaleString()}
            </strong>

            <small>
              Current filters
            </small>
          </div>

          <div
            className={
              styles.summaryCard
            }
          >
            <span>
              Audit Coverage
            </span>

            <strong>
              Member Actions
            </strong>

            <small>
              Wallet, email,
              account & ROI
            </small>
          </div>

          <div
            className={
              styles.summaryCard
            }
          >
            <span>
              Records
            </span>

            <strong>
              Read Only
            </strong>

            <small>
              No admin delete
              action
            </small>
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
                    event
                )
              }
              placeholder="Search member, admin, action..."
            />
          </div>

          <div
            className={
              styles.actionFilter
            }
          >
            <AdminSelect
              value={action}
              onChange={
                handleActionChange
              }
              options={
                ACTION_OPTIONS
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
                Administrative
                Activity
              </h3>

              <p>
                Permanent history
                of sensitive admin
                operations.
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
          ) : logs.length ===
            0 ? (
            <div
              className={
                styles.stateContainer
              }
            >
              <AdminEmptyState
                title="No audit logs found"
                description="Administrative activity will appear here as sensitive actions are performed."
              />
            </div>
          ) : (
            <>
              <AdminTable
                columns={
                  columns
                }
                data={logs}
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
// VALUE CELL
// ==========================================

const ValueCell = ({
  value,
  onCopy,
}) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return (
      <span
        className={
          styles.emptyValue
        }
      >
        —
      </span>
    );
  }

  return (
    <div
      className={
        styles.valueCell
      }
      title={String(value)}
    >
      <span>
        {shortenValue(value)}
      </span>

      <button
        type="button"
        className={
          styles.copyButton
        }
        onClick={() =>
          onCopy(value)
        }
        title="Copy full value"
      >
        <Clipboard
          size={13}
        />
      </button>
    </div>
  );
};


export default AdminAuditLogs;