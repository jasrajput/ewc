import styles from "./AdminUI.module.css";

const AdminStatusBadge = ({
  children,
  variant = "neutral",
}) => {
  return (
    <span
      className={`
        ${styles.badge}
        ${styles[`badge_${variant}`]}
      `}
    >
      <span className={styles.badgeDot} />
      {children}
    </span>
  );
};

export default AdminStatusBadge;