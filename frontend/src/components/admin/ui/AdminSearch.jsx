import { Search, X } from "lucide-react";
import styles from "./AdminUI.module.css";

const AdminSearch = ({
  value,
  onChange,
  placeholder = "Search...",
}) => {
  return (
    <div className={styles.search}>
      <Search
        size={17}
        className={styles.searchIcon}
      />

      <input
        type="text"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
      />

      {value && (
        <button
          type="button"
          className={styles.searchClear}
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
};

export default AdminSearch;