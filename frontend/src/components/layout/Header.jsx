import { useCallback, useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import { useConnection, useBalance, useDisconnect } from "wagmi";

import { useWeb3Modal } from "@web3modal/wagmi/react";

import { formatUnits } from "viem";

import {
  Menu,
  Bell,
  Wallet,
  ChevronDown,
  UserRound,
  Settings,
  LogOut,
  Unplug,
  MessageCircle,
  Megaphone,
} from "lucide-react";

import api from "../../services/api";

import styles from "./Header.module.css";

const Header = ({ user, title, subtitle, onOpenSidebar }) => {
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);

  const [notificationOpen, setNotificationOpen] = useState(false);

  const [unreadCount, setUnreadCount] = useState(0);

  const [notifications, setNotifications] = useState([]);

  const [notificationLoading, setNotificationLoading] = useState(false);

  const notificationRef = useRef(null);

  const profileRef = useRef(null);

  // ============================================
  // WALLET
  // ============================================

  const connection = useConnection();

  const address = connection.address;

  const isConnected = connection.status === "connected";

  // const { disconnect } = useDisconnect();
  const disconnectWallet = useDisconnect();

  const { open } = useWeb3Modal();

  const { data: balanceData } = useBalance({
    address,
  });

  const shortAddress = (wallet) => {
    if (!wallet) {
      return "Connect Wallet";
    }

    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  // ============================================
  // NOTIFICATION COUNT
  // ============================================

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await api.get("/notifications/unread-count");

      setUnreadCount(Number(response.data?.data?.total || 0));
    } catch (error) {
      console.error("Notification count:", error);
    }
  }, []);

  // ============================================
  // RECENT NOTIFICATIONS
  // ============================================

  const loadRecentNotifications = useCallback(async () => {
    try {
      setNotificationLoading(true);

      const response = await api.get("/notifications/recent");

      setNotifications(response.data?.data?.notifications || []);
    } catch (error) {
      console.error("Recent notifications:", error);
    } finally {
      setNotificationLoading(false);
    }
  }, []);

  // ============================================
  // POLLING
  // ============================================

  useEffect(() => {
    loadUnreadCount();

    const interval = window.setInterval(loadUnreadCount, 15000);

    const handleFocus = () => {
      loadUnreadCount();

      if (notificationOpen) {
        loadRecentNotifications();
      }
    };

    window.addEventListener("focus", handleFocus);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadUnreadCount();

        if (notificationOpen) {
          loadRecentNotifications();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleNotificationUpdate = () => {
      loadUnreadCount();

      if (notificationOpen) {
        loadRecentNotifications();
      }
    };

    window.addEventListener(
      "ewc-notifications-updated",
      handleNotificationUpdate,
    );

    return () => {
      window.clearInterval(interval);

      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(
        "ewc-notifications-updated",
        handleNotificationUpdate,
      );

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadUnreadCount, loadRecentNotifications, notificationOpen]);

  // ============================================
  // OUTSIDE CLICK
  // ============================================

  useEffect(() => {
    const handleClick = (event) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target)
      ) {
        setNotificationOpen(false);
      }

      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  // ============================================
  // OPEN BELL
  // ============================================

  const toggleNotifications = async () => {
    const next = !notificationOpen;

    setNotificationOpen(next);
    setProfileOpen(false);

    if (next) {
      await Promise.all([loadUnreadCount(), loadRecentNotifications()]);
    }
  };

  // ============================================
  // CLICK NOTIFICATION
  // ============================================

  const openNotification = async (notification) => {
    try {
      if (notification.type === "announcement" && notification.unread) {
        await api.patch(
          `/notifications/announcement/${notification.announcementId}/read`,
        );

        await loadUnreadCount();
      }
    } catch (error) {
      console.error("Mark notification read:", error);
    }

    setNotificationOpen(false);

    navigate(notification.link || "/notifications");
  };

  // ============================================
  // LOGOUT
  // ============================================

 const logout = async () => {
  try {
    await disconnectWallet.mutateAsync();
  } catch (error) {
    console.error("Wallet disconnect error:", error);
  }

  localStorage.removeItem("ewc_token");
  localStorage.removeItem("ewc_user");
  sessionStorage.removeItem("ewc_token");
  sessionStorage.removeItem("ewc_user");

  navigate("/login", { replace: true });
};

  const handleWallet = () => {
    open();
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button className={styles.menuButton} onClick={onOpenSidebar}>
          <Menu size={23} />
        </button>

        <div>
          <h1>{title}</h1>

          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <div className={styles.headerActions}>
        {/* ==================================
            NOTIFICATIONS
        ================================== */}

        <div className={styles.notificationWrapper} ref={notificationRef}>
          <button
            type="button"
            className={styles.notificationButton}
            onClick={toggleNotifications}
            aria-label="Notifications"
          >
            <Bell size={20} />

            {unreadCount > 0 && (
              <span className={styles.notificationBadge}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {notificationOpen && (
            <div className={styles.notificationDropdown}>
              <div className={styles.notificationHeader}>
                <div>
                  <strong>Notifications</strong>

                  <span>
                    {unreadCount > 0
                      ? `${unreadCount} unread`
                      : "You're up to date"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setNotificationOpen(false);

                    navigate("/notifications");
                  }}
                >
                  View all
                </button>
              </div>

              <div className={styles.notificationList}>
                {notificationLoading ? (
                  <div className={styles.notificationState}>Loading...</div>
                ) : notifications.length === 0 ? (
                  <div className={styles.notificationState}>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.notificationItem} ${
                        item.unread ? styles.notificationUnread : ""
                      }`}
                      onClick={() => openNotification(item)}
                    >
                      <div className={styles.notificationTypeIcon}>
                        {item.type === "support" ? (
                          <MessageCircle size={16} />
                        ) : (
                          <Megaphone size={16} />
                        )}
                      </div>

                      <div className={styles.notificationContent}>
                        <div>
                          <strong>{item.title}</strong>

                          {item.unread && <i />}
                        </div>

                        <p>{item.message}</p>

                        <span>{formatNotificationDate(item.createdAt)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                className={styles.notificationFooter}
                onClick={() => {
                  setNotificationOpen(false);

                  navigate("/notifications");
                }}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>

        {/* WALLET */}

        <button className={styles.walletButton} onClick={handleWallet}>
          <Wallet size={18} />

          {!isConnected ? (
            <span>Connect Wallet</span>
          ) : (
            <div className={styles.walletInfo}>
              <span className={styles.walletAddress}>
                {shortAddress(address)}
              </span>

              <span className={styles.walletDivider} />

              <span className={styles.walletBalance}>
                {balanceData?.value !== undefined
                  ? `${Number(
                      formatUnits(balanceData.value, balanceData.decimals),
                    ).toFixed(4)} ${balanceData.symbol || "BNB"}`
                  : "..."}
              </span>
            </div>
          )}
        </button>

        {/* PROFILE */}

        <div className={styles.profileWrapper} ref={profileRef}>
          <button
            className={styles.profileButton}
            onClick={() => {
              setProfileOpen((prev) => !prev);

              setNotificationOpen(false);
            }}
          >
            <div className={styles.headerAvatar}>
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            <div className={styles.profileName}>
              <strong>{user?.name || "EWC Member"}</strong>

              <span>@{user?.user_id || "member"}</span>
            </div>

            <ChevronDown size={16} />
          </button>

          {profileOpen && (
            <div className={styles.profileDropdown}>
              <button onClick={() => navigate("/profile")}>
                <UserRound size={17} />
                My Profile
              </button>

              <button onClick={() => navigate("/settings")}>
                <Settings size={17} />
                Settings
              </button>

              {isConnected && (
                <button
                  onClick={() => {
                    disconnectWallet.mutateAsync();

                    setProfileOpen(false);
                  }}
                >
                  <Unplug size={17} />
                  Disconnect Wallet
                </button>
              )}

              <button onClick={logout}>
                <LogOut size={17} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const formatNotificationDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diff = Date.now() - date.getTime();

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
    month: "short",
    day: "numeric",
  });
};

export default Header;
