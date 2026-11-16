// android-waitlist entry point. The request handling, and why each control is there, lives in
// handler.ts (tested in handler_test.ts); this file only wires it to the real environment and fetch.
import { realEnv } from "../_shared/http.ts";
import { handleWaitlist } from "./handler.ts";

Deno.serve((req) => handleWaitlist(req, { env: realEnv, fetch: globalThis.fetch }));
