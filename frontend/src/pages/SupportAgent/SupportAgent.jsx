import { useCallback, useEffect, useState } from "react";

import axios from "axios";

import {
  Headset,
  LogOut,
  Mail,
  LockKeyhole,
  RefreshCw,
  Send,
  CheckCircle2,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";

import api from "../../services/api";
import styles from "./SupportAgent.module.css";

const supportApi = axios.create({
  baseURL: `${String(api.defaults.baseURL || "/api").replace(
    /\/$/,
    "",
  )}/support-agent`,
});

supportApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("ewc_support_agent_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const errorMessage = (error) =>
  error.response?.data?.message || "Something went wrong. Please try again.";

const SupportAgent = () => {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("ewc_support_agent_token") || "",
  );

  const [agent, setAgent] = useState(null);

  const [credentials, setCredentials] = useState({
    email: "",
    password: "",
  });

  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 0,
    total: 0,
  });

  const [statusFilter, setStatusFilter] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [notifications, setNotifications] = useState({
    unreadTickets: 0,
    unreadMessages: 0,
  });

  const loadNotifications = useCallback(async () => {
    const response = await supportApi.get("/notifications");

    setNotifications(
      response.data?.data || {
        unreadTickets: 0,
        unreadMessages: 0,
      },
    );
  }, []);

  useEffect(() => {
    if (!agent) return;

    const refresh = () => {
      loadTickets(pagination.page).catch(console.error);
      loadNotifications().catch(console.error);
    };

    refresh();

    const interval = setInterval(refresh, 15000);

    return () => clearInterval(interval);
  }, [agent, pagination.page, loadTickets, loadNotifications]);

  const logout = useCallback(() => {
    sessionStorage.removeItem("ewc_support_agent_token");

    setToken("");
    setAgent(null);
    setTickets([]);
    setMessages([]);
    setSelectedTicket(null);
    setError("");
    setNotice("");
  }, []);

  const loadTickets = useCallback(
    async (page = 1) => {
      const { data } = await supportApi.get("/tickets", {
        params: {
          page,
          limit: 20,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
      });

      setTickets(data.data?.tickets || []);

      setPagination(
        data.data?.pagination || {
          page: 1,
          totalPages: 0,
          total: 0,
        },
      );
    },
    [statusFilter],
  );

  const openTicket = useCallback(async (ticketId) => {
    const { data } = await supportApi.get(`/tickets/${ticketId}`);

    setSelectedTicket(data.data?.ticket || null);
    setMessages(data.data?.messages || []);
    setReply("");
    await Promise.all([loadNotifications(), loadTickets(pagination.page)]);
  }, []);

  // Validate existing support session.
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const verifySession = async () => {
      try {
        const { data } = await supportApi.get("/me");

        if (!cancelled) {
          setAgent(data.data);
        }
      } catch (err) {
        if (cancelled) return;

        if ([401, 403].includes(err.response?.status)) {
          logout();
        } else {
          setError(errorMessage(err));
        }
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  useEffect(() => {
    if (!agent) return;

    loadTickets(1).catch((err) => setError(errorMessage(err)));
  }, [agent, loadTickets]);

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const { data } = await supportApi.post("/login", {
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
      });

      sessionStorage.setItem("ewc_support_agent_token", data.token);

      setToken(data.token);
      setAgent(data.agent);

      setCredentials((prev) => ({
        ...prev,
        password: "",
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();

    if (!selectedTicket || !reply.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    const ticketId = selectedTicket.id;

    try {
      await supportApi.post(`/tickets/${ticketId}/reply`, {
        message: reply.trim(),
      });

      await openTicket(ticketId);
      await loadTickets(pagination.page);

      setNotice("Reply sent to the member.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (nextStatus) => {
    if (!selectedTicket) return;

    setBusy(true);
    setError("");
    setNotice("");

    const ticketId = selectedTicket.id;

    try {
      await supportApi.patch(`/tickets/${ticketId}/status`, {
        status: nextStatus,
      });

      await openTicket(ticketId);
      await loadTickets(pagination.page);

      setNotice(`Ticket ${nextStatus}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ==================================================
  // SUPPORT AGENT LOGIN
  // ==================================================

  if (!token || !agent) {
    return (
      <main className={styles.page}>
        <div className={styles.loginCard}>
          <img src="/logo.png" alt="EWC Logo" className={styles.logo} />

          <div className={styles.loginIcon}>
            <Headset size={28} />
          </div>

          <h1>Support Staff Login</h1>

          <p>Sign in to manage your assigned support tickets.</p>

          {error && <div className={styles.error}>{error}</div>}

          <form className={styles.loginForm} onSubmit={handleLogin}>
            <label>Email Address</label>

            <div className={styles.inputWrap}>
              <Mail size={18} />

              <input
                type="email"
                value={credentials.email}
                onChange={(e) =>
                  setCredentials((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder="Enter staff email"
                required
              />
            </div>

            <label>Password</label>

            <div className={styles.inputWrap}>
              <LockKeyhole size={18} />

              <input
                type="password"
                value={credentials.password}
                onChange={(e) =>
                  setCredentials((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                placeholder="Enter password"
                required
              />
            </div>

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={loading}
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ==================================================
  // SUPPORT AGENT DASHBOARD
  // ==================================================

  return (
    <main className={styles.page}>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <Headset size={25} />

            <div>
              <h1>EWC Support Desk</h1>
              {notifications.unreadMessages > 0 && (
                <span className={styles.notificationBadge}>
                  {notifications.unreadMessages} new messages
                </span>
              )}
              <p>Welcome, {agent.name}</p>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() =>
                loadTickets(pagination.page).catch((err) =>
                  setError(errorMessage(err)),
                )
              }
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button type="button" onClick={logout}>
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.filterBar}>
          <div>
            <h2>My Assigned Tickets</h2>
            <span>{pagination.total} tickets</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelectedTicket(null);
            }}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className={styles.workspace}>
          {/* ======================================
              TICKET LIST
          ====================================== */}

          <aside className={styles.ticketList}>
            {tickets.length === 0 && (
              <div className={styles.empty}>No assigned tickets found.</div>
            )}

            {tickets.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                className={`${styles.ticketItem} ${
                  selectedTicket?.id === ticket.id ? styles.selectedTicket : ""
                }`}
                onClick={async () => {
                  setError("");
                  setNotice("");

                  try {
                    await openTicket(ticket.id);
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                <div className={styles.ticketTop}>
                  <strong>#{ticket.id}</strong>

                  <span>{ticket.status}</span>
                </div>

                <h3>{ticket.subject}</h3>

                <div className={styles.latestReply}>
                  <span>
                    Latest:{" "}
                    {ticket.last_message_at
                      ? new Date(ticket.last_message_at).toLocaleString()
                      : "No replies"}
                  </span>

                  <small>
                    {ticket.last_sender_type === "member"
                      ? "Member replied"
                      : ticket.last_sender_type === "admin"
                        ? "Support replied"
                        : ""}
                  </small>
                </div>

                <p>
                  {ticket.member_name} ({ticket.member_username})
                </p>

                {ticket.unreadCount > 0 && (
                  <span className={styles.unreadBadge}>
                    {ticket.unreadCount} new{" "}
                    {ticket.unreadCount === 1 ? "reply" : "replies"}
                  </span>
                )}
              </button>
            ))}

            {pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() =>
                    loadTickets(pagination.page - 1).catch((err) =>
                      setError(errorMessage(err)),
                    )
                  }
                >
                  Previous
                </button>

                <span>
                  {pagination.page} / {pagination.totalPages}
                </span>

                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() =>
                    loadTickets(pagination.page + 1).catch((err) =>
                      setError(errorMessage(err)),
                    )
                  }
                >
                  Next
                </button>
              </div>
            )}
          </aside>

          {/* ======================================
              CONVERSATION
          ====================================== */}

          <section className={styles.conversation}>
            {!selectedTicket ? (
              <div className={styles.empty}>
                Select a ticket to view its conversation.
              </div>
            ) : (
              <>
                <div className={styles.conversationHeader}>
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => setSelectedTicket(null)}
                  >
                    <ArrowLeft size={15} />
                    Back
                  </button>

                  <h2>{selectedTicket.subject}</h2>

                  <p>
                    Ticket #{selectedTicket.id} · {selectedTicket.member_name}
                  </p>

                  <button
                    type="button"
                    className={styles.statusButton}
                    disabled={busy}
                    onClick={() =>
                      changeStatus(
                        selectedTicket.status === "open" ? "closed" : "open",
                      )
                    }
                  >
                    {selectedTicket.status === "open" ? (
                      <>
                        <CheckCircle2 size={16} />
                        Close Ticket
                      </>
                    ) : (
                      <>
                        <RotateCcw size={16} />
                        Reopen Ticket
                      </>
                    )}
                  </button>
                </div>

                <div className={styles.messages}>
                  {messages.map((message) => {
                    const isMember = message.sender_type === "member";

                    return (
                      <div
                        key={message.id}
                        className={`${styles.message} ${
                          isMember ? styles.memberMessage : styles.staffMessage
                        }`}
                      >
                        <strong>{isMember ? "Member" : "EWC Support"}</strong>

                        <p>{message.message}</p>

                        <small>
                          {new Date(message.created_at).toLocaleString()}
                        </small>
                      </div>
                    );
                  })}
                </div>

                {selectedTicket.status === "open" && (
                  <form className={styles.replyForm} onSubmit={handleReply}>
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Write a reply to the member..."
                      maxLength={10000}
                      rows={4}
                      required
                    />

                    <button
                      type="submit"
                      className={styles.primaryButton}
                      disabled={busy || !reply.trim()}
                    >
                      <Send size={16} />
                      {busy ? "Sending..." : "Send Reply"}
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default SupportAgent;
