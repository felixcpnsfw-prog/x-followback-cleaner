const assert = require("node:assert/strict");
const XFBC = require("../lib/core.js");

const followers = [
  { username: "@Alice", displayName: "Alice" },
  { username: "charlie", displayName: "Charlie" }
];

const following = [
  { username: "alice", displayName: "Alice" },
  { username: "Bob", displayName: "Bob" },
  { username: "https://x.com/charlie", displayName: "Charlie" },
  { username: "Dana", displayName: "Dana" }
];

assert.equal(XFBC.normalizeUsername("@Alice"), "alice");
assert.equal(XFBC.normalizeUsername("https://twitter.com/Bob/status/123"), "bob");
assert.equal(XFBC.normalizeUsername("home"), "");

const result = XFBC.compareAccounts(followers, following, "dana");
assert.deepEqual(result.map((account) => account.username), ["Bob"]);

const csv = XFBC.accountsToCsv(result);
assert.match(csv, /^Username,Display Name,Profile URL,Status,Notes\n/);
assert.match(csv, /Bob,Bob,https:\/\/x\.com\/Bob,review,/);

console.log("extension core tests passed");
