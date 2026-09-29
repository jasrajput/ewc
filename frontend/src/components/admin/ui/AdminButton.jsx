import styles from "./AdminUI.module.css";

const AdminButton = ({
  children,
  variant = "secondary",
  size = "medium",
  icon: Icon,
  type = "button",
  className = "",
  ...props
}) => {
  return (
    <button
      type={type}
      className={`
        ${styles.button}
        ${styles[`button_${variant}`]}
        ${styles[`button_${size}`]}
        ${className}
      `}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={1.9} />}
      <span>{children}</span>
    </button>
  );
};

export default AdminButton;