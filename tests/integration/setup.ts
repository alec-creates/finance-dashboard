import { loadAndAssertTestDatabase } from "../../src/server/db/load-env";

// Runs in every test worker before any test file: load only the test configuration and refuse anything else.
loadAndAssertTestDatabase();
