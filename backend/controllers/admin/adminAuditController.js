const db = require(
  "../../config/db"
);


const getAuditLogs = async (
  req,
  res
) => {
  try {
    const {
      search = "",
      action = "",
      entityType = "",
      from = "",
      to = "",
      page = 1,
      limit = 20,
    } = req.query;


    const currentPage =
      Math.max(
        Number(page) || 1,
        1
      );

    const pageLimit =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

    const offset =
      (currentPage - 1) *
      pageLimit;


    // ========================================
    // WHERE
    // ========================================

    const where = [];
    const params = [];


    if (search.trim()) {
      const term =
        `%${search.trim()}%`;

      where.push(`
        (
          admin_user LIKE ?
          OR entity_user_id LIKE ?
          OR action LIKE ?
          OR description LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term
      );
    }


    if (action.trim()) {
      where.push(
        "action = ?"
      );

      params.push(
        action.trim()
      );
    }


    if (entityType.trim()) {
      where.push(
        "entity_type = ?"
      );

      params.push(
        entityType.trim()
      );
    }


    if (from) {
      where.push(
        "created_at >= ?"
      );

      params.push(
        `${from} 00:00:00`
      );
    }


    if (to) {
      where.push(
        "created_at <= ?"
      );

      params.push(
        `${to} 23:59:59`
      );
    }


    const whereSql =
      where.length
        ? `WHERE ${where.join(
            " AND "
          )}`
        : "";


    // ========================================
    // COUNT
    // ========================================

    const [countRows] =
      await db.execute(
        `
          SELECT COUNT(*) AS total

          FROM admin_audit_logs

          ${whereSql}
        `,
        params
      );


    const total =
      Number(
        countRows[0]?.total || 0
      );


    // ========================================
    // LOGS
    // ========================================

    const queryParams = [
      ...params,
      pageLimit,
      offset,
    ];


    const [rows] =
      await db.execute(
        `
          SELECT
            id,
            admin_user,
            action,
            entity_type,
            entity_id,
            entity_user_id,
            field_name,
            old_value,
            new_value,
            description,
            ip_address,
            created_at

          FROM admin_audit_logs

          ${whereSql}

          ORDER BY id DESC

          LIMIT ? OFFSET ?
        `,
        queryParams
      );


    return res.status(200).json({
      success: true,

      data: {
        logs: rows,

        pagination: {
          page: currentPage,
          limit: pageLimit,
          total,

          totalPages:
            Math.ceil(
              total / pageLimit
            ),
        },
      },
    });
  } catch (error) {
    console.error(
      "Admin audit logs error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to load audit logs.",
    });
  }
};


module.exports = {
  getAuditLogs,
};