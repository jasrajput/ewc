const db = require("../../config/db");


// ======================================================
// HELPERS
// ======================================================

const cleanText = (value) =>
  String(value || "").trim();


const getAdminUsername = (req) =>
  cleanText(req.admin?.username) || "admin";


const formatTicket = (row) => ({
  id: Number(row.id),

  member: {
    id: Number(row.member_id),
    userId: row.user_id || "",
    name: row.name || "",
    email: row.email || "",
    mobile: row.mobile_no || "",
    wallet: row.trx || "",
  },

  subject: row.subject || "",
  category: row.category || null,
  status: row.status || "open",

  unread:
    Number(row.unread_count || 0) > 0,

  unreadCount:
    Number(row.unread_count || 0),

  lastMessage:
    row.last_message || null,

  lastMessageAt:
    row.last_message_at || null,

  lastSenderType:
    row.last_sender_type || null,

  createdAt:
    row.created_at || null,

  updatedAt:
    row.updated_at || null,
});


const formatMessage = (row) => ({
  id: Number(row.id),
  ticketId: Number(row.ticket_id),

  senderType:
    row.sender_type,

  senderId:
    row.sender_id,

  message:
    row.message || "",

  createdAt:
    row.created_at || null,
});


// ======================================================
// SUMMARY
//
// GET /api/admin/support/summary
// ======================================================

const getSupportSummary = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT

        COUNT(*) AS totalTickets,

        SUM(
          CASE
            WHEN st.status = 'open'
            THEN 1
            ELSE 0
          END
        ) AS openTickets,

        SUM(
          CASE
            WHEN st.status = 'closed'
            THEN 1
            ELSE 0
          END
        ) AS closedTickets,

        SUM(
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM support_messages sm
              WHERE
                sm.ticket_id = st.id
                AND sm.sender_type = 'member'
                AND (
                  st.admin_last_read_at IS NULL
                  OR sm.created_at > st.admin_last_read_at
                )
            )
            THEN 1
            ELSE 0
          END
        ) AS unreadTickets,

        SUM(
          CASE
            WHEN st.status = 'open'
            AND EXISTS (
              SELECT 1
              FROM support_messages sm
              WHERE
                sm.ticket_id = st.id
                AND sm.sender_type = 'member'
                AND (
                  st.admin_last_read_at IS NULL
                  OR sm.created_at > st.admin_last_read_at
                )
            )
            THEN 1
            ELSE 0
          END
        ) AS awaitingAdmin

      FROM support_tickets st
    `);


    const row = rows[0] || {};


    return res.status(200).json({
      success: true,

      data: {
        totalTickets:
          Number(row.totalTickets || 0),

        openTickets:
          Number(row.openTickets || 0),

        closedTickets:
          Number(row.closedTickets || 0),

        unreadTickets:
          Number(row.unreadTickets || 0),

        awaitingAdmin:
          Number(row.awaitingAdmin || 0),
      },
    });

  } catch (error) {
    console.error(
      "Admin support summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load support summary.",
    });
  }
};


// ======================================================
// LIST TICKETS
//
// GET /api/admin/support
//
// filters:
// search
// status=open|closed
// unread=1
// category
// from
// to
// sort=newest|oldest|updated
// page
// limit
// ======================================================

const getSupportTickets = async (req, res) => {
  try {
    const search =
      cleanText(req.query.search);

    const status =
      cleanText(req.query.status)
        .toLowerCase();

    const unread =
      cleanText(req.query.unread);

    const category =
      cleanText(req.query.category);

    const from =
      cleanText(req.query.from);

    const to =
      cleanText(req.query.to);

    const sort =
      cleanText(req.query.sort)
        .toLowerCase();


    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
      100
    );

    const offset =
      (page - 1) * limit;


    const where = ["1 = 1"];
    const params = [];


    // ------------------------------------------
    // STATUS
    // ------------------------------------------

    if (
      status === "open" ||
      status === "closed"
    ) {
      where.push("st.status = ?");
      params.push(status);
    }


    // ------------------------------------------
    // CATEGORY
    // ------------------------------------------

    if (category) {
      where.push("st.category = ?");
      params.push(category);
    }


    // ------------------------------------------
    // SEARCH
    // ------------------------------------------

    if (search) {
      const term =
        `%${search}%`;

      where.push(`
        (
          CAST(st.id AS CHAR) LIKE ?
          OR st.subject LIKE ?
          OR st.category LIKE ?
          OR m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR m.mobile_no LIKE ?
          OR m.trx LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term,
        term,
        term,
        term,
        term
      );
    }


    // ------------------------------------------
    // DATE
    // ------------------------------------------

    if (from) {
      where.push(
        "DATE(st.created_at) >= ?"
      );

      params.push(from);
    }


    if (to) {
      where.push(
        "DATE(st.created_at) <= ?"
      );

      params.push(to);
    }


    // ------------------------------------------
    // UNREAD MEMBER ACTIVITY
    // ------------------------------------------

    if (unread === "1") {
      where.push(`
        EXISTS (
          SELECT 1
          FROM support_messages sm_unread
          WHERE
            sm_unread.ticket_id = st.id
            AND sm_unread.sender_type = 'member'
            AND (
              st.admin_last_read_at IS NULL
              OR sm_unread.created_at >
                 st.admin_last_read_at
            )
        )
      `);
    }


    const whereSql =
      `WHERE ${where.join(" AND ")}`;


    // ------------------------------------------
    // SORT
    // ------------------------------------------

    let orderSql = `
      ORDER BY
        COALESCE(
          (
            SELECT MAX(sm_sort.created_at)
            FROM support_messages sm_sort
            WHERE sm_sort.ticket_id = st.id
          ),
          st.created_at
        ) DESC,
        st.id DESC
    `;


    if (sort === "oldest") {
      orderSql = `
        ORDER BY
          st.created_at ASC,
          st.id ASC
      `;
    }


    if (sort === "updated") {
      orderSql = `
        ORDER BY
          st.updated_at DESC,
          st.id DESC
      `;
    }


    // ------------------------------------------
    // COUNT
    // ------------------------------------------

    const [countRows] =
      await db.execute(
        `
          SELECT COUNT(*) AS total

          FROM support_tickets st

          INNER JOIN member m
            ON m.id = st.user_id

          ${whereSql}
        `,
        params
      );


    const total =
      Number(countRows[0]?.total || 0);


    // ------------------------------------------
    // DATA
    //
    // limit/offset interpolated only after numeric
    // clamping above.
    // ------------------------------------------

    const [rows] =
      await db.execute(
        `
          SELECT

            st.id,
            st.subject,
            st.category,
            st.status,
            st.created_at,
            st.updated_at,

            m.id AS member_id,
            m.user_id,
            m.name,
            m.email,
            m.mobile_no,
            m.trx,


            (
              SELECT sm.message
              FROM support_messages sm
              WHERE sm.ticket_id = st.id
              ORDER BY
                sm.created_at DESC,
                sm.id DESC
              LIMIT 1
            ) AS last_message,


            (
              SELECT sm.created_at
              FROM support_messages sm
              WHERE sm.ticket_id = st.id
              ORDER BY
                sm.created_at DESC,
                sm.id DESC
              LIMIT 1
            ) AS last_message_at,


            (
              SELECT sm.sender_type
              FROM support_messages sm
              WHERE sm.ticket_id = st.id
              ORDER BY
                sm.created_at DESC,
                sm.id DESC
              LIMIT 1
            ) AS last_sender_type,


            (
              SELECT COUNT(*)
              FROM support_messages sm
              WHERE
                sm.ticket_id = st.id
                AND sm.sender_type = 'member'
                AND (
                  st.admin_last_read_at IS NULL
                  OR sm.created_at >
                     st.admin_last_read_at
                )
            ) AS unread_count


          FROM support_tickets st

          INNER JOIN member m
            ON m.id = st.user_id

          ${whereSql}

          ${orderSql}

          LIMIT ${limit}
          OFFSET ${offset}
        `,
        params
      );


    return res.status(200).json({
      success: true,

      data: {
        tickets:
          rows.map(formatTicket),

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.ceil(total / limit),
        },
      },
    });

  } catch (error) {
    console.error(
      "Admin support tickets error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load support tickets.",
    });
  }
};


// ======================================================
// TICKET DETAILS
//
// GET /api/admin/support/:id
//
// Opening it marks member messages read by admin.
// ======================================================

const getSupportTicketDetails = async (
  req,
  res
) => {
  try {
    const ticketId =
      Number(req.params.id);


    if (
      !Number.isInteger(ticketId) ||
      ticketId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid ticket ID is required.",
      });
    }


    const [ticketRows] =
      await db.execute(
        `
          SELECT

            st.id,
            st.subject,
            st.category,
            st.status,
            st.created_at,
            st.updated_at,

            m.id AS member_id,
            m.user_id,
            m.name,
            m.email,
            m.mobile_no,
            m.trx

          FROM support_tickets st

          INNER JOIN member m
            ON m.id = st.user_id

          WHERE st.id = ?

          LIMIT 1
        `,
        [ticketId]
      );


    if (!ticketRows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Support ticket not found.",
      });
    }


    const [messageRows] =
      await db.execute(
        `
          SELECT
            id,
            ticket_id,
            sender_type,
            sender_id,
            message,
            created_at

          FROM support_messages

          WHERE ticket_id = ?

          ORDER BY
            created_at ASC,
            id ASC
        `,
        [ticketId]
      );


    // Admin has now seen all current member replies.
    await db.execute(
      `
        UPDATE support_tickets

        SET admin_last_read_at = NOW()

        WHERE id = ?
      `,
      [ticketId]
    );


    return res.status(200).json({
      success: true,

      data: {
        ticket:
          formatTicket({
            ...ticketRows[0],
            unread_count: 0,
          }),

        messages:
          messageRows.map(formatMessage),
      },
    });

  } catch (error) {
    console.error(
      "Admin support details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load support ticket.",
    });
  }
};


// ======================================================
// ADMIN REPLY
//
// POST /api/admin/support/:id/reply
//
// body:
// {
//   "message": "..."
// }
// ======================================================

const replyToSupportTicket = async (
  req,
  res
) => {
  let connection;

  try {
    const ticketId =
      Number(req.params.id);

    const message =
      cleanText(req.body.message);

    const adminUsername =
      getAdminUsername(req);


    if (
      !Number.isInteger(ticketId) ||
      ticketId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid ticket ID is required.",
      });
    }


    if (!message) {
      return res.status(400).json({
        success: false,
        message:
          "Message is required.",
      });
    }


    if (message.length > 10000) {
      return res.status(400).json({
        success: false,
        message:
          "Message is too long.",
      });
    }


    connection =
      await db.getConnection();

    await connection.beginTransaction();


    const [ticketRows] =
      await connection.execute(
        `
          SELECT
            id,
            user_id,
            status

          FROM support_tickets

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [ticketId]
      );


    if (!ticketRows[0]) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message:
          "Support ticket not found.",
      });
    }


    if (
      ticketRows[0].status === "closed"
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "This ticket is closed. Reopen it before replying.",
      });
    }


    const [result] =
      await connection.execute(
        `
          INSERT INTO support_messages
          (
            ticket_id,
            sender_type,
            sender_id,
            message
          )
          VALUES (?, 'admin', ?, ?)
        `,
        [
          ticketId,
          adminUsername,
          message,
        ]
      );


    // Admin has read the conversation at the point
    // they reply.
    await connection.execute(
      `
        UPDATE support_tickets

        SET
          admin_last_read_at = NOW(),
          updated_at = NOW()

        WHERE id = ?
      `,
      [ticketId]
    );


    await connection.commit();


    return res.status(201).json({
      success: true,

      message:
        "Reply sent successfully.",

      data: {
        message: {
          id:
            Number(result.insertId),

          ticketId,

          senderType: "admin",

          senderId:
            adminUsername,

          message,

          createdAt:
            new Date().toISOString(),
        },
      },
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error(
      "Admin support reply error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to send support reply.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ======================================================
// UPDATE STATUS
//
// PATCH /api/admin/support/:id/status
//
// {
//   "status": "closed"
// }
//
// OR
//
// {
//   "status": "open"
// }
// ======================================================

const updateSupportTicketStatus = async (
  req,
  res
) => {
  try {
    const ticketId =
      Number(req.params.id);

    const status =
      cleanText(req.body.status)
        .toLowerCase();


    if (
      !Number.isInteger(ticketId) ||
      ticketId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid ticket ID is required.",
      });
    }


    if (
      status !== "open" &&
      status !== "closed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Status must be open or closed.",
      });
    }


    const [ticketRows] =
      await db.execute(
        `
          SELECT
            id,
            status

          FROM support_tickets

          WHERE id = ?

          LIMIT 1
        `,
        [ticketId]
      );


    if (!ticketRows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Support ticket not found.",
      });
    }


    const oldStatus =
      ticketRows[0].status;


    if (oldStatus === status) {
      return res.status(200).json({
        success: true,

        message:
          `Ticket is already ${status}.`,

        data: {
          id: ticketId,
          status,
        },
      });
    }


    await db.execute(
      `
        UPDATE support_tickets

        SET
          status = ?,
          updated_at = NOW()

        WHERE id = ?
      `,
      [
        status,
        ticketId,
      ]
    );


    /*
      AUDIT LOG:

      Your existing admin audit helper should be called
      here using the same signature already used in your
      member Block/Unblock and ROI actions.

      Recommended values:

      action:
        status === "closed"
          ? "SUPPORT_TICKET_CLOSED"
          : "SUPPORT_TICKET_REOPENED"

      entity:
        "support_ticket"

      entity id:
        ticketId

      field:
        "status"

      old:
        oldStatus

      new:
        status

      admin:
        req.admin.username

      Do NOT invent a second audit implementation here.
      Reuse your existing logAdminAction helper.
    */


    return res.status(200).json({
      success: true,

      message:
        status === "closed"
          ? "Support ticket closed."
          : "Support ticket reopened.",

      data: {
        id: ticketId,
        status,
      },
    });

  } catch (error) {
    console.error(
      "Update support status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update support ticket.",
    });
  }
};


// ======================================================
// MARK READ
//
// PATCH /api/admin/support/:id/read
// ======================================================

const markSupportTicketRead = async (
  req,
  res
) => {
  try {
    const ticketId =
      Number(req.params.id);


    if (
      !Number.isInteger(ticketId) ||
      ticketId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid ticket ID is required.",
      });
    }


    const [result] =
      await db.execute(
        `
          UPDATE support_tickets

          SET admin_last_read_at = NOW()

          WHERE id = ?
        `,
        [ticketId]
      );


    if (
      Number(result.affectedRows) === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Support ticket not found.",
      });
    }


    return res.status(200).json({
      success: true,

      message:
        "Ticket marked as read.",
    });

  } catch (error) {
    console.error(
      "Admin mark support read error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update support ticket.",
    });
  }
};


module.exports = {
  getSupportSummary,
  getSupportTickets,
  getSupportTicketDetails,
  replyToSupportTicket,
  updateSupportTicketStatus,
  markSupportTicketRead,
};