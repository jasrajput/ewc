const db = require("../../config/db");

const cleanText = (value) =>
  String(value || "").trim();

const getAdminUsername = (req) =>
  cleanText(req.admin?.username) || "admin";

const formatAnnouncement = (row) => ({
  id: Number(row.id),
  title: row.title || "",
  message: row.message || "",
  status: row.status || "draft",
  createdBy: row.created_by || "",
  publishedAt: row.published_at || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,

  readCount:
    row.read_count !== undefined
      ? Number(row.read_count || 0)
      : undefined,
});


// ======================================================
// SUMMARY
// GET /api/admin/announcements/summary
// ======================================================

const getAnnouncementSummary = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(
          CASE
            WHEN status = 'draft'
            THEN 1 ELSE 0
          END
        ) AS drafts,
        SUM(
          CASE
            WHEN status = 'published'
            THEN 1 ELSE 0
          END
        ) AS published,
        MAX(published_at) AS last_published_at
      FROM announcements
    `);

    const row = rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        total: Number(row.total || 0),
        drafts: Number(row.drafts || 0),
        published: Number(row.published || 0),
        lastPublishedAt:
          row.last_published_at || null,
      },
    });

  } catch (error) {
    console.error(
      "Announcement summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load announcement summary.",
    });
  }
};


// ======================================================
// LIST
// GET /api/admin/announcements
// ======================================================

const getAnnouncements = async (req, res) => {
  try {
    const search =
      cleanText(req.query.search);

    const status =
      cleanText(req.query.status)
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


    if (
      status === "draft" ||
      status === "published"
    ) {
      where.push("a.status = ?");
      params.push(status);
    }


    if (search) {
      const term = `%${search}%`;

      where.push(`
        (
          a.title LIKE ?
          OR a.message LIKE ?
          OR a.created_by LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term
      );
    }


    const whereSql =
      `WHERE ${where.join(" AND ")}`;


    const [countRows] =
      await db.execute(
        `
          SELECT COUNT(*) AS total

          FROM announcements a

          ${whereSql}
        `,
        params
      );


    const total =
      Number(countRows[0]?.total || 0);


    const [rows] =
      await db.execute(
        `
          SELECT
            a.id,
            a.title,
            a.message,
            a.status,
            a.created_by,
            a.published_at,
            a.created_at,
            a.updated_at,

            (
              SELECT COUNT(*)
              FROM announcement_reads ar
              WHERE ar.announcement_id = a.id
            ) AS read_count

          FROM announcements a

          ${whereSql}

          ORDER BY
            a.created_at DESC,
            a.id DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `,
        params
      );


    return res.status(200).json({
      success: true,

      data: {
        announcements:
          rows.map(formatAnnouncement),

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
      "Get announcements error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load announcements.",
    });
  }
};


// ======================================================
// DETAILS
// GET /api/admin/announcements/:id
// ======================================================

const getAnnouncementDetails = async (
  req,
  res
) => {
  try {
    const id =
      Number(req.params.id);

    if (
      !Number.isInteger(id) ||
      id < 1
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
          SELECT
            a.id,
            a.title,
            a.message,
            a.status,
            a.created_by,
            a.published_at,
            a.created_at,
            a.updated_at,

            (
              SELECT COUNT(*)
              FROM announcement_reads ar
              WHERE ar.announcement_id = a.id
            ) AS read_count

          FROM announcements a

          WHERE a.id = ?

          LIMIT 1
        `,
        [id]
      );


    if (!rows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Announcement not found.",
      });
    }


    return res.status(200).json({
      success: true,
      data: {
        announcement:
          formatAnnouncement(rows[0]),
      },
    });

  } catch (error) {
    console.error(
      "Announcement details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load announcement.",
    });
  }
};


// ======================================================
// CREATE DRAFT
// POST /api/admin/announcements
//
// {
//   title,
//   message
// }
// ======================================================

const createAnnouncement = async (
  req,
  res
) => {
  try {
    const title =
      cleanText(req.body.title);

    const message =
      cleanText(req.body.message);

    const admin =
      getAdminUsername(req);


    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Title is required.",
      });
    }


    if (title.length > 255) {
      return res.status(400).json({
        success: false,
        message:
          "Title cannot exceed 255 characters.",
      });
    }


    if (!message) {
      return res.status(400).json({
        success: false,
        message:
          "Announcement message is required.",
      });
    }


    if (message.length > 20000) {
      return res.status(400).json({
        success: false,
        message:
          "Announcement is too long.",
      });
    }


    const [result] =
      await db.execute(
        `
          INSERT INTO announcements
          (
            title,
            message,
            status,
            created_by
          )
          VALUES (?, ?, 'draft', ?)
        `,
        [
          title,
          message,
          admin,
        ]
      );


    return res.status(201).json({
      success: true,

      message:
        "Announcement draft created.",

      data: {
        announcement: {
          id: Number(result.insertId),
          title,
          message,
          status: "draft",
          createdBy: admin,
        },
      },
    });

  } catch (error) {
    console.error(
      "Create announcement error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create announcement.",
    });
  }
};


// ======================================================
// UPDATE DRAFT
// PATCH /api/admin/announcements/:id
// ======================================================

const updateAnnouncement = async (
  req,
  res
) => {
  try {
    const id =
      Number(req.params.id);

    const title =
      cleanText(req.body.title);

    const message =
      cleanText(req.body.message);


    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid announcement ID is required.",
      });
    }


    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message:
          "Title and message are required.",
      });
    }


    if (
      title.length > 255 ||
      message.length > 20000
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Announcement content exceeds the allowed length.",
      });
    }


    const [rows] =
      await db.execute(
        `
          SELECT
            id,
            status

          FROM announcements

          WHERE id = ?

          LIMIT 1
        `,
        [id]
      );


    if (!rows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Announcement not found.",
      });
    }


    if (
      rows[0].status === "published"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Published announcements cannot be edited.",
      });
    }


    await db.execute(
      `
        UPDATE announcements

        SET
          title = ?,
          message = ?,
          updated_at = NOW()

        WHERE id = ?
      `,
      [
        title,
        message,
        id,
      ]
    );


    return res.status(200).json({
      success: true,

      message:
        "Announcement updated.",

      data: {
        id,
        title,
        message,
        status: "draft",
      },
    });

  } catch (error) {
    console.error(
      "Update announcement error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update announcement.",
    });
  }
};


// ======================================================
// PUBLISH
// POST /api/admin/announcements/:id/publish
// ======================================================

const publishAnnouncement = async (
  req,
  res
) => {
  let connection;

  try {
    const id =
      Number(req.params.id);


    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid announcement ID is required.",
      });
    }


    connection =
      await db.getConnection();

    await connection.beginTransaction();


    const [rows] =
      await connection.execute(
        `
          SELECT
            id,
            title,
            status

          FROM announcements

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [id]
      );


    if (!rows[0]) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message:
          "Announcement not found.",
      });
    }


    if (
      rows[0].status === "published"
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Announcement is already published.",
      });
    }


    await connection.execute(
      `
        UPDATE announcements

        SET
          status = 'published',
          published_at = NOW(),
          updated_at = NOW()

        WHERE id = ?
      `,
      [id]
    );


    /*
      Connect your existing logAdminAction() helper
      here.

      Recommended audit values:

      action:
        ANNOUNCEMENT_PUBLISHED

      entity:
        announcement

      entity id:
        id

      field:
        status

      old:
        draft

      new:
        published

      admin:
        req.admin.username

      Do not log anything sensitive.
    */


    await connection.commit();


    return res.status(200).json({
      success: true,

      message:
        "Announcement published to members.",

      data: {
        id,
        status: "published",
      },
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error(
      "Publish announcement error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to publish announcement.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


module.exports = {
  getAnnouncementSummary,
  getAnnouncements,
  getAnnouncementDetails,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
};