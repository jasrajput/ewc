import {
  Inbox,
} from "lucide-react";

import styles from "./AdminUI.module.css";

const AdminEmptyState = ({
  title = "No records found",
  message = "There are no records to display.",
  icon: Icon = Inbox,
}) => {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <Icon size={23} />
      </div>

      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
};

export default AdminEmptyState;