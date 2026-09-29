import { useCallback, useEffect, useState } from "react";

import { useNavigate, useSearchParams } from "react-router-dom";

import {
  Bell,
  MessageCircle,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";

import styles from "./Notifications.module.css";

const TABS = [
  {
    key: "all",
    label: "All",
  },
  {
    key: "support",
    label: "Support",
  },
  {
    key: "announcement",
    label: "Announcements",
  },
];

const Notifications = () => {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  const initialType = searchParams.get("type");

  const [type, setType] = useState(
    ["support", "announcement"].includes(initialType) ? initialType : "all",
  );

  const [notifications, setNotifications] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const [unread, setUnread] = useState({
    total: 0,
    support: 0,
    announcements: 0,
  });

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const [announcementLoading, setAnnouncementLoading] = useState(false);

  // ============================================
  // UNREAD COUNT
  // ============================================

  const loadUnread = useCallback(async () => {
    try {
      const response = await api.get("/notifications/unread-count");

      setUnread({
        total: Number(response.data?.data?.total || 0),

        support: Number(response.data?.data?.support || 0),

        announcements: Number(response.data?.data?.announcements || 0),
      });
    } catch (error) {
      console.error("Notification count:", error);
    }
  }, []);

  // ============================================
  // LOAD NOTIFICATIONS
  // ============================================

  const loadNotifications = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/notifications", {
          params: {
            type,
            page,
            limit: 20,
          },
        });

        setNotifications(response.data?.data?.notifications || []);

        setPagination(
          response.data?.data?.pagination || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
          },
        );
      } catch (error) {
        console.error("Notifications:", error);

        setError(
          error.response?.data?.message || "Unable to load notifications.",
        );
      } finally {
        setLoading(false);
      }
    },
    [type],
  );

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  useEffect(() => {
    loadNotifications(1);
  }, [loadNotifications]);

  // ============================================
  // TAB
  // ============================================

  const changeType = (nextType) => {
    setType(nextType);

    if (nextType === "all") {
      setSearchParams({});
    } else {
      setSearchParams({
        type: nextType,
      });
    }
  };

  // ============================================
  // OPEN NOTIFICATION
  // ============================================

  const openNotification = async (item) => {
    if (item.type === "support") {
      navigate(`/support?ticket=${item.ticketId}`);

      return;
    }

    if (item.type === "announcement") {
      await openAnnouncement(item);
    }
  };

  // ============================================
  // OPEN ANNOUNCEMENT
  // ============================================

  const openAnnouncement = async (item) => {
    try {
      setAnnouncementLoading(true);

      /*
          The notification feed already contains
          the full announcement title/message.

          So we don't need another GET request
          just to display it.
        */

      setSelectedAnnouncement({
        ...item,
      });

      if (item.unread) {
        await api.patch(
          `/notifications/announcement/${item.announcementId}/read`,
        );

        // Update current list immediately.
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === item.id
              ? {
                  ...notification,
                  unread: false,
                }
              : notification,
          ),
        );

        await loadUnread();
        window.dispatchEvent(new Event("ewc-notifications-updated"));
      }
    } catch (error) {
      console.error("Open announcement:", error);

      setError(error.response?.data?.message || "Unable to open announcement.");
    } finally {
      setAnnouncementLoading(false);
    }
  };

  // ============================================
  // URL ANNOUNCEMENT
  //
  // Handles:
  // /notifications?announcement=12
  // ============================================

  useEffect(() => {
    const announcementId = Number(searchParams.get("announcement"));

    if (!Number.isInteger(announcementId) || announcementId < 1) {
      return;
    }

    const item = notifications.find(
      (notification) =>
        notification.type === "announcement" &&
        Number(notification.announcementId) === announcementId,
    );

    if (item) {
      openAnnouncement(item);
    }

    // We intentionally react when the loaded
    // notification list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  // ============================================
  // HELPERS
  // ============================================

  const tabCount = (key) => {
    if (key === "all") {
      return unread.total;
    }

    if (key === "support") {
      return unread.support;
    }

    return unread.announcements;
  };

  return (
    <UserLayout>
      <div className={styles.page}>
        {/* ======================================
          HEADER
      ====================================== */}

        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderIcon}>
            <Bell size={20} />
          </div>

          <div>
            <h1>Notifications</h1>

            <p>Support replies and EWC community announcements.</p>
          </div>
        </div>

        {/* ======================================
          SUMMARY
      ====================================== */}

        <div className={styles.summary}>
          <div>
            <span>Unread Notifications</span>

            <strong>{unread.total}</strong>
          </div>

          <div>
            <span>Support Replies</span>

            <strong>{unread.support}</strong>
          </div>

          <div>
            <span>Announcements</span>

            <strong>{unread.announcements}</strong>
          </div>
        </div>

        {/* ======================================
          PANEL
      ====================================== */}

        <section className={styles.panel}>
          {/* TABS */}

          <div className={styles.tabs}>
            {TABS.map((tab) => {
              const count = tabCount(tab.key);

              return (
                <button
                  type="button"
                  key={tab.key}
                  className={type === tab.key ? styles.activeTab : ""}
                  onClick={() => changeType(tab.key)}
                >
                  {tab.label}

                  {count > 0 && <span>{count > 99 ? "99+" : count}</span>}
                </button>
              );
            })}
          </div>

          {/* ERROR */}

          {error && <div className={styles.error}>{error}</div>}

          {/* CONTENT */}

          {loading ? (
            <div className={styles.state}>Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className={styles.emptyState}>
              <div>
                <CheckCircle2 size={24} />
              </div>

              <strong>You're up to date</strong>

              <p>There are no notifications in this section yet.</p>
            </div>
          ) : (
            <div className={styles.notificationList}>
              {notifications.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.notificationItem} ${
                    item.unread ? styles.unread : ""
                  }`}
                  onClick={() => openNotification(item)}
                >
                  <div
                    className={`${styles.typeIcon} ${
                      item.type === "support"
                        ? styles.supportIcon
                        : styles.announcementIcon
                    }`}
                  >
                    {item.type === "support" ? (
                      <MessageCircle size={18} />
                    ) : (
                      <Megaphone size={18} />
                    )}
                  </div>

                  <div className={styles.notificationBody}>
                    <div className={styles.notificationTitle}>
                      <div>
                        <span className={styles.typeLabel}>
                          {item.type === "support" ? "SUPPORT" : "ANNOUNCEMENT"}
                        </span>

                        <strong>{item.title}</strong>
                      </div>

                      {item.unread && (
                        <span className={styles.newBadge}>NEW</span>
                      )}
                    </div>

                    <p>{item.message}</p>

                    <div className={styles.notificationMeta}>
                      <span>{formatDate(item.createdAt)}</span>

                      <span>
                        {item.type === "support"
                          ? "Open support conversation"
                          : "Read announcement"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* PAGINATION */}

          {!loading && pagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadNotifications(pagination.page - 1)}
              >
                <ChevronLeft size={14} />
                Previous
              </button>

              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadNotifications(pagination.page + 1)}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </section>

        {/* ======================================
          ANNOUNCEMENT MODAL
      ====================================== */}

        {selectedAnnouncement && (
          <div
            className={styles.overlay}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedAnnouncement(null);
              }
            }}
          >
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <div>
                    <Megaphone size={18} />
                  </div>

                  <section>
                    <span>EWC ANNOUNCEMENT</span>

                    <h2>{selectedAnnouncement.title}</h2>
                  </section>
                </div>

                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setSelectedAnnouncement(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className={styles.modalContent}>
                {announcementLoading ? (
                  <div className={styles.state}>Loading...</div>
                ) : (
                  <>
                    <p>{selectedAnnouncement.message}</p>

                    <div className={styles.publishedDate}>
                      Published {formatDate(selectedAnnouncement.createdAt)}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default Notifications;
