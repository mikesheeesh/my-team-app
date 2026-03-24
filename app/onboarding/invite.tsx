import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function InviteRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, []);
  return null;
}
