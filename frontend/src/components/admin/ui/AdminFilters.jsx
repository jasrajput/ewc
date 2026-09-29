import {
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";

import AdminButton from "./AdminButton";
import styles from "./AdminUI.module.css";

const AdminFilters = ({
  children,
  onReset,
  title = "Filters",
}) => {
  return (
    <section className={styles.filters}>
      <div className={styles.filtersHeader}>
        <div className={styles.filtersTitle}>
          <SlidersHorizontal size={16} />
          <span>{title}</span>
        </div>

        {onReset && (
          <AdminButton
            variant="ghost"
            size="small"
            icon={RotateCcw}
            onClick={onReset}
          >
            Reset
          </AdminButton>
        )}
      </div>

      <div className={styles.filtersContent}>
        {children}
      </div>
    </section>
  );
};

export default AdminFilters;