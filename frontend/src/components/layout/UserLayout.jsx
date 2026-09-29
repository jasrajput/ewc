
import { useState } from "react";
import Sidebar from "./Sidebar";
import MobileBottomNav from "./MobileBottomNav";
import Header from "./Header";
import styles from "./UserLayout.module.css";

const UserLayout = ({
  children,
  user,
  title = "Dashboard",
  subtitle = "",
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={styles.layout}>
      {sidebarOpen && (
        <button
          className={styles.overlay}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <Sidebar
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className={styles.main}>
        <Header
          user={user}
          title={title}
          subtitle={subtitle}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <main className={styles.content}>
          {children}
        </main>

         <MobileBottomNav />
      </div>
    </div>
  );
};

export default UserLayout;