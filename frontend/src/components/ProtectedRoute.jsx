import { Navigate, Outlet } from "react-router-dom";

const ProtectedRoute = () => {
  const token =
    localStorage.getItem("ewc_token") ||
    sessionStorage.getItem("ewc_token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;