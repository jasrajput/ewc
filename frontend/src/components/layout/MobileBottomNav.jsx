import { useLocation, useNavigate } from "react-router-dom";
import {
  House,
  Package,
  BadgeDollarSign,
  Users,
  UserRound,
} from "lucide-react";

import styles from "./MobileBottomNav.module.css";

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      label: "Home",
      icon: House,
      path: "/dashboard",
      active: location.pathname === "/dashboard",
    },
    {
      label: "Invest",
      icon: Package,
      path: "/investment",
      active: location.pathname.startsWith("/investment"),
    },
    {
      label: "Income",
      icon: BadgeDollarSign,
      path: "/earnings/reward",
      center: true,
      active:
        location.pathname.startsWith("/earnings") ||
        location.pathname === "/claim" ||
        location.pathname.startsWith("/withdrawal"),
    },
    {
      label: "Team",
      icon: Users,
      path: "/network/community",
      active: location.pathname.startsWith("/network"),
    },
    {
      label: "Account",
      icon: UserRound,
      path: "/profile",
      active:
        location.pathname === "/profile" ||
        location.pathname === "/wallet" ||
        location.pathname === "/settings",
    },
  ];

  return (
    <nav className={styles.mobileNav}>
      {navItems.map((item) => {
        const Icon = item.icon;

        if (item.center) {
          return (
            <button
              key={item.label}
              className={`${styles.navItem} ${styles.centerItem} ${
                item.active ? styles.active : ""
              }`}
              onClick={() => navigate(item.path)}
            >
              <span className={styles.centerButton}>
                <Icon size={22} />
              </span>

              <span className={styles.label}>
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.label}
            className={`${styles.navItem} ${
              item.active ? styles.active : ""
            }`}
            onClick={() => navigate(item.path)}
          >
            <span className={styles.icon}>
              <Icon size={20} />
            </span>

            <span className={styles.label}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;