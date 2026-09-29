import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  Bell,
  Menu,
  ShieldCheck,
} from "lucide-react";

import adminApi from "../../../services/adminApi";

import styles from "./AdminLayout.module.css";


const AdminHeader = ({
  title,
  subtitle,
  onMenuClick,
}) => {
  const navigate =
    useNavigate();

  const [
    unreadSupport,
    setUnreadSupport,
  ] = useState(0);


  let admin = null;

  try {
    const raw =
      localStorage.getItem(
        "ewc_admin_user"
      ) ||
      sessionStorage.getItem(
        "ewc_admin_user"
      );

    admin =
      raw
        ? JSON.parse(raw)
        : null;

  } catch {
    admin = null;
  }


  const username =
    admin?.username ||
    "Administrator";


  // ============================================
  // SUPPORT NOTIFICATIONS
  // ============================================

  const loadUnreadSupport =
    useCallback(async () => {
      try {
        const response =
          await adminApi.get(
            "/admin/support/summary"
          );

        setUnreadSupport(
          Number(
            response.data?.data
              ?.unreadTickets || 0
          )
        );

      } catch (error) {
        console.error(
          "Admin support notification:",
          error
        );
      }
    }, []);


  useEffect(() => {
    loadUnreadSupport();


    const interval =
      window.setInterval(
        loadUnreadSupport,
        45000
      );


    const handleFocus = () => {
      loadUnreadSupport();
    };


    window.addEventListener(
      "focus",
      handleFocus
    );


    return () => {
      window.clearInterval(
        interval
      );

      window.removeEventListener(
        "focus",
        handleFocus
      );
    };
  }, [loadUnreadSupport]);


  return (
    <header className={styles.header}>

      <div
        className={
          styles.headerLeft
        }
      >
        <button
          type="button"
          className={
            styles.menuButton
          }
          onClick={
            onMenuClick
          }
          aria-label="Open navigation"
        >
          <Menu size={21} />
        </button>

        <div>
          <h1>{title}</h1>

          {subtitle && (
            <p>{subtitle}</p>
          )}
        </div>
      </div>


      <div
        className={
          styles.headerRight
        }
      >
        <button
          type="button"
          className={
            styles.iconButton
          }
          aria-label={
            unreadSupport > 0
              ? `${unreadSupport} unread support tickets`
              : "No unread support tickets"
          }
          onClick={() =>
            navigate(
              unreadSupport > 0
                ? "/admin/support?unread=1"
                : "/admin/support"
            )
          }
        >
          <Bell size={18} />


          {unreadSupport > 0 && (
            <span
              className={
                styles.adminNotificationBadge
              }
            >
              {unreadSupport > 99
                ? "99+"
                : unreadSupport}
            </span>
          )}
        </button>


        <div
          className={
            styles.headerAdmin
          }
        >
          <div
            className={
              styles.headerAvatar
            }
          >
            <ShieldCheck
              size={17}
            />
          </div>

          <div>
            <strong>
              {username}
            </strong>

            <span>
              Administrator
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};


export default AdminHeader;