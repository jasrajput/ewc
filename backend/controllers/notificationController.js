const db = require("../config/db");

const getMemberId = (req) => {
  const id = Number(req.user?.id);

  return Number.isInteger(id) && id > 0
    ? id
    : null;
};


// ======================================================
// UNREAD COUNT
//
// GET /api/notifications/unread-count
// ======================================================

const getUnreadCount = async (req, res) => {
  try {
    const memberId = getMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }


    // --------------------------------------------------
    // SUPPORT
    //
    // Count unread TICKETS, not unread messages.
    // --------------------------------------------------

    const [supportRows] = await db.execute(
      `
        SELECT COUNT(*) AS total

        FROM support_tickets st

        WHERE
          st.user_id = ?

          AND EXISTS (
            SELECT 1

            FROM support_messages sm

            WHERE
              sm.ticket_id = st.id
              AND sm.sender_type = 'admin'

              AND (
                st.member_last_read_at IS NULL
                OR sm.created_at > st.member_last_read_at
              )
          )
      `,
      [memberId]
    );


    // --------------------------------------------------
    // ANNOUNCEMENTS
    // --------------------------------------------------

    const [announcementRows] = await db.execute(
      `
        SELECT COUNT(*) AS total

        FROM announcements a

        WHERE
          a.status = 'published'

          AND NOT EXISTS (
            SELECT 1

            FROM announcement_reads ar

            WHERE
              ar.announcement_id = a.id
              AND ar.user_id = ?
          )
      `,
      [memberId]
    );


    const support =
      Number(supportRows[0]?.total || 0);

    const announcements =
      Number(
        announcementRows[0]?.total || 0
      );


    return res.status(200).json({
      success: true,

      data: {
        total:
          support + announcements,

        support,
        announcements,
      },
    });

  } catch (error) {
    console.error(
      "Notification unread count error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load notification count.",
    });
  }
};


// ======================================================
// RECENT NOTIFICATIONS
//
// GET /api/notifications/recent
//
// Used by member bell dropdown.
// ======================================================

const getRecentNotifications = async (
  req,
  res
) => {
  try {
    const memberId = getMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }


    // --------------------------------------------------
    // SUPPORT
    //
    // One notification per ticket.
    // Use latest admin reply in that ticket.
    // --------------------------------------------------

    const [supportRows] = await db.execute(
      `
        SELECT
          st.id AS ticket_id,
          st.subject,

          sm.id AS message_id,
          sm.message,
          sm.created_at,

          CASE
            WHEN
              st.member_last_read_at IS NULL
              OR sm.created_at >
                 st.member_last_read_at
            THEN 1
            ELSE 0
          END AS is_unread

        FROM support_tickets st

        INNER JOIN support_messages sm
          ON sm.id = (
            SELECT sm2.id

            FROM support_messages sm2

            WHERE
              sm2.ticket_id = st.id
              AND sm2.sender_type = 'admin'

            ORDER BY
              sm2.created_at DESC,
              sm2.id DESC

            LIMIT 1
          )

        WHERE st.user_id = ?

        ORDER BY
          sm.created_at DESC,
          sm.id DESC

        LIMIT 10
      `,
      [memberId]
    );


    // --------------------------------------------------
    // ANNOUNCEMENTS
    // --------------------------------------------------

    const [announcementRows] =
      await db.execute(
        `
          SELECT
            a.id,
            a.title,
            a.message,
            a.published_at,

            CASE
              WHEN ar.id IS NULL
              THEN 1
              ELSE 0
            END AS is_unread

          FROM announcements a

          LEFT JOIN announcement_reads ar
            ON ar.announcement_id = a.id
            AND ar.user_id = ?

          WHERE
            a.status = 'published'

          ORDER BY
            a.published_at DESC,
            a.id DESC

          LIMIT 10
        `,
        [memberId]
      );


    const supportNotifications =
      supportRows.map((row) => ({
        id: `support-${row.ticket_id}`,

        type: "support",

        ticketId:
          Number(row.ticket_id),

        messageId:
          Number(row.message_id),

        title:
          row.subject ||
          "Support Reply",

        message:
          row.message || "",

        unread:
          Number(row.is_unread) === 1,

        createdAt:
          row.created_at,

        link:
          `/support?ticket=${row.ticket_id}`,
      }));


    const announcementNotifications =
      announcementRows.map((row) => ({
        id:
          `announcement-${row.id}`,

        type: "announcement",

        announcementId:
          Number(row.id),

        title:
          row.title ||
          "Announcement",

        message:
          row.message || "",

        unread:
          Number(row.is_unread) === 1,

        createdAt:
          row.published_at,

        link:
          `/notifications?announcement=${row.id}`,
      }));


    const notifications = [
      ...supportNotifications,
      ...announcementNotifications,
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0) -
          new Date(a.createdAt || 0)
      )
      .slice(0, 8);


    return res.status(200).json({
      success: true,
      data: {
        notifications,
      },
    });

  } catch (error) {
    console.error(
      "Recent notifications error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load notifications.",
    });
  }
};


// ======================================================
// FULL NOTIFICATION FEED
//
// GET /api/notifications
//
// ?type=all|support|announcement
// ?page=1
// ?limit=20
// ======================================================

const getNotifications = async (
  req,
  res
) => {
  try {
    const memberId = getMemberId(req);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }


    const requestedType =
      String(
        req.query.type || "all"
      ).toLowerCase();


    const type = [
      "all",
      "support",
      "announcement",
    ].includes(requestedType)
      ? requestedType
      : "all";


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


    let supportNotifications = [];
    let announcementNotifications = [];


    if (
      type === "all" ||
      type === "support"
    ) {
      const [rows] = await db.execute(
        `
          SELECT
            st.id AS ticket_id,
            st.subject,

            sm.id AS message_id,
            sm.message,
            sm.created_at,

            CASE
              WHEN
                st.member_last_read_at IS NULL
                OR sm.created_at >
                   st.member_last_read_at
              THEN 1
              ELSE 0
            END AS is_unread

          FROM support_tickets st

          INNER JOIN support_messages sm
            ON sm.id = (
              SELECT sm2.id

              FROM support_messages sm2

              WHERE
                sm2.ticket_id = st.id
                AND sm2.sender_type = 'admin'

              ORDER BY
                sm2.created_at DESC,
                sm2.id DESC

              LIMIT 1
            )

          WHERE st.user_id = ?

          ORDER BY
            sm.created_at DESC,
            sm.id DESC
        `,
        [memberId]
      );


      supportNotifications =
        rows.map((row) => ({
          id:
            `support-${row.ticket_id}`,

          type: "support",

          ticketId:
            Number(row.ticket_id),

          title:
            row.subject ||
            "Support Reply",

          message:
            row.message || "",

          unread:
            Number(row.is_unread) === 1,

          createdAt:
            row.created_at,

          link:
            `/support?ticket=${row.ticket_id}`,
        }));
    }


    if (
      type === "all" ||
      type === "announcement"
    ) {
      const [rows] = await db.execute(
        `
          SELECT
            a.id,
            a.title,
            a.message,
            a.published_at,

            CASE
              WHEN ar.id IS NULL
              THEN 1
              ELSE 0
            END AS is_unread

          FROM announcements a

          LEFT JOIN announcement_reads ar
            ON ar.announcement_id = a.id
            AND ar.user_id = ?

          WHERE
            a.status = 'published'

          ORDER BY
            a.published_at DESC,
            a.id DESC
        `,
        [memberId]
      );


      announcementNotifications =
        rows.map((row) => ({
          id:
            `announcement-${row.id}`,

          type:
            "announcement",

          announcementId:
            Number(row.id),

          title:
            row.title ||
            "Announcement",

          message:
            row.message || "",

          unread:
            Number(row.is_unread) === 1,

          createdAt:
            row.published_at,

          link:
            `/notifications?announcement=${row.id}`,
        }));
    }


    const all = [
      ...supportNotifications,
      ...announcementNotifications,
    ].sort(
      (a, b) =>
        new Date(b.createdAt || 0) -
        new Date(a.createdAt || 0)
    );


    const total = all.length;

    const offset =
      (page - 1) * limit;


    const notifications =
      all.slice(
        offset,
        offset + limit
      );


    return res.status(200).json({
      success: true,

      data: {
        notifications,

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
      "Notifications error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load notifications.",
    });
  }
};


// ======================================================
// MARK ANNOUNCEMENT READ
//
// PATCH /api/notifications/announcement/:id/read
// ======================================================

const markAnnouncementRead = async (
  req,
  res
) => {
  try {
    const memberId =
      getMemberId(req);

    const announcementId =
      Number(req.params.id);


    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }


    if (
      !Number.isInteger(
        announcementId
      ) ||
      announcementId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid announcement ID is required.",
      });
    }


    const [rows] =
      await db.execute(
        `
          SELECT id

          FROM announcements

          WHERE
            id = ?
            AND status = 'published'

          LIMIT 1
        `,
        [announcementId]
      );


    if (!rows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Announcement not found.",
      });
    }


    await db.execute(
      `
        INSERT INTO announcement_reads
        (
          announcement_id,
          user_id,
          read_at
        )
        VALUES (?, ?, NOW())

        ON DUPLICATE KEY UPDATE
          read_at = read_at
      `,
      [
        announcementId,
        memberId,
      ]
    );


    return res.status(200).json({
      success: true,
      message:
        "Announcement marked as read.",
    });

  } catch (error) {
    console.error(
      "Mark announcement read error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update announcement.",
    });
  }
};


module.exports = {
  getUnreadCount,
  getRecentNotifications,
  getNotifications,
  markAnnouncementRead,
};