import styles from "./AdminUI.module.css";

const AdminPageHeader = ({
  eyebrow,
  title,
  description,
  actions,
}) => {
  return (
    <div className={styles.pageHeader}>
      <div>
        {eyebrow && (
          <span
            className={styles.pageEyebrow}
          >
            {eyebrow}
          </span>
        )}

        <h2>{title}</h2>

        {description && (
          <p>{description}</p>
        )}
      </div>

      {actions && (
        <div
          className={styles.pageActions}
        >
          {actions}
        </div>
      )}
    </div>
  );
};

export default AdminPageHeader;