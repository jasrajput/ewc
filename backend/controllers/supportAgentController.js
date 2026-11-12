const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const clean = (value) => String(value ?? "").trim();

const validId = (value) => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const failure = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const serverError = (res, error) => {
  console.error("Support agent error:", error);

  return failure(
    res,
    500,
    "Unable to process support request."
  );
};

// ======================================================
// AGENT LOGIN
// POST /api/support-agent/login
// ======================================================

const login = async (req, res) => {
  try {
    const email = clean(req.body?.email).toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return failure(res, 400, "Email and password required.");
    }

    const [rows] = await db.query(
      `
        SELECT id, name, email, password, is_active
        FROM support_agents
        WHERE email = ?
        LIMIT 1
      `,
      [email]
    );

    if (!rows.length) {
      return failure(res, 401, "Invalid email or password.");
    }

    const agent = rows[0];

    const valid = await bcrypt.compare(
      password,
      agent.password
    );

    if (!valid) {
      return failure(res, 401, "Invalid email or password.");
    }

    if (Number(agent.is_active) !== 1) {
      return failure(res, 403, "Your support account is disabled.");
    }

    const secret = process.env.SUPPORT_AGENT_JWT_SECRET;

    if (!secret) {
      throw new Error("SUPPORT_AGENT_JWT_SECRET missing.");
    }

    const token = jwt.sign(
      {
        id: Number(agent.id),
        type: "support_agent",
      },
      secret,
      { expiresIn: "8h" }
    );

    return res.json({
      success: true,
      token,
      agent: {
        id: Number(agent.id),
        name: agent.name,
        email: agent.email,
      },
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ======================================================
// CURRENT AGENT
// GET /api/support-agent/me
// ======================================================

const me = async (req, res) => {
  return res.json({
    success: true,
    data: req.supportAgent,
  });
};

// ======================================================
// AGENT TICKET LIST
// GET /api/support-agent/tickets
// ======================================================

const getTickets = async (req, res) => {
  try {
    const page = Math.max(
      1,
      Number.parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const offset = (page - 1) * limit;

    const status = clean(req.query.status).toLowerCase();

    if (status && !["open", "closed"].includes(status)) {
      return failure(res, 400, "Invalid status.");
    }

    const where = status
      ? "st.assigned_agent_id = ? AND st.status = ?"
      : "st.assigned_agent_id = ?";

    const params = status
      ? [req.supportAgent.id, status]
      : [req.supportAgent.id];

    const [counts] = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM support_tickets st
        WHERE ${where}
      `,
      params
    );

    const [rows] = await db.query(
      `
        SELECT
          st.id,
          st.subject,
          st.category,
          st.status,
          st.created_at,
          st.updated_at,
          m.user_id AS member_username,
          m.name AS member_name,
          (
            SELECT sm.created_at
            FROM support_messages sm
            WHERE sm.ticket_id = st.id
            ORDER BY sm.created_at DESC, sm.id DESC
            LIMIT 1
          ) AS last_message_at,

          (
            SELECT sm.sender_type
            FROM support_messages sm
            WHERE sm.ticket_id = st.id
            ORDER BY sm.created_at DESC, sm.id DESC
            LIMIT 1
          ) AS last_sender_type,
 
          (
            SELECT COUNT(*)
            FROM support_messages sm
            WHERE sm.ticket_id = st.id
              AND sm.sender_type = 'member'
              AND (
                st.agent_last_read_at IS NULL
                OR sm.created_at > st.agent_last_read_at
              )
          ) AS unread_count
        FROM support_tickets st
        INNER JOIN member m ON m.id = st.user_id
        WHERE ${where}
        ORDER BY st.updated_at DESC, st.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );

    const total = Number(counts[0]?.total || 0);

    return res.json({
      success: true,
      data: {
        tickets: rows.map((row) => ({
          ...row,
          id: Number(row.id),
          unreadCount: Number(row.unread_count || 0),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ======================================================
// AGENT TICKET DETAILS
// GET /api/support-agent/tickets/:id
// ======================================================

const getTicketDetails = async (req, res) => {
  try {
    const ticketId = validId(req.params.id);

    if (!ticketId) {
      return failure(res, 400, "Invalid ticket ID.");
    }

    const [tickets] = await db.query(
      `
        SELECT
          st.id,
          st.subject,
          st.category,
          st.status,
          st.created_at,
          m.user_id AS member_username,
          m.name AS member_name
        FROM support_tickets st
        JOIN member m ON m.id = st.user_id
        WHERE st.id = ?
          AND st.assigned_agent_id = ?
        LIMIT 1
      `,
      [ticketId, req.supportAgent.id]
    );

    if (!tickets.length) {
      return failure(res, 404, "Ticket not found or not assigned.");
    }

    const [messages] = await db.query(
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
        ORDER BY created_at ASC, id ASC
      `,
      [ticketId]
    );

    await db.query(
      `
        UPDATE support_tickets
        SET agent_last_read_at = NOW()
        WHERE id = ? AND assigned_agent_id = ?
      `,
      [ticketId, req.supportAgent.id]
    );

    return res.json({
      success: true,
      data: {
        ticket: tickets[0],
        messages,
      },
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ======================================================
// AGENT REPLY
// POST /api/support-agent/tickets/:id/reply
// ======================================================

const replyToTicket = async (req, res) => {
  let connection;

  try {
    const ticketId = validId(req.params.id);
    const message = clean(req.body?.message);

    if (!ticketId || !message || message.length > 10000) {
      return failure(res, 400, "Invalid ticket or message.");
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [tickets] = await connection.query(
      `
        SELECT id, status, assigned_agent_id
        FROM support_tickets
        WHERE id = ?
        FOR UPDATE
      `,
      [ticketId]
    );

    if (
      !tickets.length ||
      Number(tickets[0].assigned_agent_id) !==
      Number(req.supportAgent.id)
    ) {
      await connection.rollback();

      return failure(res, 403, "Ticket is not assigned to you.");
    }

    if (tickets[0].status !== "open") {
      await connection.rollback();

      return failure(res, 409, "Reopen the ticket before replying.");
    }

    // Keep sender_type='admin' so existing member
    // conversations and unread counters work unchanged.
    await connection.query(
      `
        INSERT INTO support_messages (
          ticket_id,
          sender_type,
          sender_id,
          message
        )
        VALUES (?, 'admin', ?, ?)
      `,
      [
        ticketId,
        `agent:${req.supportAgent.id}`,
        message,
      ]
    );

    await connection.query(
      `
        UPDATE support_tickets
        SET agent_last_read_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
      `,
      [ticketId]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Reply sent successfully.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => { });
    }

    return serverError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

// ======================================================
// AGENT CLOSE / REOPEN
// PATCH /api/support-agent/tickets/:id/status
// ======================================================

const updateStatus = async (req, res) => {
  try {
    const ticketId = validId(req.params.id);
    const status = clean(req.body?.status).toLowerCase();

    if (!ticketId || !["open", "closed"].includes(status)) {
      return failure(res, 400, "Invalid ticket status.");
    }

    const [result] = await db.query(
      `
        UPDATE support_tickets
        SET status = ?, updated_at = NOW()
        WHERE id = ?
          AND assigned_agent_id = ?
      `,
      [status, ticketId, req.supportAgent.id]
    );

    if (!result.affectedRows) {
      return failure(res, 404, "Ticket not found or not assigned.");
    }

    return res.json({
      success: true,
      message: `Ticket ${status}.`,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ======================================================
// ADMIN: LIST AGENTS
// GET /api/admin/support/agents
// ======================================================

const adminListAgents = async (req, res) => {
  try {
    const [agents] = await db.query(
      `
        SELECT
          id, name, email, is_active, created_at
        FROM support_agents
        ORDER BY id ASC
      `
    );

    return res.json({
      success: true,
      data: agents,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ======================================================
// ADMIN: CREATE AGENT
// POST /api/admin/support/agents
// ======================================================

const adminCreateAgent = async (req, res) => {
  try {
    const name = clean(req.body?.name);
    const email = clean(req.body?.email).toLowerCase();
    const password = String(req.body?.password || "");

    if (
      !name ||
      name.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 190 ||
      password.length < 12 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return failure(
        res,
        400,
        "Enter a valid name, email and password (12-72 bytes)."
      );
    }

    const hash = await bcrypt.hash(password, 12);

    const [result] = await db.query(
      `
        INSERT INTO support_agents (
          name, email, password, is_active
        )
        VALUES (?, ?, ?, 1)
      `,
      [name, email, hash]
    );

    return res.status(201).json({
      success: true,
      message: "Support agent created.",
      data: {
        id: result.insertId,
        name,
        email,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return failure(res, 409, "Agent email already exists.");
    }

    return serverError(res, error);
  }
};

// ======================================================
// ADMIN: ENABLE / DISABLE AGENT
// PATCH /api/admin/support/agents/:id/status
// ======================================================

const adminUpdateAgentStatus = async (req, res) => {
  try {
    const agentId = validId(req.params.id);
    const active = req.body?.is_active;

    if (!agentId || typeof active !== "boolean") {
      return failure(res, 400, "Invalid agent or status.");
    }

    const [result] = await db.query(
      `
        UPDATE support_agents
        SET is_active = ?
        WHERE id = ?
      `,
      [active ? 1 : 0, agentId]
    );

    if (!result.affectedRows) {
      return failure(res, 404, "Agent not found.");
    }

    return res.json({
      success: true,
      message: "Agent status updated.",
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ======================================================
// ADMIN: ASSIGN / REASSIGN TICKET
// PATCH /api/admin/support/:id/assign
// ======================================================

const adminAssignTicket = async (req, res) => {
  let connection;

  try {
    const ticketId = validId(req.params.id);

    const rawAgentId = req.body?.agent_id;

    const agentId =
      rawAgentId === null ? null : validId(rawAgentId);

    if (!ticketId || (rawAgentId !== null && !agentId)) {
      return failure(res, 400, "Invalid ticket or agent ID.");
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    if (agentId !== null) {
      const [agents] = await connection.query(
        `
          SELECT id
          FROM support_agents
          WHERE id = ? AND is_active = 1
          LIMIT 1
        `,
        [agentId]
      );

      if (!agents.length) {
        await connection.rollback();

        return failure(res, 404, "Active agent not found.");
      }
    }

    const [result] = await connection.query(
      `
        UPDATE support_tickets
        SET assigned_agent_id = ?,
            agent_last_read_at = NULL,
            updated_at = NOW()
        WHERE id = ?
      `,
      [agentId, ticketId]
    );

    if (!result.affectedRows) {
      await connection.rollback();

      return failure(res, 404, "Ticket not found.");
    }

    await connection.commit();

    return res.json({
      success: true,
      message: agentId
        ? "Ticket assigned successfully."
        : "Ticket unassigned.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => { });
    }

    return serverError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

const getAgentNotificationSummary = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
        SELECT
          COUNT(*) AS unreadTickets,
          COALESCE(SUM(unread_count), 0) AS unreadMessages
        FROM (
          SELECT
            st.id,
            (
              SELECT COUNT(*)
              FROM support_messages sm
              WHERE sm.ticket_id = st.id
                AND sm.sender_type = 'member'
                AND (
                  st.agent_last_read_at IS NULL
                  OR sm.created_at > st.agent_last_read_at
                )
            ) AS unread_count
          FROM support_tickets st
          WHERE st.assigned_agent_id = ?
        ) AS ticket_counts
        WHERE unread_count > 0
      `,
      [req.supportAgent.id]
    );

    return res.json({
      success: true,
      data: {
        unreadTickets: Number(rows[0]?.unreadTickets || 0),
        unreadMessages: Number(rows[0]?.unreadMessages || 0),
      },
    });
  } catch (error) {
    return serverError(res, error);
  }
};

module.exports = {
  login,
  me,
  getTickets,
  getTicketDetails,
  replyToTicket,
  updateStatus,
  getAgentNotificationSummary,

  adminListAgents,
  adminCreateAgent,
  adminUpdateAgentStatus,
  adminAssignTicket,
};