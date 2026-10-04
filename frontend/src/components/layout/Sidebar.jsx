import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  UsersRound,
  Trophy,
  ReceiptText,
  Settings,
  LogOut,
  X,
  ChevronDown,
  ChevronRight,
  Package,
  CircleDollarSign,
  UserRound,
  BanknoteArrowDown,
  Lock,
  LifeBuoy,
  Bell,
} from "lucide-react";

import {  useDisconnect } from "wagmi";

import styles from "./Sidebar.module.css";

const Sidebar = ({ user, open, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const disconnectWallet = useDisconnect();

  const [openMenus, setOpenMenus] = useState({
    earnings:
      location.pathname.startsWith("/earnings") ||
      location.pathname === "/claim",
    network: location.pathname.startsWith("/network"),
    withdrawal: location.pathname.startsWith("/withdrawal"),
    account:
      location.pathname === "/profile" ||
      location.pathname === "/wallet" ||
      location.pathname === "/security",
  });

  // Keep the current section open when route changes
  useEffect(() => {
    setOpenMenus((prev) => ({
      ...prev,
      earnings:
        location.pathname.startsWith("/earnings") ||
        location.pathname === "/claim"
          ? true
          : prev.earnings,

      network: location.pathname.startsWith("/network") ? true : prev.network,
      withdrawal: location.pathname.startsWith("/withdrawal")
        ? true
        : prev.withdrawal,

      account:
        location.pathname === "/profile" ||
        location.pathname === "/wallet" ||
        location.pathname === "/security"
          ? true
          : prev.account,
    }));
  }, [location.pathname]);

  const toggleMenu = (menu) => {
    setOpenMenus((prev) => ({
      ...prev,
      [menu]: !prev[menu],
    }));
  };

  const goTo = (path) => {
    navigate(path);
    onClose();
  };

  const isActive = (path) => location.pathname === path;

  const isSectionActive = (section) => {
    if (section === "earnings") {
      return (
        location.pathname.startsWith("/earnings") ||
        location.pathname === "/claim"
      );
    }

    if (section === "network") {
      return location.pathname.startsWith("/network");
    }

    if (section === "account") {
      return (
        location.pathname === "/profile" ||
        location.pathname === "/wallet" ||
        location.pathname === "/security"
      );
    }

    return false;
  };

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

  return (
    <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
      <div className={styles.sidebarHeader}>
        <div className={styles.brand}>
          <div className={styles.logoMark}>E</div>

          <div>
            <strong>EWC</strong>
            <span>Elevate World Community</span>
          </div>
        </div>

        <button className={styles.mobileClose} onClick={onClose}>
          <X size={21} />
        </button>
      </div>

      <div className={styles.sidebarUser}>
        <div className={styles.userAvatar}>
          {user?.name?.charAt(0)?.toUpperCase() || "U"}
        </div>

        <div>
          <strong>{user?.name || "EWC Member"}</strong>
          <span>@{user?.user_id || "member"}</span>
        </div>
      </div>

      <nav className={styles.navigation}>
        {/* DASHBOARD */}

        <button
          className={`${styles.navItem} ${
            isActive("/dashboard") ? styles.activeNav : ""
          }`}
          onClick={() => goTo("/dashboard")}
        >
          <LayoutDashboard size={19} />
          <span>Dashboard</span>
        </button>

        {/* ACCOUNT */}

        <div className={styles.navGroup}>
          <button
            className={`${styles.navItem} ${
              isSectionActive("account") ? styles.activeNav : ""
            }`}
            onClick={() => toggleMenu("account")}
          >
            <UserRound size={19} />
            <span>Account</span>

            {openMenus.account ? (
              <ChevronDown className={styles.navArrow} size={17} />
            ) : (
              <ChevronRight className={styles.navArrow} size={17} />
            )}
          </button>

          {openMenus.account && (
            <div className={styles.subMenu}>
              <button
                className={isActive("/profile") ? styles.activeSubMenu : ""}
                onClick={() => goTo("/profile")}
              >
                <span />
                Profile
              </button>

              <button
                className={isActive("/wallet") ? styles.activeSubMenu : ""}
                onClick={() => goTo("/wallet")}
              >
                <span />
                Wallet
              </button>

              <button
                className={isActive("/security") ? styles.activeSubMenu : ""}
                onClick={() => goTo("/security")}
              >
                <span />
                Security
              </button>
            </div>
          )}
        </div>

        {/* INVESTMENT */}

        <button
          className={`${styles.navItem} ${
            isActive("/investment") ? styles.activeNav : ""
          }`}
          onClick={() => goTo("/investment")}
        >
          <Package size={19} />
          <span>Investment</span>
        </button>

        {/* EARNINGS */}

        <div className={styles.navGroup}>
          <button
            className={`${styles.navItem} ${
              isSectionActive("earnings") ? styles.activeNav : ""
            }`}
            onClick={() => toggleMenu("earnings")}
          >
            <CircleDollarSign size={19} />
            <span>Earnings</span>

            {openMenus.earnings ? (
              <ChevronDown className={styles.navArrow} size={17} />
            ) : (
              <ChevronRight className={styles.navArrow} size={17} />
            )}
          </button>

          {openMenus.earnings && (
            <div className={styles.subMenu}>
              <button
                className={
                  isActive("/earnings/reward") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/earnings/reward")}
              >
                <span />
                Reward Income
              </button>

              <button
                className={
                  isActive("/earnings/direct") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/earnings/direct")}
              >
                <span />
                Direct Income
              </button>

              <button
                className={
                  isActive("/earnings/rank") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/earnings/rank")}
              >
                <span />
                Rank Income
              </button>

              <button
                className={
                  isActive("/earnings/salary") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/earnings/salary")}
              >
                <span />
                Rank Salary
              </button>

              {/* <button
                className={isActive("/claim") ? styles.activeSubMenu : ""}
                onClick={() => goTo("/claim")}
              >
                <span />
                Claim Rewards
              </button> */}
            </div>
          )}
        </div>

        {/* RANK */}

        <button
          className={`${styles.navItem} ${
            isActive("/rank") ? styles.activeNav : ""
          }`}
          onClick={() => goTo("/rank")}
        >
          <Trophy size={19} />
          <span>Rank & Progress</span>
        </button>

        {/* NETWORK */}

        <div className={styles.navGroup}>
          <button
            className={`${styles.navItem} ${
              isSectionActive("network") ? styles.activeNav : ""
            }`}
            onClick={() => toggleMenu("network")}
          >
            <UsersRound size={19} />
            <span>My Team</span>

            {openMenus.network ? (
              <ChevronDown className={styles.navArrow} size={17} />
            ) : (
              <ChevronRight className={styles.navArrow} size={17} />
            )}
          </button>

          {openMenus.network && (
            <div className={styles.subMenu}>
              <button
                className={
                  isActive("/network/directs") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/network/directs")}
              >
                <span />
                Direct Partners
              </button>

              <button
                className={
                  isActive("/network/community") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/network/community")}
              >
                <span />
                Community
              </button>

              <button
                className={
                  isActive("/network/levels") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/network/levels")}
              >
                <span />
                Level Genealogy
              </button>

              <button
                className={
                  isActive("/network/tree") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/network/tree")}
              >
                <span />
                Network Tree
              </button>
            </div>
          )}
        </div>

        {/* WITHDRAWAL */}

        <div className={styles.navGroup}>
          <button
            className={`${styles.navItem} ${
              location.pathname.startsWith("/withdrawal")
                ? styles.activeNav
                : ""
            }`}
            onClick={() => toggleMenu("withdrawal")}
          >
            <BanknoteArrowDown size={19} />
            <span>Withdrawal</span>

            {openMenus.withdrawal ? (
              <ChevronDown className={styles.navArrow} size={17} />
            ) : (
              <ChevronRight className={styles.navArrow} size={17} />
            )}
          </button>

          {openMenus.withdrawal && (
            <div className={styles.subMenu}>
              <button
                className={isActive("/withdrawal") ? styles.activeSubMenu : ""}
                onClick={() => goTo("/withdrawal")}
              >
                <span />
                Withdraw
              </button>

              <button
                className={
                  isActive("/withdrawal/history") ? styles.activeSubMenu : ""
                }
                onClick={() => goTo("/withdrawal/history")}
              >
                <span />
                Withdrawal History
              </button>
            </div>
          )}
        </div>

        {/* Support */}
        <button
          className={`${styles.navItem} ${
            isActive("/support") ? styles.activeNav : ""
          }`}
          onClick={() => goTo("/support")}
        >
          <LifeBuoy size={19} />
          <span>Support</span>
        </button>

        {/* Notifications */}
        <button
          className={`${styles.navItem} ${
            isActive("/notifications") ? styles.activeNav : ""
          }`}
          onClick={() => goTo("/notifications")}
        >
          <Bell size={19} />
          <span>Notifications</span>
        </button>
      </nav>

      <div className={styles.sidebarBottom}>
        <button
          className={`${styles.navItem} ${
            isActive("/security") ? styles.activeNav : ""
          }`}
          onClick={() => goTo("/security")}
        >
          <Lock size={19} />
          <span>Security</span>
        </button>

        <button
          className={`${styles.navItem} ${styles.logoutButton}`}
          onClick={logout}
        >
          <LogOut size={19} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
