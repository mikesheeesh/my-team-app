import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/teams/my-teams");
  }, []);
  return null;
}
