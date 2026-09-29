import {
  ArrowLeft,
  Ban,
  CalendarDays,
  Check,
  CircleDollarSign,
  Copy,
  Mail,
  Network,
  Pencil,
  Phone,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import adminApi from "../../../services/adminApi";

import AdminLayout from "../../../components/admin/layout/AdminLayout";

import AdminButton from "../../../components/admin/ui/AdminButton";
import AdminStatusBadge from "../../../components/admin/ui/AdminStatusBadge";
import AdminModal from "../../../components/admin/ui/AdminModal";
import AdminLoader from "../../../components/admin/ui/AdminLoader";

import styles from "./AdminMemberDetails.module.css";


const AdminMemberDetails = () => {
  const { id } = useParams();

  const navigate = useNavigate();

  const [data, setData] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    accountModal,
    setAccountModal,
  ] = useState(false);

  const [
    roiModal,
    setRoiModal,
  ] = useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [copied, setCopied] =
    useState(false);


  // ========================================
  // LOAD
  // ========================================

  const fetchMember =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const response =
          await adminApi.get(
            `/admin/members/${id}`
          );

        setData(
          response.data.data
        );
      } catch (err) {
        console.error(
          "Member details error:",
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
            "Unable to load member."
        );
      } finally {
        setLoading(false);
      }
    }, [id, navigate]);


  useEffect(() => {
    fetchMember();
  }, [fetchMember]);


  // ========================================
  // ACCOUNT BLOCK
  // ========================================

  const updateAccountStatus =
    async () => {
      if (!data?.member) return;

      const newStatus =
        data.member.blocked ? 0 : 1;

      setActionLoading(true);

      try {
        await adminApi.patch(
          `/admin/members/${id}/status`,
          {
            status: newStatus,
          }
        );

        setAccountModal(false);

        await fetchMember();
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Unable to update account status."
        );
      } finally {
        setActionLoading(false);
      }
    };


  // ========================================
  // ROI BLOCK
  // ========================================

  const updateRoiStatus =
    async () => {
      if (!data?.member) return;

      const newStatus =
        data.member.roiBlocked
          ? 0
          : 1;

      setActionLoading(true);

      try {
        await adminApi.patch(
          `/admin/members/${id}/roi-status`,
          {
            roi_status: newStatus,
          }
        );

        setRoiModal(false);

        await fetchMember();
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Unable to update ROI status."
        );
      } finally {
        setActionLoading(false);
      }
    };


  // ========================================
  // COPY WALLET
  // ========================================

  const copyWallet = async () => {
    if (!data?.member?.trx) return;

    try {
      await navigator.clipboard.writeText(
        data.member.trx
      );

      setCopied(true);

      setTimeout(
        () => setCopied(false),
        1500
      );
    } catch (err) {
      console.error(
        "Clipboard error:",
        err
      );
    }
  };


  // ========================================
  // FORMAT
  // ========================================

  const money = (value) =>
    new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(Number(value || 0));


  const date = (value) => {
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


  // ========================================
  // STATES
  // ========================================

  if (loading) {
    return (
      <AdminLayout
        title="Member Details"
        subtitle="Member administration"
      >
        <div
          className={
            styles.loadingState
          }
        >
          <AdminLoader text="Loading member..." />
        </div>
      </AdminLayout>
    );
  }


  if (!data?.member) {
    return (
      <AdminLayout
        title="Member Details"
        subtitle="Member administration"
      >
        <div className={styles.error}>
          {error ||
            "Member not found."}
        </div>
      </AdminLayout>
    );
  }


  const {
    member,
    network,
    earnings,
    withdrawals,
    recentEarnings,
  } = data;


  return (
    <AdminLayout
      title="Member Details"
      subtitle={`${member.user_id} • EWC member administration`}
    >
      {/* ==================================
          BACK
      ================================== */}

      <button
        type="button"
        className={styles.back}
        onClick={() =>
          navigate("/admin/members")
        }
      >
        <ArrowLeft size={16} />

        Members
      </button>


      {/* ==================================
          HERO
      ================================== */}

      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div
            className={
              styles.avatar
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
              styles.heroIdentity
            }
          >
            <div
              className={
                styles.heroTitle
              }
            >
              <h2>
                {member.name ||
                  member.user_id}
              </h2>

              <span>
                {member.user_id}
              </span>
            </div>

            <div
              className={
                styles.heroBadges
              }
            >
              <AdminStatusBadge
                variant={
                  member.blocked
                    ? "danger"
                    : "success"
                }
              >
                {member.blocked
                  ? "Blocked"
                  : "Active"}
              </AdminStatusBadge>

              <AdminStatusBadge
                variant={
                  member.activated
                    ? "gold"
                    : "neutral"
                }
              >
                {member.activated
                  ? "Activated"
                  : "Not Activated"}
              </AdminStatusBadge>

              <AdminStatusBadge variant="gold">
                {member.rank}
              </AdminStatusBadge>
            </div>
          </div>
        </div>

        <AdminButton
          variant="secondary"
          icon={Pencil}
          onClick={() =>
            navigate(
              `/admin/members/${member.id}/edit`
            )
          }
        >
          Edit User
        </AdminButton>
      </section>


      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}


      {/* ==================================
          MAIN INFORMATION
      ================================== */}

      <div className={styles.grid}>
        <InfoPanel
          title="Account"
          icon={UserRound}
        >
          <InfoRow
            icon={Mail}
            label="Email"
            value={
              member.email || "—"
            }
          />

          <InfoRow
            icon={Phone}
            label="Mobile"
            value={
              member.mobile_no || "—"
            }
          />

          <InfoRow
            label="Country"
            value={
              member.country || "—"
            }
          />

          <InfoRow
            icon={CalendarDays}
            label="Joined"
            value={date(
              member.dateOfJoining
            )}
          />
        </InfoPanel>


        <InfoPanel
          title="Package & Rank"
          icon={CircleDollarSign}
        >
          <InfoRow
            label="Package"
            value={
              member.activated
                ? `Package ${member.package_choose}`
                : "Not Activated"
            }
          />

          <InfoRow
            label="Package Amount"
            value={money(
              member.package_amount
            )}
          />

          <InfoRow
            label="Activation Date"
            value={date(
              member.date_of_activation
            )}
          />

          <InfoRow
            label="Current Rank"
            value={member.rank}
            highlight
          />
        </InfoPanel>


        <InfoPanel
          title="Sponsor"
          icon={Users}
        >
          <InfoRow
            label="Sponsor ID"
            value={
              member.sponsor
                ?.user_id || "—"
            }
          />

          <InfoRow
            label="Sponsor Name"
            value={
              member.sponsor?.name ||
              "—"
            }
          />

          <InfoRow
            label="Sponsor Email"
            value={
              member.sponsor?.email ||
              "—"
            }
          />
        </InfoPanel>


        <InfoPanel
          title="Withdrawal Wallet"
          icon={Wallet}
        >
          {member.walletRegistered ? (
            <>
              <div
                className={
                  styles.walletBox
                }
              >
                <span>
                  {member.trx}
                </span>

                <button
                  type="button"
                  onClick={copyWallet}
                >
                  {copied ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>

              <span
                className={
                  styles.walletNote
                }
              >
                Registered withdrawal
                wallet. Read-only from
                this screen.
              </span>
            </>
          ) : (
            <div
              className={
                styles.noWallet
              }
            >
              No withdrawal wallet
              registered.
            </div>
          )}
        </InfoPanel>
      </div>


      {/* ==================================
          NETWORK + EARNINGS
      ================================== */}

      <div
        className={
          styles.metricsGrid
        }
      >
        <section
          className={styles.panel}
        >
          <PanelHeading
            icon={Network}
            title="Network"
            action="View Network"
            onAction={() =>
              navigate(
                `/admin/network?member=${encodeURIComponent(
                  member.user_id
                )}`
              )
            }
          />

          <div
            className={
              styles.metricCards
            }
          >
            <Metric
              label="Direct Partners"
              value={
                network.directPartners
              }
            />

            <Metric
              label="Direct Business"
              value={money(
                network.directBusiness
              )}
            />

            <Metric
              label="Community"
              value={
                network.communitySize
              }
            />

            <Metric
              label="Community Business"
              value={money(
                network.communityBusiness
              )}
            />
          </div>
        </section>


        <section
          className={styles.panel}
        >
          <PanelHeading
            icon={CircleDollarSign}
            title="Earnings"
            action="View Earnings"
            onAction={() =>
              navigate(
                `/admin/earnings?member=${encodeURIComponent(
                  member.user_id
                )}`
              )
            }
          />

          <div
            className={
              styles.metricCards
            }
          >
            <Metric
              label="Direct"
              value={money(
                earnings.direct
              )}
            />

            <Metric
              label="Rank"
              value={money(
                earnings.rank
              )}
            />

            <Metric
              label="Salary"
              value={money(
                earnings.salary
              )}
            />

            <Metric
              label="Reward"
              value={money(
                earnings.reward
              )}
            />
          </div>

          <div
            className={
              styles.totalEarnings
            }
          >
            <span>
              Total Earnings
            </span>

            <strong>
              {money(earnings.total)}
            </strong>
          </div>
        </section>
      </div>


      {/* ==================================
          WITHDRAWALS + RECENT EARNINGS
      ================================== */}

      <div
        className={
          styles.metricsGrid
        }
      >
        <section
          className={styles.panel}
        >
          <PanelHeading
            icon={Wallet}
            title="Withdrawals"
          />

          <div
            className={
              styles.metricCards
            }
          >
            <Metric
              label="Requests"
              value={
                withdrawals.totalRequests
              }
            />

            <Metric
              label="Requested"
              value={money(
                withdrawals.totalRequested
              )}
            />

            <Metric
              label="Pending"
              value={money(
                withdrawals.pendingAmount
              )}
            />

            <Metric
              label="Approved"
              value={money(
                withdrawals.approvedAmount
              )}
            />
          </div>
        </section>


        <section
          className={styles.panel}
        >
          <PanelHeading
            icon={CircleDollarSign}
            title="Recent Earnings"
            action="View All"
            onAction={() =>
              navigate(
                `/admin/earnings?member=${encodeURIComponent(
                  member.user_id
                )}`
              )
            }
          />

          {recentEarnings.length ? (
            <div
              className={
                styles.recentList
              }
            >
              {recentEarnings.map(
                (item) => (
                  <div
                    key={item.id}
                    className={
                      styles.recentItem
                    }
                  >
                    <div>
                      <strong>
                        {item.type}
                      </strong>

                      <span>
                        {item.description ||
                          date(
                            item.created_at
                          )}
                      </span>
                    </div>

                    <strong>
                      {money(
                        item.amount
                      )}
                    </strong>
                  </div>
                )
              )}
            </div>
          ) : (
            <div
              className={
                styles.empty
              }
            >
              No earnings recorded.
            </div>
          )}
        </section>
      </div>


      {/* ==================================
          ACCOUNT CONTROLS
      ================================== */}

      <section
        className={`${styles.panel} ${styles.controlsPanel}`}
      >
        <div>
          <span
            className={
              styles.sectionEyebrow
            }
          >
            ADMINISTRATION
          </span>

          <h3>Account Controls</h3>

          <p>
            Sensitive member controls
            are kept separate from
            ordinary profile editing.
          </p>
        </div>


        <div
          className={
            styles.controlRows
          }
        >
          <ControlRow
            title="Account Access"
            description={
              member.blocked
                ? "This member is currently blocked from accessing the account."
                : "This member can currently access the account."
            }
            status={
              member.blocked
                ? "Blocked"
                : "Active"
            }
            variant={
              member.blocked
                ? "danger"
                : "success"
            }
            button={
              member.blocked
                ? "Unblock User"
                : "Block User"
            }
            danger={
              !member.blocked
            }
            icon={
              member.blocked
                ? ShieldCheck
                : Ban
            }
            onClick={() =>
              setAccountModal(true)
            }
          />


          <ControlRow
            title="ROI Status"
            description={
              member.roiBlocked
                ? "ROI is currently blocked for this member."
                : "ROI is currently enabled for this member."
            }
            status={
              member.roiBlocked
                ? "ROI Blocked"
                : "ROI Enabled"
            }
            variant={
              member.roiBlocked
                ? "danger"
                : "success"
            }
            button={
              member.roiBlocked
                ? "Unblock ROI"
                : "Block ROI"
            }
            danger={
              !member.roiBlocked
            }
            icon={
              member.roiBlocked
                ? ShieldCheck
                : Ban
            }
            onClick={() =>
              setRoiModal(true)
            }
          />
        </div>
      </section>


      {/* ACCOUNT MODAL */}

      <AdminModal
        open={accountModal}
        onClose={() => {
          if (!actionLoading) {
            setAccountModal(false);
          }
        }}
        size="small"
        title={
          member.blocked
            ? "Unblock Member"
            : "Block Member"
        }
        description={
          member.blocked
            ? "The member will regain account access."
            : "The member will no longer be able to access their account."
        }
        footer={
          <>
            <AdminButton
              variant="secondary"
              disabled={
                actionLoading
              }
              onClick={() =>
                setAccountModal(
                  false
                )
              }
            >
              Cancel
            </AdminButton>

            <AdminButton
              variant={
                member.blocked
                  ? "primary"
                  : "danger"
              }
              disabled={
                actionLoading
              }
              onClick={
                updateAccountStatus
              }
            >
              {actionLoading
                ? "Updating..."
                : member.blocked
                  ? "Unblock User"
                  : "Block User"}
            </AdminButton>
          </>
        }
      />


      {/* ROI MODAL */}

      <AdminModal
        open={roiModal}
        onClose={() => {
          if (!actionLoading) {
            setRoiModal(false);
          }
        }}
        size="small"
        title={
          member.roiBlocked
            ? "Unblock ROI"
            : "Block ROI"
        }
        description={
          member.roiBlocked
            ? "ROI will be enabled for this member."
            : "ROI will be blocked for this member without blocking their account."
        }
        footer={
          <>
            <AdminButton
              variant="secondary"
              disabled={
                actionLoading
              }
              onClick={() =>
                setRoiModal(false)
              }
            >
              Cancel
            </AdminButton>

            <AdminButton
              variant={
                member.roiBlocked
                  ? "primary"
                  : "danger"
              }
              disabled={
                actionLoading
              }
              onClick={
                updateRoiStatus
              }
            >
              {actionLoading
                ? "Updating..."
                : member.roiBlocked
                  ? "Unblock ROI"
                  : "Block ROI"}
            </AdminButton>
          </>
        }
      />
    </AdminLayout>
  );
};


// ==========================================
// SMALL COMPONENTS
// ==========================================

const InfoPanel = ({
  title,
  icon: Icon,
  children,
}) => (
  <section className={styles.panel}>
    <PanelHeading
      icon={Icon}
      title={title}
    />

    <div
      className={styles.infoRows}
    >
      {children}
    </div>
  </section>
);


const PanelHeading = ({
  title,
  icon: Icon,
  action,
  onAction,
}) => (
  <div
    className={styles.panelHeading}
  >
    <div>
      {Icon && <Icon size={17} />}
      <h3>{title}</h3>
    </div>

    {action && (
      <button
        type="button"
        onClick={onAction}
      >
        {action}
      </button>
    )}
  </div>
);


const InfoRow = ({
  label,
  value,
  icon: Icon,
  highlight = false,
}) => (
  <div className={styles.infoRow}>
    <div>
      {Icon && <Icon size={14} />}
      <span>{label}</span>
    </div>

    <strong
      className={
        highlight
          ? styles.highlight
          : ""
      }
    >
      {value}
    </strong>
  </div>
);


const Metric = ({
  label,
  value,
}) => (
  <div className={styles.metric}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);


const ControlRow = ({
  title,
  description,
  status,
  variant,
  button,
  danger,
  icon,
  onClick,
}) => (
  <div className={styles.controlRow}>
    <div
      className={
        styles.controlInfo
      }
    >
      <strong>{title}</strong>
      <span>{description}</span>
    </div>

    <AdminStatusBadge
      variant={variant}
    >
      {status}
    </AdminStatusBadge>

    <AdminButton
      variant={
        danger
          ? "danger"
          : "secondary"
      }
      icon={icon}
      onClick={onClick}
    >
      {button}
    </AdminButton>
  </div>
);


export default AdminMemberDetails;