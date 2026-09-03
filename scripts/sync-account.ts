import { syncAccount } from "../src/lib/meta/sync";
import { MetaGraphError } from "../src/lib/meta/client";
import { AD_ACCOUNT_ID } from "../src/lib/config";

const accountId = process.argv[2] ?? AD_ACCOUNT_ID;
const force = process.argv.includes("--force");

syncAccount(accountId, { force })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    if (err instanceof MetaGraphError) {
      console.error("Erro da Graph API:", err.status, err.payload?.error);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
