import styles from "./AdminUI.module.css";

const AdminFormField = ({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder = "",
  required = false,
  disabled = false,
  error = "",
  hint = "",
  autoComplete,
}) => {
  return (
    <div className={styles.formField}>
      <label htmlFor={name}>
        {label}

        {required && (
          <span
            className={styles.required}
          >
            *
          </span>
        )}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className={
          error
            ? styles.inputError
            : ""
        }
      />

      {error ? (
        <span
          className={styles.fieldError}
        >
          {error}
        </span>
      ) : hint ? (
        <span
          className={styles.fieldHint}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
};

export default AdminFormField;