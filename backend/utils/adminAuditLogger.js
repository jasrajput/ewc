const db = require("../config/db");


const logAdminAction = async ({
  req,

  action,
  entityType,
  entityId = null,
  entityUserId = null,

  fieldName = null,

  oldValue = null,
  newValue = null,

  description = null,
}) => {
  try {
    const adminUser =
      req.admin?.username || "unknown";

    const ipAddress =
      req.headers["x-forwarded-for"]
        ?.split(",")[0]
        ?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const userAgent =
      req.headers["user-agent"] || null;

    await db.execute(
      `
        INSERT INTO admin_audit_logs
        (
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
          user_agent
        )

        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        adminUser,
        action,
        entityType,
        entityId,
        entityUserId,
        fieldName,
        oldValue !== null
          ? String(oldValue)
          : null,
        newValue !== null
          ? String(newValue)
          : null,
        description,
        ipAddress,
        userAgent,
      ]
    );
  } catch (error) {
    // Audit failure should be visible in logs.
    //
    // For now it does not undo the main operation.
    // Later, highly sensitive operations can use a DB
    // transaction if we want audit + mutation atomic.
    console.error(
      "Admin audit log error:",
      error
    );
  }
};


module.exports = {
  logAdminAction,
};