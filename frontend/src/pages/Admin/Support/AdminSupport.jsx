import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Search,
  RefreshCw,
  MessageCircle,
  Inbox,
  Clock,
  CheckCircle2,
  X,
  Send,
  User,
  Mail,
  Wallet,
  ExternalLink,
  ChevronRight,
  LifeBuoy,
  RotateCcw,
} from "lucide-react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import adminApi from "../../../services/adminApi";

import AdminLayout from "../../../components/admin/layout/AdminLayout";

import styles from "./AdminSupport.module.css";


// ======================================================
// HELPERS
// ======================================================

const formatDate = (value) => {
  if (!value) return "—";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
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


const shorten = (
  value,
  max = 90
) => {
  const text =
    String(value || "").trim();

  if (!text) {
    return "No message";
  }

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}...`;
};


const shortWallet = (value) => {
  const wallet =
    String(value || "");

  if (wallet.length < 15) {
    return wallet || "—";
  }

  return `${wallet.slice(
    0,
    7
  )}...${wallet.slice(-5)}`;
};


// ======================================================
// PAGE
// ======================================================

const AdminSupport = () => {
  const navigate =
    useNavigate();


  const [
    summary,
    setSummary,
  ] = useState({
    totalTickets: 0,
    openTickets: 0,
    closedTickets: 0,
    unreadTickets: 0,
    awaitingAdmin: 0,
  });


  const [
    tickets,
    setTickets,
  ] = useState([]);


  const [
    pagination,
    setPagination,
  ] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  // ====================================================
  // FILTERS
  // ====================================================

  const [
    searchInput,
    setSearchInput,
  ] = useState("");


  const [
    search,
    setSearch,
  ] = useState("");


  const [
    status,
    setStatus,
  ] = useState("");


  const [searchParams] =
  useSearchParams();

const [
  unreadOnly,
  setUnreadOnly,
] = useState(
  searchParams.get("unread") === "1"
);

  // const [
  //   unreadOnly,
  //   setUnreadOnly,
  // ] = useState(false);


  const [
    category,
    setCategory,
  ] = useState("");


  const [
    sort,
    setSort,
  ] = useState("newest");


  // ====================================================
  // DRAWER
  // ====================================================

  const [
    selectedId,
    setSelectedId,
  ] = useState(null);


  const [
    details,
    setDetails,
  ] = useState(null);


  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);


  const [
    detailsError,
    setDetailsError,
  ] = useState("");


  const [
    reply,
    setReply,
  ] = useState("");


  const [
    sending,
    setSending,
  ] = useState(false);


  const [
    changingStatus,
    setChangingStatus,
  ] = useState(false);


  // ====================================================
  // SUMMARY
  // ====================================================

  const loadSummary =
    useCallback(
      async () => {
        try {
          const response =
            await adminApi.get(
              "/admin/support/summary"
            );

          setSummary(
            response.data?.data || {
              totalTickets: 0,
              openTickets: 0,
              closedTickets: 0,
              unreadTickets: 0,
              awaitingAdmin: 0,
            }
          );

        } catch (error) {
          console.error(
            "Admin support summary:",
            error
          );
        }
      },
      []
    );


  // ====================================================
  // TICKETS
  // ====================================================

  const loadTickets =
    useCallback(
      async (page = 1) => {
        try {
          setLoading(true);
          setError("");


          const params = {
            page,
            limit: 20,
            sort,
          };


          if (search) {
            params.search =
              search;
          }


          if (status) {
            params.status =
              status;
          }


          if (category) {
            params.category =
              category;
          }


          if (unreadOnly) {
            params.unread = 1;
          }


          const response =
            await adminApi.get(
              "/admin/support",
              {
                params,
              }
            );


          setTickets(
            response.data?.data
              ?.tickets || []
          );


          setPagination(
            response.data?.data
              ?.pagination || {
              page: 1,
              limit: 20,
              total: 0,
              totalPages: 0,
            }
          );

        } catch (error) {
          console.error(
            "Admin support tickets:",
            error
          );

          setTickets([]);

          setError(
            error.response?.data
              ?.message ||
              "Unable to load support tickets."
          );

        } finally {
          setLoading(false);
        }
      },
      [
        search,
        status,
        category,
        unreadOnly,
        sort,
      ]
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

  const submitSearch = (
    event
  ) => {
    event.preventDefault();

    setSearch(
      searchInput.trim()
    );
  };


  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setCategory("");
    setUnreadOnly(false);
    setSort("newest");
  };


  // ====================================================
  // OPEN TICKET
  // ====================================================

  const openTicket =
    async (ticketId) => {
      try {
        setSelectedId(ticketId);

        setDetails(null);
        setReply("");
        setDetailsError("");

        setDetailsLoading(true);


        const response =
          await adminApi.get(
            `/admin/support/${ticketId}`
          );


        setDetails(
          response.data?.data ||
            null
        );


        await Promise.all([
          loadSummary(),
          loadTickets(
            pagination.page
          ),
        ]);

      } catch (error) {
        console.error(
          "Admin support details:",
          error
        );

        setDetailsError(
          error.response?.data
            ?.message ||
            "Unable to load ticket."
        );

      } finally {
        setDetailsLoading(false);
      }
    };


  const refreshDetails =
    async () => {
      if (!selectedId) {
        return;
      }

      try {
        const response =
          await adminApi.get(
            `/admin/support/${selectedId}`
          );

        setDetails(
          response.data?.data ||
            null
        );

      } catch (error) {
        console.error(error);
      }
    };


  const closeDrawer = () => {
    setSelectedId(null);
    setDetails(null);
    setReply("");
    setDetailsError("");
  };


  // ====================================================
  // ADMIN REPLY
  // ====================================================

  const sendReply =
    async (event) => {
      event.preventDefault();


      const message =
        reply.trim();


      if (
        !message ||
        !selectedId
      ) {
        return;
      }


      try {
        setSending(true);
        setDetailsError("");


        await adminApi.post(
          `/admin/support/${selectedId}/reply`,
          {
            message,
          }
        );


        setReply("");


        await Promise.all([
          refreshDetails(),
          loadSummary(),
          loadTickets(
            pagination.page
          ),
        ]);

      } catch (error) {
        console.error(
          "Admin support reply:",
          error
        );

        setDetailsError(
          error.response?.data
            ?.message ||
            "Unable to send reply."
        );

      } finally {
        setSending(false);
      }
    };


  // ====================================================
  // CLOSE / REOPEN
  // ====================================================

  const changeStatus =
    async (nextStatus) => {
      if (!selectedId) {
        return;
      }


      try {
        setChangingStatus(true);
        setDetailsError("");


        await adminApi.patch(
          `/admin/support/${selectedId}/status`,
          {
            status:
              nextStatus,
          }
        );


        await Promise.all([
          refreshDetails(),
          loadSummary(),
          loadTickets(
            pagination.page
          ),
        ]);

      } catch (error) {
        console.error(
          "Support status:",
          error
        );

        setDetailsError(
          error.response?.data
            ?.message ||
            "Unable to update ticket."
        );

      } finally {
        setChangingStatus(false);
      }
    };


  // ====================================================
  // RENDER
  // ====================================================

  return (
    <AdminLayout>
      <div
        className={
          styles.page
        }
      >

        {/* HEADER */}

        <div
          className={
            styles.header
          }
        >
          <div>
            <span
              className={
                styles.eyebrow
              }
            >
              COMMUNICATION
            </span>

            <h1>
              Support Tickets
            </h1>

            <p>
              Review member support
              requests and continue
              conversations.
            </p>
          </div>


          <button
            type="button"
            className={
              styles.refresh
            }
            onClick={() => {
              loadSummary();

              loadTickets(
                pagination.page
              );
            }}
          >
            <RefreshCw
              size={15}
            />

            Refresh
          </button>
        </div>


        {/* SUMMARY */}

        <div
          className={
            styles.summaryGrid
          }
        >
          <Summary
            icon={Inbox}
            label="Total Tickets"
            value={
              summary.totalTickets
            }
          />

          <Summary
            icon={
              MessageCircle
            }
            label="Open"
            value={
              summary.openTickets
            }
          />

          <Summary
            icon={Clock}
            label="Awaiting Admin"
            value={
              summary.awaitingAdmin
            }
            highlight={
              summary.awaitingAdmin >
              0
            }
          />

          <Summary
            icon={
              CheckCircle2
            }
            label="Closed"
            value={
              summary.closedTickets
            }
          />
        </div>


        {/* FILTERS */}

        <section
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.filters
            }
          >
            <form
              className={
                styles.search
              }
              onSubmit={
                submitSearch
              }
            >
              <Search
                size={15}
              />

              <input
                value={
                  searchInput
                }
                onChange={(
                  event
                ) =>
                  setSearchInput(
                    event.target.value
                  )
                }
                placeholder="Ticket, member, email, wallet..."
              />

              <button>
                Search
              </button>
            </form>


            <select
              value={status}
              onChange={(
                event
              ) =>
                setStatus(
                  event.target.value
                )
              }
            >
              <option value="">
                All Status
              </option>

              <option value="open">
                Open
              </option>

              <option value="closed">
                Closed
              </option>
            </select>


            <select
              value={category}
              onChange={(
                event
              ) =>
                setCategory(
                  event.target.value
                )
              }
            >
              <option value="">
                All Categories
              </option>

              <option value="Account">
                Account
              </option>

              <option value="Investment">
                Investment
              </option>

              <option value="Withdrawal">
                Withdrawal
              </option>

              <option value="Wallet">
                Wallet
              </option>

              <option value="Earnings">
                Earnings
              </option>

              <option value="Network">
                Network
              </option>

              <option value="Other">
                Other
              </option>
            </select>


            <select
              value={sort}
              onChange={(
                event
              ) =>
                setSort(
                  event.target.value
                )
              }
            >
              <option value="newest">
                Latest Activity
              </option>

              <option value="updated">
                Recently Updated
              </option>

              <option value="oldest">
                Oldest
              </option>
            </select>


            <label
              className={
                styles.unreadFilter
              }
            >
              <input
                type="checkbox"
                checked={
                  unreadOnly
                }
                onChange={(
                  event
                ) =>
                  setUnreadOnly(
                    event.target.checked
                  )
                }
              />

              Needs Reply
            </label>


            {(search ||
              status ||
              category ||
              unreadOnly ||
              sort !==
                "newest") && (
              <button
                type="button"
                className={
                  styles.clear
                }
                onClick={
                  clearFilters
                }
              >
                <X
                  size={13}
                />

                Clear
              </button>
            )}
          </div>


          {/* TABLE HEADER */}

          <div
            className={
              styles.sectionHeader
            }
          >
            <div>
              <h2>
                Ticket Inbox
              </h2>

              <span>
                {pagination.total}{" "}
                tickets
              </span>
            </div>

            {summary.unreadTickets >
              0 && (
              <div
                className={
                  styles.unreadCount
                }
              >
                {
                  summary.unreadTickets
                }{" "}
                with new member
                activity
              </div>
            )}
          </div>


          {error && (
            <div
              className={
                styles.error
              }
            >
              {error}
            </div>
          )}


          {loading ? (
            <Loading />
          ) : tickets.length ===
            0 ? (
            <Empty />
          ) : (
            <div
              className={
                styles.tableWrap
              }
            >
              <table>
                <thead>
                  <tr>
                    <th>
                      Ticket
                    </th>

                    <th>
                      Member
                    </th>

                    <th>
                      Subject
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Activity
                    </th>

                    <th />
                  </tr>
                </thead>

                <tbody>
                  {tickets.map(
                    (ticket) => (
                      <TicketRow
                        key={
                          ticket.id
                        }
                        ticket={
                          ticket
                        }
                        onOpen={() =>
                          openTicket(
                            ticket.id
                          )
                        }
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}


          {/* PAGINATION */}

          {!loading &&
            pagination.totalPages >
              1 && (
              <div
                className={
                  styles.pagination
                }
              >
                <button
                  disabled={
                    pagination.page <=
                    1
                  }
                  onClick={() =>
                    loadTickets(
                      pagination.page -
                        1
                    )
                  }
                >
                  Previous
                </button>

                <span>
                  Page{" "}
                  {
                    pagination.page
                  }{" "}
                  of{" "}
                  {
                    pagination.totalPages
                  }
                </span>

                <button
                  disabled={
                    pagination.page >=
                    pagination.totalPages
                  }
                  onClick={() =>
                    loadTickets(
                      pagination.page +
                        1
                    )
                  }
                >
                  Next
                </button>
              </div>
            )}
        </section>
      </div>


      {/* =======================================
          DRAWER
      ======================================= */}

      {selectedId && (
        <div
          className={
            styles.overlay
          }
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDrawer();
            }
          }}
        >
          <aside
            className={
              styles.drawer
            }
          >
            <div
              className={
                styles.drawerHeader
              }
            >
              <div>
                <span>
                  SUPPORT TICKET #
                  {selectedId}
                </span>

                <h2>
                  {details?.ticket
                    ?.subject ||
                    "Support Ticket"}
                </h2>

                {details?.ticket && (
                  <div
                    className={
                      styles.drawerMeta
                    }
                  >
                    <StatusBadge
                      status={
                        details.ticket
                          .status
                      }
                    />

                    {details.ticket
                      .category && (
                      <small>
                        {
                          details.ticket
                            .category
                        }
                      </small>
                    )}
                  </div>
                )}
              </div>


              <button
                onClick={
                  closeDrawer
                }
              >
                <X
                  size={18}
                />
              </button>
            </div>


            {detailsLoading ? (
              <Loading />
            ) : details ? (
              <>
                {/* MEMBER */}

                <div
                  className={
                    styles.memberCard
                  }
                >
                  <div
                    className={
                      styles.memberIcon
                    }
                  >
                    <User
                      size={18}
                    />
                  </div>

                  <div
                    className={
                      styles.memberInfo
                    }
                  >
                    <strong>
                      {details.ticket
                        .member.name ||
                        "Member"}
                    </strong>

                    <span>
                      {
                        details.ticket
                          .member.userId
                      }
                    </span>
                  </div>


                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/admin/members/${details.ticket.member.id}`
                      )
                    }
                  >
                    View Member

                    <ExternalLink
                      size={12}
                    />
                  </button>


                  <div
                    className={
                      styles.memberDetails
                    }
                  >
                    <span>
                      <Mail
                        size={12}
                      />

                      {
                        details.ticket
                          .member.email ||
                        "—"
                      }
                    </span>

                    <span>
                      <Wallet
                        size={12}
                      />

                      {shortWallet(
                        details.ticket
                          .member.wallet
                      )}
                    </span>
                  </div>
                </div>


                {/* CONVERSATION */}

                <div
                  className={
                    styles.conversation
                  }
                >
                  {details.messages?.map(
                    (message) => (
                      <Message
                        key={
                          message.id
                        }
                        message={
                          message
                        }
                      />
                    )
                  )}
                </div>


                {detailsError && (
                  <div
                    className={
                      styles.drawerError
                    }
                  >
                    {detailsError}
                  </div>
                )}


                {/* FOOTER */}

                <div
                  className={
                    styles.drawerFooter
                  }
                >
                  {details.ticket
                    .status ===
                  "open" ? (
                    <>
                      <form
                        onSubmit={
                          sendReply
                        }
                        className={
                          styles.replyForm
                        }
                      >
                        <textarea
                          value={reply}
                          onChange={(
                            event
                          ) =>
                            setReply(
                              event.target
                                .value
                            )
                          }
                          maxLength={
                            10000
                          }
                          placeholder="Reply to member..."
                        />

                        <div
                          className={
                            styles.replyActions
                          }
                        >
                          <span>
                            {
                              reply.length
                            }
                            /10000
                          </span>

                          <button
                            type="submit"
                            disabled={
                              sending ||
                              !reply.trim()
                            }
                          >
                            <Send
                              size={14}
                            />

                            {sending
                              ? "Sending..."
                              : "Send Reply"}
                          </button>
                        </div>
                      </form>


                      <button
                        type="button"
                        className={
                          styles.closeTicket
                        }
                        disabled={
                          changingStatus
                        }
                        onClick={() =>
                          changeStatus(
                            "closed"
                          )
                        }
                      >
                        <CheckCircle2
                          size={14}
                        />

                        Close Ticket
                      </button>
                    </>
                  ) : (
                    <div
                      className={
                        styles.closedActions
                      }
                    >
                      <div>
                        <CheckCircle2
                          size={15}
                        />

                        This ticket is
                        closed.
                      </div>

                      <button
                        type="button"
                        disabled={
                          changingStatus
                        }
                        onClick={() =>
                          changeStatus(
                            "open"
                          )
                        }
                      >
                        <RotateCcw
                          size={13}
                        />

                        Reopen Ticket
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div
                className={
                  styles.error
                }
              >
                {detailsError ||
                  "Unable to load ticket."}
              </div>
            )}
          </aside>
        </div>
      )}
    </AdminLayout>
  );
};


// ======================================================
// SMALL COMPONENTS
// ======================================================

const Summary = ({
  icon: Icon,
  label,
  value,
  highlight,
}) => (
  <div
    className={`${styles.summaryCard} ${
      highlight
        ? styles.highlight
        : ""
    }`}
  >
    <div>
      <Icon size={18} />
    </div>

    <section>
      <span>{label}</span>

      <strong>
        {Number(
          value || 0
        ).toLocaleString()}
      </strong>
    </section>
  </div>
);


const TicketRow = ({
  ticket,
  onOpen,
}) => (
  <tr
    className={
      ticket.unread
        ? styles.unreadRow
        : ""
    }
    onClick={onOpen}
  >
    <td>
      <div
        className={
          styles.ticketId
        }
      >
        {ticket.unread && (
          <i />
        )}

        #{ticket.id}
      </div>
    </td>


    <td>
      <div
        className={
          styles.memberCell
        }
      >
        <strong>
          {ticket.member.name ||
            "Member"}
        </strong>

        <span>
          {ticket.member.userId}
        </span>
      </div>
    </td>


    <td>
      <div
        className={
          styles.subjectCell
        }
      >
        <strong>
          {ticket.subject}
        </strong>

        <span>
          {shorten(
            ticket.lastMessage
          )}
        </span>

        {ticket.category && (
          <small>
            {ticket.category}
          </small>
        )}
      </div>
    </td>


    <td>
      <StatusBadge
        status={ticket.status}
      />
    </td>


    <td>
      <div
        className={
          styles.activityCell
        }
      >
        <span>
          {formatDate(
            ticket.lastMessageAt ||
              ticket.updatedAt
          )}
        </span>

        <small>
          {ticket.lastSenderType ===
          "member"
            ? "Member replied"
            : "Admin replied"}
        </small>
      </div>
    </td>


    <td>
      <ChevronRight
        size={16}
      />
    </td>
  </tr>
);


const StatusBadge = ({
  status,
}) => (
  <span
    className={
      status === "closed"
        ? styles.closedBadge
        : styles.openBadge
    }
  >
    {status === "closed"
      ? "Closed"
      : "Open"}
  </span>
);


const Message = ({
  message,
}) => {
  const admin =
    message.senderType ===
    "admin";


  return (
    <div
      className={
        admin
          ? styles.adminMessageRow
          : styles.memberMessageRow
      }
    >
      <div
        className={
          admin
            ? styles.adminMessage
            : styles.memberMessage
        }
      >
        <header>
          <strong>
            {admin
              ? "Admin"
              : "Member"}
          </strong>

          <span>
            {formatDate(
              message.createdAt
            )}
          </span>
        </header>

        <p>
          {message.message}
        </p>
      </div>
    </div>
  );
};


const Loading = () => (
  <div
    className={
      styles.loading
    }
  >
    <div
      className={
        styles.spinner
      }
    />

    Loading...
  </div>
);


const Empty = () => (
  <div
    className={
      styles.empty
    }
  >
    <LifeBuoy
      size={27}
    />

    <strong>
      No support tickets
    </strong>

    <span>
      Member support requests
      will appear here.
    </span>
  </div>
);


export default AdminSupport;