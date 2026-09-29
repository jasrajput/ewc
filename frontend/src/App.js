import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

import Login from "./pages/Login/Login";
import Register from "./pages/Register/Register";
import Dashboard from "./pages/Dashboard/Dashboard";
import Investment from "./pages/Investment/Investment";
import Income from "./pages/Income/Income";
import DirectPartners from "./pages/Network/DirectPartners";
import Community from "./pages/Network/Community";
import LevelGenealogy from "./pages/Network/LevelGenealogy";
import NetworkTree from "./pages/Network/NetworkTree";
import Rank from "./pages/Rank/Rank";

import Withdrawal from "./pages/Withdrawal/Withdrawal";
import WithdrawalHistory from "./pages/Withdrawal/WithdrawalHistory";

import Profile from "./pages/Account/Profile";
import Wallet from "./pages/Account/Wallet";
import Security from "./pages/Account/Security";
import Support from "./pages/Support/Support";
import Notifications from "./pages/Notifications/Notifications";

// Admin
import AdminLogin from "./pages/Admin/Login/AdminLogin";
import AdminDashboard from "./pages/Admin/Dashboard/AdminDashboard";
import AdminMembers from "./pages/Admin/Members/AdminMembers";
import AdminMemberDetails from "./pages/Admin/Members/AdminMemberDetails";
import AdminEditMember from "./pages/Admin/Members/AdminEditMember";
import AdminAuditLogs from "./pages/Admin/AuditLogs/AdminAuditLogs";
import AdminEarnings from "./pages/Admin/Earnings/AdminEarnings";
import AdminNetwork from "./pages/Admin/Network/AdminNetwork";
import AdminRanks from "./pages/Admin/Ranks/AdminRanks";
import AdminInvestments from "./pages/Admin/Investments/AdminInvestments";
import AdminWithdrawals from "./pages/Admin/Withdrawals/AdminWithdrawals";
import AdminClosingRuns from "./pages/Admin/ClosingRuns/AdminClosingRuns";
import AdminTransactions from "./pages/Admin/Transactions/AdminTransactions";
import AdminSupport from "./pages/Admin/Support/AdminSupport";
import AdminAnnouncements from "./pages/Admin/Announcements/AdminAnnouncements";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/register"
          element={<Register />}
        />

        <Route
          path="/"
          element={<Navigate to="/login" replace />}
        />

        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />


        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/investment" element={<Investment />} />
          <Route path="/earnings/:type" element={<Income />} />
          <Route path="/network/directs" element={<DirectPartners />} />
          <Route path="/network/community" element={<Community />} />
          <Route path="/network/levels" element={<LevelGenealogy />} />
          <Route path="/network/tree" element={<NetworkTree />} />
          <Route path="/rank" element={<Rank />} />

          <Route path="/withdrawal" element={<Withdrawal />} />
          <Route path="/withdrawal/history" element={<WithdrawalHistory />} />

          <Route path="/profile" element={<Profile />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/security" element={<Security />} />
          <Route path="/support" element={<Support />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>

        {/* =========================
            ADMIN PUBLIC
        ========================= */}

        <Route
          path="/admin/login"
          element={<AdminLogin />}
        />

        {/* =========================
            ADMIN PROTECTED
        ========================= */}

        <Route element={<AdminProtectedRoute />}>
          <Route
            path="/admin/dashboard"
            element={<AdminDashboard />}
          />

          <Route
            path="/admin/members"
            element={<AdminMembers />}
          />

          <Route
            path="/admin/members/:id"
            element={<AdminMemberDetails />}
          />

          <Route
            path="/admin/members/:id/edit"
            element={<AdminEditMember />}
          />

          <Route
            path="/admin/audit-logs"
            element={<AdminAuditLogs />}
          />

          <Route
            path="/admin/earnings"
            element={<AdminEarnings />}
          />

          <Route
            path="/admin/network"
            element={<AdminNetwork />}
          />

          <Route
            path="/admin/ranks"
            element={<AdminRanks />}
          />

          <Route
            path="/admin/investments"
            element={<AdminInvestments />}
          />

          <Route
            path="/admin/withdrawals"
            element={<AdminWithdrawals />}
          />

          <Route
            path="/admin/closing-runs"
            element={<AdminClosingRuns />}
          />

          <Route
            path="/admin/transactions"
            element={<AdminTransactions />}
          />

            <Route
            path="/admin/support"
            element={<AdminSupport />}
          />

           <Route
            path="/admin/announcements"
            element={<AdminAnnouncements />}
          />


        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;