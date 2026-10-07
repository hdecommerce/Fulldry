import { isLoggedIn } from "@/src/session";
import Login from "./ui/Login";
import Traca from "./ui/Traca";

export const dynamic = "force-dynamic";

export default async function Page() {
  return (await isLoggedIn()) ? <Traca /> : <Login />;
}
