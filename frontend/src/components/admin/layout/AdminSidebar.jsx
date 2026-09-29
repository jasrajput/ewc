import {
  Activity,
  BarChart3,
  CircleDollarSign,
  FileText,
  Gauge,
  GitBranch,
  Landmark,
  LayoutDashboard,
  LogOut,
  Network,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  WalletCards,
  LifeBuoy,
  Megaphone,
} from "lucide-react";

import { NavLink, useNavigate } from "react-router-dom";

import styles from "./AdminLayout.module.css";

const NAVIGATION = [
  {
    label: "OVERVIEW",
    items: [
      {
        name: "Dashboard",
        path: "/admin/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },

  {
    label: "MANAGEMENT",
    items: [
      {
        name: "Members",
        path: "/admin/members",
        icon: Users,
      },
      {
        name: "Investments",
        path: "/admin/investments",
        icon: CircleDollarSign,
      },
      {
        name: "Network",
        path: "/admin/network",
        icon: Network,
      },
      {
        name: "Ranks",
        path: "/admin/ranks",
        icon: BarChart3,
      },
    ],
  },

  {
    label: "FINANCE",
    items: [
      {
        name: "Earnings",
        path: "/admin/earnings",
        icon: Activity,
      },
      {
        name: "Withdrawals",
        path: "/admin/withdrawals",
        icon: WalletCards,
      },
      {
        name: "Closing Runs",
        path: "/admin/closing-runs",
        icon: GitBranch,
      },
      {
        name: "Transactions",
        path: "/admin/transactions",
        icon: FileText,
      },
    ],
  },

  {
    label: "PLATFORM",
    items: [
      {
        name: "Audit Logs",
        path: "/admin/audit-logs",
        icon: ShieldCheck,
      },
    ],
  },

  {
    label: "COMMUNICATION",
    items: [
      {
        name: "Support Tickets",
        path: "/admin/support",
        icon: LifeBuoy,
      },
      {
        name: "Announcements",
        path: "/admin/announcements",
        icon: Megaphone,
      },
    ],
  },
];

const AdminSidebar = ({ open, onClose }) => {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("ewc_admin_token");

    localStorage.removeItem("ewc_admin_user");

    sessionStorage.removeItem("ewc_admin_token");

    sessionStorage.removeItem("ewc_admin_user");

    navigate("/admin/login", {
      replace: true,
    });
  };

  return (
    <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
      <div className={styles.sidebarBrand}>
        <div className={styles.brandLogo}>E</div>

        <div className={styles.brandContent}>
          <strong>EWC</strong>
          <span>ADMINISTRATION</span>
        </div>
      </div>

      <div className={styles.adminIdentity}>
        <div className={styles.adminAvatar}>
          <ShieldCheck size={18} />
        </div>

        <div>
          <strong>Administrator</strong>
          <span>System Control</span>
        </div>
      </div>

      <nav className={styles.navigation}>
        {NAVIGATION.map((section) => (
          <div className={styles.navSection} key={section.label}>
            <span className={styles.navLabel}>{section.label}</span>

            {section.items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `${styles.navItem} ${isActive ? styles.navItemActive : ""}`
                  }
                >
                  <Icon size={18} strokeWidth={1.8} />

                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        <button type="button" onClick={logout} className={styles.logoutButton}>
          <LogOut size={17} />

          <span>Sign Out</span>
        </button>

        <div className={styles.version}>EWC Admin v1.0</div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
