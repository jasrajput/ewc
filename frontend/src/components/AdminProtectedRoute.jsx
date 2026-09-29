import {
  Navigate,
  Outlet,
} from "react-router-dom";

const AdminProtectedRoute = () => {
  const token =
    localStorage.getItem("ewc_admin_token") ||
    sessionStorage.getItem("ewc_admin_token");

  if (!token) {
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    );
  }

  return <Outlet />;
};

export default AdminProtectedRoute;