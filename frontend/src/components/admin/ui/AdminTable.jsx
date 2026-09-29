import AdminEmptyState from "./AdminEmptyState";
import AdminLoader from "./AdminLoader";
import styles from "./AdminUI.module.css";

const AdminTable = ({
  columns = [],
  data = [],
  loading = false,
  emptyTitle = "No records found",
  emptyMessage = "There are no records to display.",
  rowKey = "id",
  onRowClick,
}) => {
  if (loading) {
    return (
      <div className={styles.tableState}>
        <AdminLoader text="Loading records..." />
      </div>
    );
  }

  if (!data.length) {
    return (
      <AdminEmptyState
        title={emptyTitle}
        message={emptyMessage}
      />
    );
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  width: column.width,
                  textAlign:
                    column.align || "left",
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, index) => (
            <tr
              key={
                typeof rowKey === "function"
                  ? rowKey(row, index)
                  : row[rowKey] ?? index
              }
              className={
                onRowClick
                  ? styles.clickableRow
                  : ""
              }
              onClick={
                onRowClick
                  ? () => onRowClick(row)
                  : undefined
              }
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    textAlign:
                      column.align || "left",
                  }}
                >
                  {column.render
                    ? column.render(
                        row,
                        index
                      )
                    : row[column.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminTable;