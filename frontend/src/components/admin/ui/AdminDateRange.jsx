import { CalendarDays } from "lucide-react";
import styles from "./AdminUI.module.css";

const AdminDateRange = ({
  from,
  to,
  onFromChange,
  onToChange,
}) => {
  return (
    <div className={styles.dateRange}>
      <div className={styles.dateInput}>
        <CalendarDays size={15} />

        <input
          type="date"
          value={from || ""}
          onChange={(e) =>
            onFromChange(e.target.value)
          }
        />
      </div>

      <span className={styles.dateSeparator}>
        to
      </span>

      <div className={styles.dateInput}>
        <CalendarDays size={15} />

        <input
          type="date"
          value={to || ""}
          onChange={(e) =>
            onToChange(e.target.value)
          }
        />
      </div>
    </div>
  );
};

export default AdminDateRange;