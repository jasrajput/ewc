import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import styles from "./AdminUI.module.css";

const AdminPagination = ({
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 20,
  onPageChange,
}) => {
  if (totalPages <= 0) {
    return null;
  }

  const start =
    total === 0
      ? 0
      : (page - 1) * limit + 1;

  const end = Math.min(
    page * limit,
    total
  );

  const pages = [];

  const startPage = Math.max(
    1,
    page - 2
  );

  const endPage = Math.min(
    totalPages,
    page + 2
  );

  for (
    let current = startPage;
    current <= endPage;
    current++
  ) {
    pages.push(current);
  }

  return (
    <div className={styles.pagination}>
      <div className={styles.paginationInfo}>
        Showing{" "}
        <strong>
          {start}-{end}
        </strong>{" "}
        of <strong>{total}</strong> records
      </div>

      <div className={styles.paginationControls}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() =>
            onPageChange(page - 1)
          }
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {startPage > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                onPageChange(1)
              }
            >
              1
            </button>

            {startPage > 2 && (
              <span>...</span>
            )}
          </>
        )}

        {pages.map((number) => (
          <button
            key={number}
            type="button"
            className={
              number === page
                ? styles.paginationActive
                : ""
            }
            onClick={() =>
              onPageChange(number)
            }
          >
            {number}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage <
              totalPages - 1 && (
              <span>...</span>
            )}

            <button
              type="button"
              onClick={() =>
                onPageChange(totalPages)
              }
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() =>
            onPageChange(page + 1)
          }
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default AdminPagination;