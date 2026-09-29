import {
  X,
} from "lucide-react";

import {
  useEffect,
} from "react";

import styles from "./AdminUI.module.css";

const AdminModal = ({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = "medium",
}) => {
  useEffect(() => {
    if (!open) return;

    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener(
      "keydown",
      handleKey
    );

    return () =>
      document.removeEventListener(
        "keydown",
        handleKey
      );
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.modalOverlay}
      onMouseDown={(e) => {
        if (
          e.target === e.currentTarget
        ) {
          onClose?.();
        }
      }}
    >
      <div
        className={`
          ${styles.modal}
          ${styles[`modal_${size}`]}
        `}
        role="dialog"
        aria-modal="true"
      >
        <div
          className={styles.modalHeader}
        >
          <div>
            <h3>{title}</h3>

            {description && (
              <p>{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className={styles.modalContent}
        >
          {children}
        </div>

        {footer && (
          <div
            className={styles.modalFooter}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminModal;