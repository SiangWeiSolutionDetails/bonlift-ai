// Refuses to continue unless TEST_DATABASE_URL points at a database whose name ends with _test.
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  console.error("TEST_DATABASE_URL is not set; refusing to run test migrations.");
  process.exit(1);
}

const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));

if (!databaseName.endsWith("_test")) {
  console.error(
    `Refusing to migrate database "${databaseName}": TEST_DATABASE_URL must point at a database whose name ends with "_test".`,
  );
  process.exit(1);
}
