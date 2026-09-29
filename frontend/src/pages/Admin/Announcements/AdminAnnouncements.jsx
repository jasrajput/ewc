import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Megaphone,
  FileText,
  Send,
  Search,
  Plus,
  X,
  Edit3,
  Eye,
  RefreshCw,
  CheckCircle2,
  Clock,
} from "lucide-react";

import adminApi from "../../../services/adminApi";

import AdminLayout from "../../../components/admin/layout/AdminLayout";

import styles from "./AdminAnnouncements.module.css";


const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
};


const shortText = (
  value,
  max = 130
) => {
  const text =
    String(value || "").trim();

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}...`;
};


const AdminAnnouncements = () => {
  const [summary, setSummary] =
    useState({
      total: 0,
      drafts: 0,
      published: 0,
      lastPublishedAt: null,
    });


  const [
    announcements,
    setAnnouncements,
  ] = useState([]);


  const [
    pagination,
    setPagination,
  ] = useState({
    page: 1,
    total: 0,
    totalPages: 0,
  });


  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  // FILTERS

  const [
    searchInput,
    setSearchInput,
  ] = useState("");

  const [search, setSearch] =
    useState("");

  const [status, setStatus] =
    useState("");


  // EDITOR

  const [editorOpen, setEditorOpen] =
    useState(false);

  const [
    editingAnnouncement,
    setEditingAnnouncement,
  ] = useState(null);

  const [form, setForm] =
    useState({
      title: "",
      message: "",
    });

  const [saving, setSaving] =
    useState(false);

  const [formError, setFormError] =
    useState("");


  // VIEW

  const [viewItem, setViewItem] =
    useState(null);

  const [publishing, setPublishing] =
    useState(false);


  // ==========================================
  // LOAD
  // ==========================================

  const loadSummary =
    useCallback(async () => {
      try {
        const response =
          await adminApi.get(
            "/admin/announcements/summary"
          );

        setSummary(
          response.data?.data || {
            total: 0,
            drafts: 0,
            published: 0,
            lastPublishedAt: null,
          }
        );
      } catch (error) {
        console.error(
          "Announcement summary:",
          error
        );
      }
    }, []);


  const loadAnnouncements =
    useCallback(
      async (page = 1) => {
        try {
          setLoading(true);
          setError("");


          const params = {
            page,
            limit: 20,
          };


          if (search) {
            params.search = search;
          }

          if (status) {
            params.status = status;
          }


          const response =
            await adminApi.get(
              "/admin/announcements",
              { params }
            );


          setAnnouncements(
            response.data?.data
              ?.announcements || []
          );


          setPagination(
            response.data?.data
              ?.pagination || {
              page: 1,
              total: 0,
              totalPages: 0,
            }
          );

        } catch (error) {
          console.error(
            "Announcements:",
            error
          );

          setError(
            error.response?.data
              ?.message ||
              "Unable to load announcements."
          );

        } finally {
          setLoading(false);
        }
      },
      [search, status]
    );


  useEffect(() => {
    loadSummary();
  }, [loadSummary]);


  useEffect(() => {
    loadAnnouncements(1);
  }, [loadAnnouncements]);


  // ==========================================
  // EDITOR
  // ==========================================

  const newAnnouncement = () => {
    setEditingAnnouncement(null);

    setForm({
      title: "",
      message: "",
    });

    setFormError("");
    setEditorOpen(true);
  };


  const editAnnouncement = (item) => {
    if (item.status !== "draft") {
      return;
    }

    setEditingAnnouncement(item);

    setForm({
      title: item.title,
      message: item.message,
    });

    setFormError("");
    setEditorOpen(true);
  };


  const saveAnnouncement =
    async (event) => {
      event.preventDefault();

      const title =
        form.title.trim();

      const message =
        form.message.trim();


      if (!title || !message) {
        setFormError(
          "Title and message are required."
        );

        return;
      }


      try {
        setSaving(true);
        setFormError("");


        if (editingAnnouncement) {
          await adminApi.patch(
            `/admin/announcements/${editingAnnouncement.id}`,
            {
              title,
              message,
            }
          );
        } else {
          await adminApi.post(
            "/admin/announcements",
            {
              title,
              message,
            }
          );
        }


        setEditorOpen(false);

        await Promise.all([
          loadSummary(),
          loadAnnouncements(
            pagination.page
          ),
        ]);

      } catch (error) {
        setFormError(
          error.response?.data
            ?.message ||
            "Unable to save announcement."
        );

      } finally {
        setSaving(false);
      }
    };


  // ==========================================
  // PUBLISH
  // ==========================================

  const publish = async (item) => {
    const confirmed =
      window.confirm(
        `Publish "${item.title}" to all members?\n\nOnce published, it cannot be edited from the normal admin interface.`
      );

    if (!confirmed) {
      return;
    }


    try {
      setPublishing(true);


      await adminApi.post(
        `/admin/announcements/${item.id}/publish`
      );


      setViewItem(null);

      await Promise.all([
        loadSummary(),
        loadAnnouncements(
          pagination.page
        ),
      ]);

    } catch (error) {
      window.alert(
        error.response?.data
          ?.message ||
          "Unable to publish announcement."
      );

    } finally {
      setPublishing(false);
    }
  };


  return (
    <AdminLayout>
      <div className={styles.page}>

        <div className={styles.header}>
          <div>
            <span>
              COMMUNICATION
            </span>

            <h1>
              Announcements
            </h1>

            <p>
              Create and publish
              platform updates to all
              EWC members.
            </p>
          </div>


          <div
            className={
              styles.headerActions
            }
          >
            <button
              className={styles.refresh}
              onClick={() => {
                loadSummary();
                loadAnnouncements(
                  pagination.page
                );
              }}
            >
              <RefreshCw size={14} />
              Refresh
            </button>

            <button
              className={styles.create}
              onClick={
                newAnnouncement
              }
            >
              <Plus size={15} />
              New Announcement
            </button>
          </div>
        </div>


        {/* SUMMARY */}

        <div
          className={
            styles.summaryGrid
          }
        >
          <Summary
            icon={Megaphone}
            label="Total"
            value={summary.total}
          />

          <Summary
            icon={FileText}
            label="Drafts"
            value={summary.drafts}
          />

          <Summary
            icon={CheckCircle2}
            label="Published"
            value={summary.published}
          />

          <Summary
            icon={Clock}
            label="Last Published"
            value={
              summary.lastPublishedAt
                ? formatDate(
                    summary.lastPublishedAt
                  )
                : "—"
            }
            text
          />
        </div>


        <section className={styles.panel}>

          <div className={styles.filters}>
            <form
              className={styles.search}
              onSubmit={(event) => {
                event.preventDefault();

                setSearch(
                  searchInput.trim()
                );
              }}
            >
              <Search size={14} />

              <input
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(
                    event.target.value
                  )
                }
                placeholder="Search announcements..."
              />

              <button>
                Search
              </button>
            </form>


            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value
                )
              }
            >
              <option value="">
                All Status
              </option>

              <option value="draft">
                Draft
              </option>

              <option value="published">
                Published
              </option>
            </select>
          </div>


          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}


          {loading ? (
            <div className={styles.state}>
              Loading...
            </div>
          ) : announcements.length ===
            0 ? (
            <div className={styles.state}>
              No announcements found.
            </div>
          ) : (
            <div className={styles.list}>
              {announcements.map(
                (item) => (
                  <div
                    key={item.id}
                    className={
                      styles.item
                    }
                  >
                    <div
                      className={
                        styles.itemIcon
                      }
                    >
                      <Megaphone
                        size={17}
                      />
                    </div>


                    <div
                      className={
                        styles.itemMain
                      }
                    >
                      <div
                        className={
                          styles.itemTitle
                        }
                      >
                        <strong>
                          {item.title}
                        </strong>

                        <Status
                          status={
                            item.status
                          }
                        />
                      </div>

                      <p>
                        {shortText(
                          item.message
                        )}
                      </p>

                      <div
                        className={
                          styles.meta
                        }
                      >
                        <span>
                          By{" "}
                          {
                            item.createdBy
                          }
                        </span>

                        <i />

                        <span>
                          {item.status ===
                          "published"
                            ? `Published ${formatDate(
                                item.publishedAt
                              )}`
                            : `Created ${formatDate(
                                item.createdAt
                              )}`}
                        </span>

                        {item.status ===
                          "published" && (
                          <>
                            <i />

                            <span>
                              {
                                item.readCount
                              }{" "}
                              reads
                            </span>
                          </>
                        )}
                      </div>
                    </div>


                    <div
                      className={
                        styles.actions
                      }
                    >
                      <button
                        onClick={() =>
                          setViewItem(
                            item
                          )
                        }
                      >
                        <Eye size={14} />
                        View
                      </button>

                      {item.status ===
                        "draft" && (
                        <>
                          <button
                            onClick={() =>
                              editAnnouncement(
                                item
                              )
                            }
                          >
                            <Edit3
                              size={14}
                            />
                            Edit
                          </button>

                          <button
                            className={
                              styles.publishSmall
                            }
                            onClick={() =>
                              publish(item)
                            }
                          >
                            <Send
                              size={14}
                            />
                            Publish
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}


          {pagination.totalPages > 1 && (
            <div
              className={
                styles.pagination
              }
            >
              <button
                disabled={
                  pagination.page <= 1
                }
                onClick={() =>
                  loadAnnouncements(
                    pagination.page - 1
                  )
                }
              >
                Previous
              </button>

              <span>
                Page {pagination.page} of{" "}
                {pagination.totalPages}
              </span>

              <button
                disabled={
                  pagination.page >=
                  pagination.totalPages
                }
                onClick={() =>
                  loadAnnouncements(
                    pagination.page + 1
                  )
                }
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>


      {/* EDITOR */}

      {editorOpen && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div
              className={
                styles.modalHeader
              }
            >
              <div>
                <span>
                  ANNOUNCEMENT
                </span>

                <h2>
                  {editingAnnouncement
                    ? "Edit Draft"
                    : "New Announcement"}
                </h2>
              </div>

              <button
                onClick={() =>
                  setEditorOpen(false)
                }
              >
                <X size={18} />
              </button>
            </div>


            <form
              onSubmit={
                saveAnnouncement
              }
              className={styles.form}
            >
              <label>
                Title

                <input
                  value={form.title}
                  maxLength={255}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      title:
                        event.target.value,
                    })
                  }
                  placeholder="Announcement title"
                />
              </label>


              <label>
                Message

                <textarea
                  value={form.message}
                  maxLength={20000}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      message:
                        event.target.value,
                    })
                  }
                  rows={10}
                  placeholder="Write announcement..."
                />
              </label>


              <div
                className={
                  styles.counter
                }
              >
                {form.message.length}
                /20000
              </div>


              {formError && (
                <div
                  className={
                    styles.error
                  }
                >
                  {formError}
                </div>
              )}


              <div
                className={
                  styles.formActions
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setEditorOpen(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={
                    styles.save
                  }
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : "Save Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* VIEW */}

      {viewItem && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div
              className={
                styles.modalHeader
              }
            >
              <div>
                <Status
                  status={
                    viewItem.status
                  }
                />

                <h2>
                  {viewItem.title}
                </h2>
              </div>

              <button
                onClick={() =>
                  setViewItem(null)
                }
              >
                <X size={18} />
              </button>
            </div>


            <div
              className={
                styles.preview
              }
            >
              <p>
                {viewItem.message}
              </p>

              <div
                className={
                  styles.previewMeta
                }
              >
                Created by{" "}
                {viewItem.createdBy}
                <br />

                Created:{" "}
                {formatDate(
                  viewItem.createdAt
                )}

                {viewItem.publishedAt && (
                  <>
                    <br />
                    Published:{" "}
                    {formatDate(
                      viewItem.publishedAt
                    )}
                  </>
                )}
              </div>


              {viewItem.status ===
                "draft" && (
                <button
                  className={
                    styles.publish
                  }
                  disabled={publishing}
                  onClick={() =>
                    publish(viewItem)
                  }
                >
                  <Send size={14} />

                  {publishing
                    ? "Publishing..."
                    : "Publish to All Members"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};


const Summary = ({
  icon: Icon,
  label,
  value,
  text,
}) => (
  <div className={styles.summaryCard}>
    <div>
      <Icon size={18} />
    </div>

    <section>
      <span>{label}</span>

      <strong
        className={
          text
            ? styles.summaryText
            : ""
        }
      >
        {text
          ? value
          : Number(
              value || 0
            ).toLocaleString()}
      </strong>
    </section>
  </div>
);


const Status = ({ status }) => (
  <span
    className={
      status === "published"
        ? styles.publishedBadge
        : styles.draftBadge
    }
  >
    {status === "published"
      ? "Published"
      : "Draft"}
  </span>
);


export default AdminAnnouncements;