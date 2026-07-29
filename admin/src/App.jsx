import useStore from "./store/useStore";
import Login from "./pages/Login";
import Layout from "./components/layout/Layout";

export default function App() {
  const { user, token } = useStore();
  if (!user || !token) return <Login />;
  return <Layout />;
}
