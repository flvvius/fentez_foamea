import { resetDatabase } from "./database";

export default async function globalSetup() {
  await resetDatabase();
}
