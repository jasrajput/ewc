import { ChevronDown } from "lucide-react";
import styles from "./AdminUI.module.css";

const AdminSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  name,
  disabled = false,
}) => {
  return (
    <div className={styles.selectWrapper}>
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value)
        }
      >
        {placeholder && (
          <option value="">
            {placeholder}
          </option>
        )}

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={15}
        className={styles.selectIcon}
      />
    </div>
  );
};

export default AdminSelect;