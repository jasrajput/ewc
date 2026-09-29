import axios from "axios";

const adminApi = axios.create({
  baseURL:
    process.env.REACT_APP_API_URL ||
    "http://localhost:5001/api",

  headers: {
    "Content-Type": "application/json",
  },
});

adminApi.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem("ewc_admin_token") ||
      sessionStorage.getItem("ewc_admin_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default adminApi;