import {
  MoreHorizontal,
} from "lucide-react";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./AdminUI.module.css";

const AdminActionMenu = ({
  actions = [],
}) => {
  const [open, setOpen] =
    useState(false);

  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(
          event.target
        )
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleOutside
      );
  }, []);

  return (
    <div
      className={styles.actionMenu}
      ref={menuRef}
      onClick={(e) =>
        e.stopPropagation()
      }
    >
      <button
        type="button"
        className={styles.actionTrigger}
        onClick={() =>
          setOpen((prev) => !prev)
        }
        aria-label="Actions"
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <div
          className={styles.actionDropdown}
        >
          {actions.map(
            ({
              label,
              icon: Icon,
              onClick,
              danger = false,
              disabled = false,
            }) => (
              <button
                type="button"
                key={label}
                disabled={disabled}
                className={
                  danger
                    ? styles.actionDanger
                    : ""
                }
                onClick={() => {
                  if (disabled) return;

                  setOpen(false);
                  onClick?.();
                }}
              >
                {Icon && (
                  <Icon size={15} />
                )}

                <span>{label}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default AdminActionMenu;