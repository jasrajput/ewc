
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  UserRound,
  Users,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";

import api from "../../services/api";
import UserLayout from "../../components/layout/UserLayout";
import styles from "./NetworkTree.module.css";

// =====================================================
// ZOOM SETTINGS
// =====================================================

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.2;

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

// =====================================================
// TREE NODE
// =====================================================

const TreeNode = ({
  member,
  isRoot = false,
  initialChildren = null,
}) => {
  const [expanded, setExpanded] = useState(
    Array.isArray(initialChildren) &&
      initialChildren.length > 0
  );

  const [children, setChildren] = useState(
    Array.isArray(initialChildren) ? initialChildren : []
  );

  const [loaded, setLoaded] = useState(
    Array.isArray(initialChildren)
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const active = Number(member.package_choose) !== 1;
  const hasDownline =
    Number(member.downline_count || 0) > 0;

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

    if (loaded) return;

    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        `/team/tree/${encodeURIComponent(member.user_id)}`
      );

      setChildren(response.data.data || []);
      setLoaded(true);
    } catch (err) {
      console.error("Expand tree error:", err);

      setError(
        err.response?.data?.message ||
          "Unable to load members."
      );

      setExpanded(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.treeBranch}>
      <div
        className={`${styles.nodeCard} ${
          isRoot ? styles.rootNode : ""
        }`}
      >
        <div className={styles.nodeTop}>
          <div
            className={`${styles.nodeAvatar} ${
              active
                ? styles.activeAvatar
                : styles.inactiveAvatar
            }`}
          >
            <UserRound size={20} />
          </div>

          <div className={styles.nodeIdentity}>
            <strong>
              {member.name || "EWC Member"}
            </strong>
            <span>@{member.user_id}</span>
          </div>

          <span
            className={
              active
                ? styles.activeStatus
                : styles.inactiveStatus
            }
          >
            {active ? "Active" : "Inactive"}
          </span>
        </div>

        <div className={styles.nodeStats}>
          <div>
            <span>Package</span>
            <strong>
              {formatUsd(member.package_amount)}
            </strong>
          </div>

          <div>
            <span>Team</span>
            <strong>
              {Number(member.downline_count || 0)}
            </strong>
          </div>

          <div>
            <span>Business</span>
            <strong>
              {formatUsd(member.downline_business)}
            </strong>
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
          <div className={styles.noDownline}>
            No Downline
          </div>
        )}

        {error && (
          <div className={styles.nodeError}>
            {error}
          </div>
        )}
      </div>

      {expanded && children.length > 0 && (
        <div className={styles.childrenWrapper}>
          <div className={styles.verticalLine} />

          <div className={styles.childrenRow}>
            {children.map((child) => (
              <div
                className={styles.childBranch}
                key={child.id}
              >
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

  // ===================================================
  // ZOOM & PAN STATE
  // ===================================================

  const viewportRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);

  const [view, setView] = useState({
    scale: 1,
    x: 0,
    y: 0,
  });

  const viewRef = useRef(view);

  const updateView = (next) => {
    viewRef.current = next;
    setView(next);
  };

  // Zoom around a position within the viewport.
  const zoomAt = (nextScale, centerX, centerY) => {
    const current = viewRef.current;
    const scale = clamp(
      nextScale,
      MIN_ZOOM,
      MAX_ZOOM
    );

    const worldX =
      (centerX - current.x) / current.scale;

    const worldY =
      (centerY - current.y) / current.scale;

    updateView({
      scale,
      x: centerX - worldX * scale,
      y: centerY - worldY * scale,
    });
  };

  const changeZoom = (direction) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const current = viewRef.current;

    zoomAt(
      current.scale + direction * ZOOM_STEP,
      viewport.clientWidth / 2,
      viewport.clientHeight / 2
    );
  };

  const resetZoom = () => {
    pointersRef.current.clear();
    gestureRef.current = null;

    updateView({
      scale: 1,
      x: 0,
      y: 0,
    });
  };

  // ===================================================
  // MOBILE PINCH & PAN
  // ===================================================

  const getPointerDistance = (a, b) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const getPointerCenter = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const createGesture = () => {
    const pointers = Array.from(
      pointersRef.current.values()
    );

    const current = viewRef.current;

    if (pointers.length === 1) {
      gestureRef.current = {
        type: "pan",
        startPointer: { ...pointers[0] },
        startView: { ...current },
      };
    } else if (pointers.length >= 2) {
      const [a, b] = pointers;

      gestureRef.current = {
        type: "pinch",
        startDistance: Math.max(
          1,
          getPointerDistance(a, b)
        ),
        startCenter: getPointerCenter(a, b),
        startView: { ...current },
      };
    } else {
      gestureRef.current = null;
    }
  };

  const handlePointerDown = (event) => {
    // Mobile touchscreen gestures only.
    if (event.pointerType !== "touch") return;

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    createGesture();
  };

  const handlePointerMove = (event) => {
    if (event.pointerType !== "touch") return;

    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const gesture = gestureRef.current;
    if (!gesture) return;

    const pointers = Array.from(
      pointersRef.current.values()
    );

    // ONE FINGER: PAN
    if (
      pointers.length === 1 &&
      gesture.type === "pan"
    ) {
      const pointer = pointers[0];

      updateView({
        ...gesture.startView,
        x:
          gesture.startView.x +
          pointer.x -
          gesture.startPointer.x,
        y:
          gesture.startView.y +
          pointer.y -
          gesture.startPointer.y,
      });

      return;
    }

    // TWO FINGERS: PINCH ZOOM
    if (
      pointers.length >= 2 &&
      gesture.type === "pinch"
    ) {
      const [a, b] = pointers;

      const distance = getPointerDistance(a, b);
      const center = getPointerCenter(a, b);

      const scale = clamp(
        gesture.startView.scale *
          (distance / gesture.startDistance),
        MIN_ZOOM,
        MAX_ZOOM
      );

      const rect =
        viewportRef.current?.getBoundingClientRect();

      if (!rect) return;

      const startX =
        gesture.startCenter.x - rect.left;
      const startY =
        gesture.startCenter.y - rect.top;

      const centerX = center.x - rect.left;
      const centerY = center.y - rect.top;

      const worldX =
        (startX - gesture.startView.x) /
        gesture.startView.scale;

      const worldY =
        (startY - gesture.startView.y) /
        gesture.startView.scale;

      updateView({
        scale,
        x: centerX - worldX * scale,
        y: centerY - worldY * scale,
      });
    }
  };

  const handlePointerEnd = (event) => {
    if (event.pointerType !== "touch") return;

    pointersRef.current.delete(event.pointerId);

    createGesture();
  };

  // ===================================================
  // LOAD TREE
  // ===================================================

  useEffect(() => {
    let cancelled = false;

    const fetchTree = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/team/tree");

        if (cancelled) return;

        setRoot(response.data.data?.root || null);
        setChildren(
          response.data.data?.children || []
        );
      } catch (err) {
        if (cancelled) return;

        console.error("genealogy tree error:", err);

        setError(
          err.response?.data?.message ||
            "Unable to load community structure."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchTree();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <UserLayout
      title="Community Structure"
      subtitle="Explore your community structure"
    >
      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>
            MY TEAM
          </span>

          <h2>Community Structure</h2>

          <p>
            Expand members to explore your referral
            team level by level.
          </p>
        </div>

        <button
          className={styles.refreshButton}
          onClick={() => {
            resetZoom();
            setReloadKey((prev) => prev + 1);
          }}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </section>

      <div className={styles.infoBox}>
        <span>
          Select <strong>Expand Team</strong> on a
          member to view their direct referrals.
          On mobile, pinch to zoom and drag to move.
        </span>
      </div>

      <section className={styles.treePanel}>
        {error && (
          <div className={styles.errorBox}>
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.loadingState}>
            <span className={styles.spinner} />
            <span>Loading tree...</span>
          </div>
        ) : !root ? (
          <div className={styles.loadingState}>
            <Users size={28} />
            <strong>Team unavailable</strong>
          </div>
        ) : (
          <>
            {/* ZOOM CONTROLS */}

            <div className={styles.zoomToolbar}>
              <button
                type="button"
                onClick={() => changeZoom(-1)}
                disabled={view.scale <= MIN_ZOOM}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut size={18} />
              </button>

              <span className={styles.zoomValue}>
                {Math.round(view.scale * 100)}%
              </span>

              <button
                type="button"
                onClick={() => changeZoom(1)}
                disabled={view.scale >= MAX_ZOOM}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn size={18} />
              </button>

              <button
                type="button"
                onClick={resetZoom}
                aria-label="Reset zoom"
                title="Reset zoom"
              >
                <RotateCcw size={17} />
              </button>
            </div>

            {/* INTERACTIVE TREE VIEWPORT */}

            <div
              ref={viewportRef}
              className={styles.treeViewport}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onLostPointerCapture={handlePointerEnd}
            >
              <div
                className={styles.treeCanvas}
                style={{
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                  transformOrigin: "0 0",
                }}
              >
                <div className={styles.rootWrapper}>
                  <TreeNode
                    key={`root-${reloadKey}`}
                    member={root}
                    isRoot
                    initialChildren={children}
                  />
                </div>
              </div>
            </div>

            <p className={styles.zoomHint}>
              Use two fingers to zoom and one finger
              to move the tree.
            </p>
          </>
        )}
      </section>
    </UserLayout>
  );
};

export default NetworkTree;
