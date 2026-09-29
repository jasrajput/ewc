const db = require("../config/db");


// ======================================================
// AUTHENTICATED MEMBER ID
// ======================================================
//
// IMPORTANT:
// Connect this to your existing member auth middleware.
//
// This function MUST return the authenticated numeric
// member.id — NOT member.user_id.
//
// If your middleware already sets req.user.id, this
// works as-is.
//
// If it uses req.member.id instead, change ONLY this
// helper.
// ======================================================

const getAuthenticatedMemberId = (req) => {
  const id =
    req.user?.id ??
    req.member?.id ??
    null;

  const memberId = Number(id);

  if (
    !Number.isInteger(memberId) ||
    memberId < 1
  ) {
    return null;
  }

  return memberId;
};


// ======================================================
// HELPERS
// ======================================================

const cleanText = (value) =>
  String(value || "").trim();


const formatTicket = (row) => {
  const unreadCount =
    Number(row.unread_count || 0);

  return {
    id: Number(row.id),

    subject: row.subject || "",

    category:
      row.category || null,

    status:
      row.status || "open",

    createdAt:
      row.created_at || null,

    updatedAt:
      row.updated_at || null,

    unread: unreadCount > 0,

    unreadCount,

    lastMessage:
      row.last_message || null,

    lastMessageAt:
      row.last_message_at || null,

    lastSenderType:
      row.last_sender_type || null,
  };
};


const formatMessage = (row) => ({
  id: Number(row.id),

  ticketId:
    Number(row.ticket_id),

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
// CREATE TICKET
//
// POST /api/support/tickets
// ======================================================

const createTicket = async (
  req,
  res
) => {
  let connection;

  try {
    const memberId =
      getAuthenticatedMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }


    const subject =
      cleanText(req.body.subject);

    const category =
      cleanText(req.body.category);

    const message =
      cleanText(req.body.message);


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!subject) {
      return res.status(400).json({
        success: false,
        message:
          "Subject is required.",
      });
    }


    if (subject.length > 255) {
      return res.status(400).json({
        success: false,
        message:
          "Subject cannot exceed 255 characters.",
      });
    }


    if (category.length > 100) {
      return res.status(400).json({
        success: false,
        message:
          "Category cannot exceed 100 characters.",
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


    // ==========================================
    // VERIFY MEMBER
    // ==========================================

    const [memberRows] =
      await db.execute(
        `
          SELECT
            id,
            status

          FROM member

          WHERE id = ?

          LIMIT 1
        `,
        [memberId]
      );


    if (!memberRows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Member not found.",
      });
    }


    // Existing EWC semantics:
    // status 1 = blocked
    if (
      Number(
        memberRows[0].status
      ) === 1
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is blocked.",
      });
    }


    // ==========================================
    // CREATE TICKET + FIRST MESSAGE
    // ==========================================

    connection =
      await db.getConnection();

    await connection.beginTransaction();


    const [ticketResult] =
      await connection.execute(
        `
          INSERT INTO support_tickets
          (
            user_id,
            subject,
            category,
            status,
            member_last_read_at,
            admin_last_read_at
          )
          VALUES (?, ?, ?, 'open', NOW(), NULL)
        `,
        [
          memberId,
          subject,
          category || null,
        ]
      );


    const ticketId =
      Number(
        ticketResult.insertId
      );


    await connection.execute(
      `
        INSERT INTO support_messages
        (
          ticket_id,
          sender_type,
          sender_id,
          message
        )
        VALUES (?, 'member', ?, ?)
      `,
      [
        ticketId,
        String(memberId),
        message,
      ]
    );


    await connection.commit();


    return res.status(201).json({
      success: true,

      message:
        "Support ticket created successfully.",

      data: {
        ticket: {
          id: ticketId,
          subject,
          category:
            category || null,
          status: "open",
          unread: false,
          unreadCount: 0,
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
      "Create support ticket error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create support ticket.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ======================================================
// GET MEMBER'S TICKETS
//
// GET /api/support/tickets
//
// ?status=open
// ?search=withdrawal
// ?page=1
// ?limit=20
// ======================================================

const getTickets = async (
  req,
  res
) => {
  try {
    const memberId =
      getAuthenticatedMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }


    const status =
      cleanText(
        req.query.status
      ).toLowerCase();

    const search =
      cleanText(
        req.query.search
      );


    const page =
      Math.max(
        Number(
          req.query.page
        ) || 1,
        1
      );


    const limit =
      Math.min(
        Math.max(
          Number(
            req.query.limit
          ) || 20,
          1
        ),
        100
      );


    const offset =
      (page - 1) * limit;


    const where = [
      "st.user_id = ?",
    ];

    const params = [
      memberId,
    ];


    if (
      status === "open" ||
      status === "closed"
    ) {
      where.push(
        "st.status = ?"
      );

      params.push(status);
    }


    if (search) {
      const term =
        `%${search}%`;

      where.push(`
        (
          st.subject LIKE ?
          OR st.category LIKE ?
          OR CAST(st.id AS CHAR) LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term
      );
    }


    const whereSql =
      `WHERE ${where.join(
        " AND "
      )}`;


    // ==========================================
    // COUNT
    // ==========================================

    const [countRows] =
      await db.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM support_tickets st

          ${whereSql}
        `,
        params
      );


    const total =
      Number(
        countRows[0]?.total ||
        0
      );


    // ==========================================
    // LIST
    // ==========================================

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

                AND sm.sender_type = 'admin'

                AND (
                  st.member_last_read_at IS NULL
                  OR sm.created_at >
                     st.member_last_read_at
                )
            ) AS unread_count


          FROM support_tickets st

          ${whereSql}

          ORDER BY
            COALESCE(
              (
                SELECT MAX(sm2.created_at)

                FROM support_messages sm2

                WHERE
                  sm2.ticket_id = st.id
              ),
              st.created_at
            ) DESC,
            st.id DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `,
        params
      );


    return res.status(200).json({
      success: true,

      data: {
        tickets:
          rows.map(
            formatTicket
          ),

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total / limit
            ),
        },
      },
    });

  } catch (error) {
    console.error(
      "Get support tickets error:",
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
// GET ONE TICKET
//
// GET /api/support/tickets/:id
//
// Ownership is enforced here.
// ======================================================

const getTicketDetails = async (
  req,
  res
) => {
  try {
    const memberId =
      getAuthenticatedMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }


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


    // ==========================================
    // OWNERSHIP CHECK
    // ==========================================

    const [ticketRows] =
      await db.execute(
        `
          SELECT
            id,
            user_id,
            subject,
            category,
            status,
            created_at,
            updated_at

          FROM support_tickets

          WHERE
            id = ?
            AND user_id = ?

          LIMIT 1
        `,
        [
          ticketId,
          memberId,
        ]
      );


    if (!ticketRows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Support ticket not found.",
      });
    }


    const ticket =
      ticketRows[0];


    // ==========================================
    // MESSAGES
    // ==========================================

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


    // Opening the thread means member has seen
    // all admin replies currently in the thread.
    await db.execute(
      `
        UPDATE support_tickets

        SET member_last_read_at = NOW()

        WHERE
          id = ?
          AND user_id = ?
      `,
      [
        ticketId,
        memberId,
      ]
    );


    return res.status(200).json({
      success: true,

      data: {
        ticket: {
          id:
            Number(ticket.id),

          subject:
            ticket.subject,

          category:
            ticket.category ||
            null,

          status:
            ticket.status,

          createdAt:
            ticket.created_at,

          updatedAt:
            ticket.updated_at,
        },

        messages:
          messageRows.map(
            formatMessage
          ),
      },
    });

  } catch (error) {
    console.error(
      "Get support ticket details error:",
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
// MEMBER REPLY
//
// POST /api/support/tickets/:id/reply
// body: { message }
//
// Closed tickets cannot receive member replies.
// ======================================================

const replyToTicket = async (
  req,
  res
) => {
  let connection;

  try {
    const memberId =
      getAuthenticatedMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }


    const ticketId =
      Number(req.params.id);

    const message =
      cleanText(
        req.body.message
      );


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


    // ==========================================
    // LOCK + OWNERSHIP CHECK
    // ==========================================

    const [ticketRows] =
      await connection.execute(
        `
          SELECT
            id,
            status

          FROM support_tickets

          WHERE
            id = ?
            AND user_id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          ticketId,
          memberId,
        ]
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
      ticketRows[0].status ===
      "closed"
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "This support ticket is closed.",
      });
    }


    // ==========================================
    // INSERT REPLY
    // ==========================================

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
          VALUES (?, 'member', ?, ?)
        `,
        [
          ticketId,
          String(memberId),
          message,
        ]
      );


    // Member has obviously read the thread at the
    // moment they send their reply.
    await connection.execute(
      `
        UPDATE support_tickets

        SET
          member_last_read_at = NOW(),
          updated_at = NOW()

        WHERE
          id = ?
          AND user_id = ?
      `,
      [
        ticketId,
        memberId,
      ]
    );


    await connection.commit();


    return res.status(201).json({
      success: true,

      message:
        "Reply sent successfully.",

      data: {
        message: {
          id:
            Number(
              result.insertId
            ),

          ticketId,

          senderType:
            "member",

          senderId:
            String(memberId),

          message,

          createdAt:
            new Date()
              .toISOString(),
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
      "Support reply error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to send reply.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ======================================================
// MARK TICKET READ
//
// PATCH /api/support/tickets/:id/read
// ======================================================

const markTicketRead = async (
  req,
  res
) => {
  try {
    const memberId =
      getAuthenticatedMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }


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

          SET member_last_read_at = NOW()

          WHERE
            id = ?
            AND user_id = ?
        `,
        [
          ticketId,
          memberId,
        ]
      );


    if (
      Number(
        result.affectedRows
      ) === 0
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
      "Mark support ticket read error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update ticket.",
    });
  }
};


// ======================================================
// MEMBER SUPPORT SUMMARY
//
// GET /api/support/summary
//
// Useful for Support page + notification bell later.
// ======================================================

const getSupportSummary = async (
  req,
  res
) => {
  try {
    const memberId =
      getAuthenticatedMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }


    const [rows] =
      await db.execute(
        `
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

                    AND sm.sender_type = 'admin'

                    AND (
                      st.member_last_read_at IS NULL
                      OR sm.created_at >
                         st.member_last_read_at
                    )
                )
                THEN 1
                ELSE 0
              END
            ) AS unreadTickets


          FROM support_tickets st

          WHERE st.user_id = ?
        `,
        [memberId]
      );


    const row =
      rows[0] || {};


    return res.status(200).json({
      success: true,

      data: {
        totalTickets:
          Number(
            row.totalTickets ||
            0
          ),

        openTickets:
          Number(
            row.openTickets ||
            0
          ),

        closedTickets:
          Number(
            row.closedTickets ||
            0
          ),

        unreadTickets:
          Number(
            row.unreadTickets ||
            0
          ),
      },
    });

  } catch (error) {
    console.error(
      "Support summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load support summary.",
    });
  }
};


module.exports = {
  createTicket,
  getTickets,
  getTicketDetails,
  replyToTicket,
  markTicketRead,
  getSupportSummary,
};