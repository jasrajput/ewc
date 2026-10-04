import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  GitBranch,
  Network,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import adminApi from "../../../services/adminApi";

import styles from "./AdminNetworkTree.module.css";


// ======================================================
// HELPERS
// ======================================================

const formatAmount = (value) => {
  const amount = Number(value || 0);

  return `$${amount.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`;
};


const getInitial = (node) => {
  return (
    node?.name ||
    node?.user_id ||
    "M"
  )
    .charAt(0)
    .toUpperCase();
};


// ======================================================
// RECURSIVELY UPDATE A NODE
// ======================================================

const updateNodeById = (
  node,
  nodeId,
  updater
) => {
  if (!node) {
    return node;
  }

  if (
    Number(node.id) ===
    Number(nodeId)
  ) {
    return updater(node);
  }

  if (
    !Array.isArray(node.children)
  ) {
    return node;
  }

  return {
    ...node,

    children: node.children.map(
      (child) =>
        updateNodeById(
          child,
          nodeId,
          updater
        )
    ),
  };
};


// ======================================================
// Genealogy TREE
// ======================================================

const AdminNetworkTree = ({
  memberUserId,
  onMakeRoot,
  onAuthError,
}) => {
  const navigate = useNavigate();

  const [tree, setTree] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");


  // ====================================================
  // LOAD ROOT
  // ====================================================

  const loadTree =
    useCallback(async () => {
      if (!memberUserId) {
        setTree(null);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response =
          await adminApi.get(
            "/admin/network/tree",
            {
              params: {
                member:
                  memberUserId,
              },
            }
          );

        const root =
          response.data?.data
            ?.root || null;

        if (!root) {
          setTree(null);

          setError(
            "Genealogy tree data was not found."
          );

          return;
        }


        // Root is open because its immediate
        // children were returned by the API.
        const preparedRoot = {
          ...root,

          expanded: true,

          childrenLoaded: true,

          loadingChildren: false,

          children: Array.isArray(
            root.children
          )
            ? root.children.map(
                (child) => ({
                  ...child,

                  expanded: false,

                  childrenLoaded:
                    !child.hasChildren,

                  loadingChildren:
                    false,

                  children: [],
                })
              )
            : [],
        };


        setTree(preparedRoot);
      } catch (err) {
        console.error(
          "Admin genealogy tree error:",
          err
        );

        if (
          onAuthError &&
          onAuthError(err)
        ) {
          return;
        }

        setTree(null);

        setError(
          err.response?.data
            ?.message ||
            "Unable to load team genealogy."
        );
      } finally {
        setLoading(false);
      }
    }, [
      memberUserId,
      onAuthError,
    ]);


  useEffect(() => {
    loadTree();
  }, [loadTree]);


  // ====================================================
  // EXPAND / COLLAPSE
  // ====================================================

  const toggleNode =
    async (node) => {
      if (!node?.hasChildren) {
        return;
      }


      // Already loaded.
      // Just expand/collapse locally.
      if (node.childrenLoaded) {
        setTree((current) =>
          updateNodeById(
            current,
            node.id,
            (target) => ({
              ...target,

              expanded:
                !target.expanded,
            })
          )
        );

        return;
      }


      // Mark this node as loading.
      setTree((current) =>
        updateNodeById(
          current,
          node.id,
          (target) => ({
            ...target,

            loadingChildren: true,
          })
        )
      );


      try {
        const response =
          await adminApi.get(
            `/admin/network/tree/${node.id}/children`
          );

        const children =
          response.data?.data
            ?.children || [];


        const preparedChildren =
          Array.isArray(children)
            ? children.map(
                (child) => ({
                  ...child,

                  expanded: false,

                  childrenLoaded:
                    !child.hasChildren,

                  loadingChildren:
                    false,

                  children: [],
                })
              )
            : [];


        setTree((current) =>
          updateNodeById(
            current,
            node.id,
            (target) => ({
              ...target,

              children:
                preparedChildren,

              childrenLoaded: true,

              loadingChildren:
                false,

              expanded: true,
            })
          )
        );
      } catch (err) {
        console.error(
          "Genealogy child load error:",
          err
        );

        if (
          onAuthError &&
          onAuthError(err)
        ) {
          return;
        }

        setTree((current) =>
          updateNodeById(
            current,
            node.id,
            (target) => ({
              ...target,

              loadingChildren:
                false,
            })
          )
        );

        setError(
          err.response?.data
            ?.message ||
            "Unable to load team children."
        );
      }
    };


  // ====================================================
  // MEMBER DETAILS
  // ====================================================

  const viewMember = (node) => {
    navigate(
      `/admin/members/${node.id}`
    );
  };


  // ====================================================
  // MEMBER EARNINGS
  // ====================================================

  const viewEarnings = (node) => {
    navigate(
      `/admin/earnings?member=${encodeURIComponent(
        node.user_id
      )}`
    );
  };


  // ====================================================
  // MAKE NODE THE NEW ROOT
  // ====================================================

  const makeRoot = (node) => {
    if (!node?.user_id) {
      return;
    }

    if (onMakeRoot) {
      onMakeRoot(node);
    }
  };


  // ====================================================
  // RENDER
  // ====================================================

  return (
    <div
      className={styles.panel}
    >
      <div
        className={
          styles.panelHeader
        }
      >
        <div
          className={
            styles.headerTitle
          }
        >
          <div
            className={
              styles.headerIcon
            }
          >
            <Network size={18} />
          </div>

          <div>
            <h3>
              Visual Team Tree
            </h3>

            <p>
              Expand members to explore
              the sponsorship structure.
            </p>
          </div>
        </div>


        <button
          type="button"
          className={
            styles.refreshButton
          }
          onClick={loadTree}
          disabled={loading}
        >
          <RefreshCw
            size={14}
            className={
              loading
                ? styles.spinning
                : ""
            }
          />

          Refresh Tree
        </button>
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
        <div
          className={
            styles.loading
          }
        >
          <div
            className={
              styles.loader
            }
          />

          <span>
            Loading team genealogy...
          </span>
        </div>
      ) : !tree ? (
        <div
          className={
            styles.empty
          }
        >
          <GitBranch size={26} />

          <strong>
            No team genealogy
          </strong>

          <span>
            No sponsorship data was
            found for this member.
          </span>
        </div>
      ) : (
        <div
          className={
            styles.treeViewport
          }
        >
          <div
            className={
              styles.treeCanvas
            }
          >
            <TreeBranch
              node={tree}
              depth={0}
              isRoot
              onToggle={
                toggleNode
              }
              onViewMember={
                viewMember
              }
              onViewEarnings={
                viewEarnings
              }
              onMakeRoot={
                makeRoot
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};


// ======================================================
// TREE BRANCH
// ======================================================

const TreeBranch = ({
  node,
  depth,
  isRoot = false,
  onToggle,
  onViewMember,
  onViewEarnings,
  onMakeRoot,
}) => {
  const hasVisibleChildren =
    node.expanded &&
    Array.isArray(node.children) &&
    node.children.length > 0;


  return (
    <div
      className={
        styles.branch
      }
    >
      <div
        className={
          styles.nodeRow
        }
      >
        <TreeNode
          node={node}
          depth={depth}
          isRoot={isRoot}
          onToggle={onToggle}
          onViewMember={
            onViewMember
          }
          onViewEarnings={
            onViewEarnings
          }
          onMakeRoot={
            onMakeRoot
          }
        />
      </div>


      {hasVisibleChildren && (
        <div
          className={
            styles.childrenArea
          }
        >
          <div
            className={
              styles.verticalLine
            }
          />

          <div
            className={
              styles.children
            }
          >
            {node.children.map(
              (child) => (
                <div
                  key={child.id}
                  className={
                    styles.childBranch
                  }
                >
                  <div
                    className={
                      styles.childConnector
                    }
                  />

                  <TreeBranch
                    node={child}
                    depth={
                      depth + 1
                    }
                    onToggle={
                      onToggle
                    }
                    onViewMember={
                      onViewMember
                    }
                    onViewEarnings={
                      onViewEarnings
                    }
                    onMakeRoot={
                      onMakeRoot
                    }
                  />
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};


// ======================================================
// TREE NODE
// ======================================================

const TreeNode = ({
  node,
  depth,
  isRoot,
  onToggle,
  onViewMember,
  onViewEarnings,
  onMakeRoot,
}) => {
  return (
    <div
      className={`${styles.node} ${
        isRoot
          ? styles.rootNode
          : ""
      } ${
        node.blocked
          ? styles.blockedNode
          : ""
      }`}
    >
      {/* ======================================
          TOP
      ====================================== */}

      <div
        className={
          styles.nodeTop
        }
      >
        <div
          className={
            styles.avatar
          }
        >
          {getInitial(node)}
        </div>


        <div
          className={
            styles.identity
          }
        >
          <div
            className={
              styles.nameRow
            }
          >
            <strong>
              {node.name ||
                "Unnamed Member"}
            </strong>

            {isRoot && (
              <span
                className={
                  styles.rootBadge
                }
              >
                ROOT
              </span>
            )}
          </div>

          <span
            className={
              styles.userId
            }
          >
            {node.user_id}
          </span>
        </div>


        {node.hasChildren && (
          <button
            type="button"
            className={
              styles.expandButton
            }
            onClick={() =>
              onToggle(node)
            }
            disabled={
              node.loadingChildren
            }
            title={
              node.expanded
                ? "Collapse"
                : "Expand"
            }
          >
            {node.loadingChildren ? (
              <span
                className={
                  styles.miniLoader
                }
              />
            ) : node.expanded ? (
              <ChevronDown
                size={16}
              />
            ) : (
              <ChevronRight
                size={16}
              />
            )}
          </button>
        )}
      </div>


      {/* ======================================
          STATUS
      ====================================== */}

      <div
        className={
          styles.badges
        }
      >
        <span
          className={
            node.activated
              ? styles.activatedBadge
              : styles.inactiveBadge
          }
        >
          {node.activated
            ? "Activated"
            : "Inactive"}
        </span>

        {node.blocked && (
          <span
            className={
              styles.blockedBadge
            }
          >
            Blocked
          </span>
        )}

        <span
          className={
            styles.rankBadge
          }
        >
          {node.rankLabel ||
            "Unranked"}
        </span>
      </div>


      {/* ======================================
          STATS
      ====================================== */}

      <div
        className={
          styles.nodeStats
        }
      >
        <div>
          <span>
            <CircleDollarSign
              size={12}
            />
            Package
          </span>

          <strong>
            {formatAmount(
              node.package_amount
            )}
          </strong>
        </div>

        <div>
          <span>
            <Users size={12} />
            Directs
          </span>

          <strong>
            {Number(
              node.directCount || 0
            ).toLocaleString()}
          </strong>
        </div>
      </div>


      {/* ======================================
          ACTIONS
      ====================================== */}

      <div
        className={
          styles.nodeActions
        }
      >
        <button
          type="button"
          onClick={() =>
            onViewMember(node)
          }
          title="View member details"
        >
          <UserRound size={13} />
          Member
        </button>

        <button
          type="button"
          onClick={() =>
            onViewEarnings(node)
          }
          title="View earnings"
        >
          <CircleDollarSign
            size={13}
          />
          Earnings
        </button>

        {!isRoot && (
          <button
            type="button"
            className={
              styles.rootAction
            }
            onClick={() =>
              onMakeRoot(node)
            }
            title="Make this member the team root"
          >
            <ExternalLink
              size={13}
            />
            Make Root
          </button>
        )}
      </div>


      {/* ======================================
          DEPTH
      ====================================== */}

      {depth > 0 && (
        <div
          className={
            styles.depthLabel
          }
        >
          Depth {depth}
        </div>
      )}
    </div>
  );
};


export default AdminNetworkTree;