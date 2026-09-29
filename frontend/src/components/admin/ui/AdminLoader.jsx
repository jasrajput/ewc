import styles from "./AdminUI.module.css";

const AdminLoader = ({
  text = "Loading...",
}) => {
  return (
    <div className={styles.loader}>
      <span className={styles.spinner} />
      <span>{text}</span>
    </div>
  );
};

export default AdminLoader;