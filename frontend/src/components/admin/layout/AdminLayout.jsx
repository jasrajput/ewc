import {
  useEffect,
  useState,
} from "react";

import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";

import styles from "./AdminLayout.module.css";

const AdminLayout = ({
  children,
  title,
  subtitle,
}) => {
  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  useEffect(() => {
    document.body.style.margin = "0";

    return () => {
      document.body.style.margin = "";
    };
  }, []);

  return (
    <div className={styles.adminLayout}>
      <AdminSidebar
        open={sidebarOpen}
        onClose={() =>
          setSidebarOpen(false)
        }
      />

      {sidebarOpen && (
        <button
          className={styles.overlay}
          onClick={() =>
            setSidebarOpen(false)
          }
          aria-label="Close navigation"
        />
      )}

      <div className={styles.main}>
        <AdminHeader
          title={title}
          subtitle={subtitle}
          onMenuClick={() =>
            setSidebarOpen(true)
          }
        />

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;