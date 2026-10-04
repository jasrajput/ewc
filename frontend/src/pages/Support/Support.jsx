import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  MessageCircle,
  Clock,
  CheckCircle2,
  Inbox,
  ChevronRight,
  X,
  Send,
  LifeBuoy,
  RefreshCw,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";

import styles from "./Support.module.css";

// ======================================================
// HELPERS
// ======================================================

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const shortenMessage = (value, max = 100) => {
  const text = String(value || "").trim();

  if (!text) {
    return "No messages yet.";
  }

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}...`;
};

// ======================================================
// SUPPORT PAGE
// ======================================================

const Support = () => {
  const [summary, setSummary] = useState({
    totalTickets: 0,
    openTickets: 0,
    closedTickets: 0,
    unreadTickets: 0,
  });

  const [tickets, setTickets] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // ====================================================
  // FILTERS
  // ====================================================

  const [searchInput, setSearchInput] = useState("");

  const [search, setSearch] = useState("");

  const [status, setStatus] = useState("");

  // ====================================================
  // CREATE MODAL
  // ====================================================

  const [createOpen, setCreateOpen] = useState(false);

  const [createForm, setCreateForm] = useState({
    subject: "",
    category: "",
    message: "",
  });

  const [creating, setCreating] = useState(false);

  const [createError, setCreateError] = useState("");

  // ====================================================
  // CONVERSATION
  // ====================================================

  const [selectedTicketId, setSelectedTicketId] = useState(null);

  const [ticketDetails, setTicketDetails] = useState(null);

  const [conversationLoading, setConversationLoading] = useState(false);

  const [conversationError, setConversationError] = useState("");

  const [reply, setReply] = useState("");

  const [sendingReply, setSendingReply] = useState(false);

  // ====================================================
  // LOAD SUMMARY
  // ====================================================

  const loadSummary = useCallback(async () => {
    try {
      const response = await api.get("/support/summary");

      setSummary(
        response.data?.data || {
          totalTickets: 0,
          openTickets: 0,
          closedTickets: 0,
          unreadTickets: 0,
        },
      );
    } catch (error) {
      console.error("Support summary error:", error);
    }
  }, []);

  // ====================================================
  // LOAD TICKETS
  // ====================================================

  const loadTickets = useCallback(
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

        const response = await api.get("/support/tickets", {
          params,
        });

        setTickets(response.data?.data?.tickets || []);

        setPagination(
          response.data?.data?.pagination || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
          },
        );
      } catch (error) {
        console.error("Support tickets error:", error);

        setTickets([]);

        setError(
          error.response?.data?.message ||
            "Unable to load your support tickets.",
        );
      } finally {
        setLoading(false);
      }
    },
    [search, status],
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadTickets(1);
  }, [loadTickets]);

  // ====================================================
  // SEARCH
  // ====================================================

  const handleSearch = (event) => {
    event.preventDefault();

    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
  };

  // ====================================================
  // CREATE TICKET
  // ====================================================

  const openCreate = () => {
    setCreateError("");

    setCreateForm({
      subject: "",
      category: "",
      message: "",
    });

    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (creating) {
      return;
    }

    setCreateOpen(false);
    setCreateError("");
  };

  const handleCreateChange = (event) => {
    const { name, value } = event.target;

    setCreateForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const submitTicket = async (event) => {
    event.preventDefault();

    const subject = createForm.subject.trim();

    const category = createForm.category.trim();

    const message = createForm.message.trim();

    if (!subject) {
      setCreateError("Please enter a subject.");

      return;
    }

    if (!message) {
      setCreateError("Please describe your issue.");

      return;
    }

    try {
      setCreating(true);
      setCreateError("");

      const response = await api.post("/support/tickets", {
        subject,
        category,
        message,
      });

      const ticketId = response.data?.data?.ticket?.id;

      setCreateOpen(false);

      setCreateForm({
        subject: "",
        category: "",
        message: "",
      });

      await Promise.all([loadSummary(), loadTickets(1)]);

      if (ticketId) {
        openTicket(ticketId);
      }
    } catch (error) {
      console.error("Create ticket error:", error);

      setCreateError(
        error.response?.data?.message || "Unable to create support ticket.",
      );
    } finally {
      setCreating(false);
    }
  };

  // ====================================================
  // OPEN TICKET
  // ====================================================

  const openTicket = useCallback(
    async (ticketId) => {
      try {
        setSelectedTicketId(ticketId);
        setTicketDetails(null);
        setConversationError("");
        setConversationLoading(true);
        setReply("");

        const response = await api.get(`/support/tickets/${ticketId}`);

        setTicketDetails(response.data?.data || null);

        // Opening the ticket marks admin replies read.
        await Promise.all([loadSummary(), loadTickets(pagination.page)]);

        // Tell Header to refresh its notification badge.
        window.dispatchEvent(new Event("ewc-notifications-updated"));
      } catch (error) {
        console.error("Ticket details error:", error);

        setConversationError(
          error.response?.data?.message ||
            "Unable to load this support ticket.",
        );
      } finally {
        setConversationLoading(false);
      }
    },
    [loadSummary, loadTickets, pagination.page],
  );

  useEffect(() => {
    const ticketId = Number(searchParams.get("ticket"));

    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return;
    }

    openTicket(ticketId);
  }, [searchParams, openTicket]);

  const closeConversation = () => {
    setSelectedTicketId(null);
    setTicketDetails(null);
    setConversationError("");
    setReply("");

    if (searchParams.has("ticket")) {
      const nextParams = new URLSearchParams(searchParams);

      nextParams.delete("ticket");

      setSearchParams(nextParams, {
        replace: true,
      });
    }
  };

  // ====================================================
  // SEND REPLY
  // ====================================================

  const sendReply = async (event) => {
    event.preventDefault();

    const message = reply.trim();

    if (!message || !selectedTicketId) {
      return;
    }

    if (ticketDetails?.ticket?.status === "closed") {
      return;
    }

    try {
      setSendingReply(true);

      setConversationError("");

      await api.post(`/support/tickets/${selectedTicketId}/reply`, {
        message,
      });

      setReply("");

      const response = await api.get(`/support/tickets/${selectedTicketId}`);

      setTicketDetails(response.data?.data || null);

      await Promise.all([loadSummary(), loadTickets(pagination.page)]);
    } catch (error) {
      console.error("Support reply error:", error);

      setConversationError(
        error.response?.data?.message || "Unable to send your reply.",
      );
    } finally {
      setSendingReply(false);
    }
  };

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <UserLayout>
      <div className={styles.page}>
        {/* =========================================
            HEADER
        ========================================= */}

        <div className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>HELP CENTER</div>

            <h1>Support</h1>

            <p>
              Contact EWC support, track your requests and continue existing
              conversations.
            </p>
          </div>

          <button
            type="button"
            className={styles.createButton}
            onClick={openCreate}
          >
            <Plus size={16} />
            New Ticket
          </button>
        </div>

        {/* =========================================
            SUMMARY
        ========================================= */}

        <div className={styles.summaryGrid}>
          <SummaryCard
            icon={Inbox}
            label="Total Tickets"
            value={summary.totalTickets}
          />

          <SummaryCard
            icon={MessageCircle}
            label="Open"
            value={summary.openTickets}
          />

          <SummaryCard
            icon={CheckCircle2}
            label="Closed"
            value={summary.closedTickets}
          />

          <SummaryCard
            icon={Clock}
            label="Unread Replies"
            value={summary.unreadTickets}
            highlight={summary.unreadTickets > 0}
          />
        </div>

        {/* =========================================
            FILTER BAR
        ========================================= */}

        <section className={styles.panel}>
          <div className={styles.filters}>
            <form className={styles.search} onSubmit={handleSearch}>
              <Search size={15} />

              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search ticket..."
              />

              <button type="submit">Search</button>
            </form>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All Tickets</option>

              <option value="open">Open</option>

              <option value="closed">Closed</option>
            </select>

            {(search || status) && (
              <button
                type="button"
                className={styles.clearButton}
                onClick={clearFilters}
              >
                <X size={14} />
                Clear
              </button>
            )}

            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => {
                loadSummary();

                loadTickets(pagination.page);
              }}
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* =========================================
              TICKET LIST
          ========================================= */}

          <div className={styles.listHeader}>
            <div>
              <h2>My Tickets</h2>

              <p>
                {pagination.total} support request
                {pagination.total === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {loading ? (
            <Loading />
          ) : tickets.length === 0 ? (
            <EmptyTickets onCreate={openCreate} />
          ) : (
            <div className={styles.ticketList}>
              {tickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => openTicket(ticket.id)}
                />
              ))}
            </div>
          )}

          {/* =========================================
              PAGINATION
          ========================================= */}

          {!loading && pagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadTickets(pagination.page - 1)}
              >
                Previous
              </button>

              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadTickets(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>

        {/* =========================================
            INFO
        ========================================= */}

        <div className={styles.helpNotice}>
          <LifeBuoy size={18} />

          <div>
            <strong>Need assistance?</strong>

            <span>
              Create one ticket per issue so the support team can follow the
              conversation clearly.
            </span>
          </div>
        </div>
      </div>

      {/* =========================================
          CREATE MODAL
      ========================================= */}

      {createOpen && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreate();
            }
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <span>SUPPORT</span>

                <h2>Create Ticket</h2>

                <p>Tell us how we can help.</p>
              </div>

              <button type="button" onClick={closeCreate}>
                <X size={18} />
              </button>
            </div>

            <form className={styles.ticketForm} onSubmit={submitTicket}>
              <FormField label="Subject" required>
                <input
                  name="subject"
                  value={createForm.subject}
                  onChange={handleCreateChange}
                  maxLength={255}
                  placeholder="Briefly describe your issue"
                />
              </FormField>

              <FormField label="Category">
                <select
                  name="category"
                  value={createForm.category}
                  onChange={handleCreateChange}
                >
                  <option value="">Select category</option>

                  <option value="Account">Account</option>

                  <option value="Investment">Investment</option>

                  <option value="Withdrawal">Withdrawal</option>

                  <option value="Wallet">Wallet</option>

                  <option value="Earnings">Earnings</option>

                  <option value="Team">Team</option>

                  <option value="Other">Other</option>
                </select>
              </FormField>

              <FormField label="Message" required>
                <textarea
                  name="message"
                  value={createForm.message}
                  onChange={handleCreateChange}
                  maxLength={10000}
                  rows={7}
                  placeholder="Describe the issue in detail..."
                />
              </FormField>

              <div className={styles.characterCount}>
                {createForm.message.length}
                /10000
              </div>

              {createError && (
                <div className={styles.formError}>{createError}</div>
              )}

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeCreate}
                  disabled={creating}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================
          CONVERSATION DRAWER
      ========================================= */}

      {selectedTicketId && (
        <div
          className={styles.drawerOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeConversation();
            }
          }}
        >
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div>
                <span>TICKET #{selectedTicketId}</span>

                <h2>{ticketDetails?.ticket?.subject || "Support Ticket"}</h2>

                {ticketDetails?.ticket && (
                  <div className={styles.drawerMeta}>
                    <StatusBadge status={ticketDetails.ticket.status} />

                    {ticketDetails.ticket.category && (
                      <span>{ticketDetails.ticket.category}</span>
                    )}
                  </div>
                )}
              </div>

              <button type="button" onClick={closeConversation}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.conversation}>
              {conversationLoading ? (
                <Loading />
              ) : conversationError && !ticketDetails ? (
                <div className={styles.error}>{conversationError}</div>
              ) : (
                <>
                  {ticketDetails?.messages?.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}

                  {!ticketDetails?.messages?.length && (
                    <div className={styles.noMessages}>No messages.</div>
                  )}
                </>
              )}
            </div>

            {conversationError && ticketDetails && (
              <div className={styles.replyError}>{conversationError}</div>
            )}

            {ticketDetails?.ticket?.status === "closed" ? (
              <div className={styles.closedNotice}>
                <CheckCircle2 size={16} />
                This ticket has been closed. Create a new ticket if you need
                further assistance.
              </div>
            ) : (
              <form className={styles.replyBox} onSubmit={sendReply}>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={10000}
                  rows={3}
                  placeholder="Write a reply..."
                  disabled={sendingReply || conversationLoading}
                />

                <div className={styles.replyFooter}>
                  <span>
                    {reply.length}
                    /10000
                  </span>

                  <button
                    type="submit"
                    disabled={!reply.trim() || sendingReply}
                  >
                    <Send size={14} />

                    {sendingReply ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      )}
    </UserLayout>
  );
};

// ======================================================
// COMPONENTS
// ======================================================

const SummaryCard = ({ icon: Icon, label, value, highlight = false }) => (
  <div
    className={`${styles.summaryCard} ${
      highlight ? styles.summaryHighlight : ""
    }`}
  >
    <div className={styles.summaryIcon}>
      <Icon size={18} />
    </div>

    <div>
      <span>{label}</span>

      <strong>{Number(value || 0).toLocaleString()}</strong>
    </div>
  </div>
);

const TicketRow = ({ ticket, onClick }) => (
  <button
    type="button"
    className={`${styles.ticketRow} ${
      ticket.unread ? styles.ticketUnread : ""
    }`}
    onClick={onClick}
  >
    <div className={styles.ticketIcon}>
      <MessageCircle size={17} />

      {ticket.unread && <span className={styles.unreadDot} />}
    </div>

    <div className={styles.ticketMain}>
      <div className={styles.ticketTitle}>
        <strong>{ticket.subject}</strong>

        {ticket.unread && <span className={styles.newBadge}>New Reply</span>}
      </div>

      <p>{shortenMessage(ticket.lastMessage)}</p>

      <div className={styles.ticketMeta}>
        <span>#{ticket.id}</span>

        {ticket.category && (
          <>
            <i />
            <span>{ticket.category}</span>
          </>
        )}

        <i />

        <span>
          {ticket.lastSenderType === "admin"
            ? "Support replied"
            : "You replied"}
        </span>
      </div>
    </div>

    <div className={styles.ticketRight}>
      <StatusBadge status={ticket.status} />

      <span>{formatDate(ticket.lastMessageAt || ticket.updatedAt)}</span>
    </div>

    <ChevronRight size={17} className={styles.chevron} />
  </button>
);

const StatusBadge = ({ status }) => (
  <span className={status === "closed" ? styles.closedBadge : styles.openBadge}>
    {status === "closed" ? "Closed" : "Open"}
  </span>
);

const MessageBubble = ({ message }) => {
  const member = message.senderType === "member";

  return (
    <div className={member ? styles.memberMessageRow : styles.adminMessageRow}>
      <div className={member ? styles.memberMessage : styles.adminMessage}>
        <div className={styles.messageHeader}>
          <strong>{member ? "You" : "EWC Support"}</strong>

          <span>{formatDate(message.createdAt)}</span>
        </div>

        <p>{message.message}</p>
      </div>
    </div>
  );
};

const FormField = ({ label, required, children }) => (
  <div className={styles.formField}>
    <label>
      {label}

      {required && <span>*</span>}
    </label>

    {children}
  </div>
);

const Loading = () => (
  <div className={styles.loading}>
    <div className={styles.loader} />
    Loading...
  </div>
);

const EmptyTickets = ({ onCreate }) => (
  <div className={styles.empty}>
    <div className={styles.emptyIcon}>
      <LifeBuoy size={27} />
    </div>

    <strong>No support tickets</strong>

    <p>You haven't created any support requests yet.</p>

    <button type="button" onClick={onCreate}>
      <Plus size={14} />
      Create Ticket
    </button>
  </div>
);

export default Support;
