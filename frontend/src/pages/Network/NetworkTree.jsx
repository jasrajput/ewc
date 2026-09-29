import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Network,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./NetworkTree.module.css";

// =====================================================
// TREE NODE
// =====================================================

const TreeNode = ({ member, isRoot = false, initialChildren = null }) => {
  const [expanded, setExpanded] = useState(
    Array.isArray(initialChildren) && initialChildren.length > 0,
  );

  const [children, setChildren] = useState(
    Array.isArray(initialChildren) ? initialChildren : [],
  );

  const [loaded, setLoaded] = useState(Array.isArray(initialChildren));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const active = Number(member.package_choose) !== 1;
  const hasDownline = Number(member.downline_count || 0) > 0;

  const formatUsd = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const toggleNode = async () => {
    if (!hasDownline) return;

    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // Already fetched
    if (loaded) return;

    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        `/team/tree/${encodeURIComponent(member.user_id)}`,
      );

      setChildren(response.data.data || []);
      setLoaded(true);
    } catch (err) {
      console.error("Expand tree error:", err);

      setError(err.response?.data?.message || "Unable to load members.");

      setExpanded(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.treeBranch}>
      <div className={`${styles.nodeCard} ${isRoot ? styles.rootNode : ""}`}>
        <div className={styles.nodeTop}>
          <div
            className={`${styles.nodeAvatar} ${
              active ? styles.activeAvatar : styles.inactiveAvatar
            }`}
          >
            <UserRound size={20} />
          </div>

          <div className={styles.nodeIdentity}>
            <strong>{member.name || "EWC Member"}</strong>
            <span>@{member.user_id}</span>
          </div>

          <span
            className={active ? styles.activeStatus : styles.inactiveStatus}
          >
            {active ? "Active" : "Inactive"}
          </span>
        </div>

        <div className={styles.nodeStats}>
          <div>
            <span>Package</span>
            <strong>{formatUsd(member.package_amount)}</strong>
          </div>

          <div>
            <span>Team</span>
            <strong>{Number(member.downline_count || 0)}</strong>
          </div>

          <div>
            <span>Business</span>
            <strong>{formatUsd(member.downline_business)}</strong>
          </div>
        </div>

        {hasDownline ? (
          <button
            className={styles.expandButton}
            onClick={toggleNode}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.smallSpinner} />
                Loading...
              </>
            ) : expanded ? (
              <>
                <ChevronDown size={15} />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight size={15} />
                Expand Team
              </>
            )}
          </button>
        ) : (
          <div className={styles.noDownline}>No Downline</div>
        )}

        {error && <div className={styles.nodeError}>{error}</div>}
      </div>

      {expanded && children.length > 0 && (
        <div className={styles.childrenWrapper}>
          <div className={styles.verticalLine} />

          <div className={styles.childrenRow}>
            {children.map((child) => (
              <div className={styles.childBranch} key={child.id}>
                <div className={styles.childConnector} />

                <TreeNode member={child} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================
// NETWORK TREE PAGE
// =====================================================

const NetworkTree = () => {
  const [root, setRoot] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchTree = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/team/tree");

        setRoot(response.data.data?.root || null);
        setChildren(response.data.data?.children || []);
      } catch (err) {
        console.error("Network tree error:", err);

        setError(err.response?.data?.message || "Unable to load network tree.");
      } finally {
        setLoading(false);
      }
    };

    fetchTree();
  }, [reloadKey]);

  return (
    <UserLayout
      title="Network Tree"
      subtitle="Explore your community structure"
    >
      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>MY NETWORK</span>

          <h2>Network Tree</h2>

          <p>Expand members to explore your referral network level by level.</p>
        </div>

        <button
          className={styles.refreshButton}
          onClick={() => setReloadKey((prev) => prev + 1)}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </section>

      <div className={styles.infoBox}>
        <Network size={16} />

        <span>
          Select <strong>Expand Team</strong> on a member to view their direct
          referrals.
        </span>
      </div>

      <section className={styles.treePanel}>
        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.loadingState}>
            <span className={styles.spinner} />
            <span>Loading network tree...</span>
          </div>
        ) : !root ? (
          <div className={styles.loadingState}>
            <Users size={28} />
            <strong>Network unavailable</strong>
          </div>
        ) : (
          <div className={styles.treeViewport}>
            <div className={styles.treeCanvas}>
              {/* ROOT USER */}

              <div className={styles.rootWrapper}>
                <TreeNode
                  key={`root-${reloadKey}`}
                  member={root}
                  isRoot
                  initialChildren={children}
                />
              </div>

              {/* FIRST LEVEL */}

            
            </div>
          </div>
        )}
      </section>
    </UserLayout>
  );
};

export default NetworkTree;
